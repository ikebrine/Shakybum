import crypto from "crypto";
import fetch from "node-fetch";

const PAYSTACK_BASE = process.env.PAYSTACK_BASE_URL || "https://api.paystack.co";
const SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;

// Paystack MoMo provider codes per network. Ghana only for now — see
// momo_integration_guide.md for how this maps if you expand to Kenya/Nigeria.
export const MOMO_PROVIDERS = {
  mtn: "mtn",
  vodafone: "vod",
  airteltigo: "atl",
};

async function paystackRequest(path, { method = "GET", body } = {}) {
  const res = await fetch(`${PAYSTACK_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok || data.status === false) {
    const err = new Error(data.message || `Paystack request failed: ${path}`);
    err.paystack = data;
    throw err;
  }
  return data;
}

// Amounts in Paystack are always in the smallest currency unit (pesewas for GHS, kobo for NGN).
export const toSubunit = (ghsAmount) => Math.round(ghsAmount * 100);
export const fromSubunit = (subunit) => subunit / 100;

/**
 * Initiates a mobile money charge. Returns a reference to poll/webhook against,
 * and often a `display_text` telling the user to approve an STK-style prompt.
 * This is the server-side counterpart to the mock MomoPaymentModal flow.
 */
export async function initiateMomoCharge({ email, amountGHS, phone, provider, reference, metadata }) {
  return paystackRequest("/charge", {
    method: "POST",
    body: {
      email,
      amount: toSubunit(amountGHS),
      currency: "GHS",
      mobile_money: { phone, provider },
      reference,
      metadata,
    },
  });
}

export async function verifyTransaction(reference) {
  return paystackRequest(`/transaction/verify/${encodeURIComponent(reference)}`);
}

/**
 * Registers a creator's MoMo number as a transfer recipient. Call once per
 * creator (cache the recipient_code on the User row) before the first payout.
 */
export async function createTransferRecipient({ name, phone, provider }) {
  return paystackRequest("/transferrecipient", {
    method: "POST",
    body: {
      type: "mobile_money",
      name,
      account_number: phone,
      bank_code: provider, // Paystack overloads bank_code for the MoMo provider slug
      currency: "GHS",
    },
  });
}

/**
 * Releases the creator's cut. Call this only after the platform has already
 * confirmed the original charge succeeded (paid_hold) and the creator has
 * approved — never before both are true.
 */
export async function initiateTransfer({ recipientCode, amountGHS, reason, reference }) {
  return paystackRequest("/transfer", {
    method: "POST",
    body: {
      source: "balance",
      amount: toSubunit(amountGHS),
      recipient: recipientCode,
      reason,
      reference,
    },
  });
}

export async function refundTransaction({ reference, amountGHS, reason }) {
  return paystackRequest("/refund", {
    method: "POST",
    body: {
      transaction: reference,
      amount: amountGHS ? toSubunit(amountGHS) : undefined, // omit for a full refund
      merchant_note: reason,
    },
  });
}

/**
 * Paystack signs webhook bodies with HMAC-SHA512 using your secret key.
 * MUST be checked against the raw request body (before JSON parsing) or the
 * signature will never match — see server.js for how the raw body is preserved.
 */
export function verifyWebhookSignature(rawBody, signatureHeader) {
  if (!signatureHeader) return false;
  const hash = crypto.createHmac("sha512", SECRET_KEY).update(rawBody).digest("hex");
  return hash === signatureHeader;
}
