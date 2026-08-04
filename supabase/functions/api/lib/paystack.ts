import crypto from "node:crypto";

// Read lazily (not as module-level consts) — same reasoning as the Node
// backend: keeps this overridable for local testing after the module has
// already loaded (see the Node version's src/lib/paystack.js for the full
// explanation of why that ordering matters for tests).
const paystackBase = () => Deno.env.get("PAYSTACK_BASE_URL") || "https://api.paystack.co";
const secretKey = () => Deno.env.get("PAYSTACK_SECRET_KEY") ?? "";

export const MOMO_PROVIDERS: Record<string, string> = {
  mtn: "mtn",
  vodafone: "vod",
  airteltigo: "atl",
};

async function paystackRequest(path: string, opts: { method?: string; body?: unknown } = {}) {
  const { method = "GET", body } = opts;
  const res = await fetch(`${paystackBase()}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${secretKey()}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok || data.status === false) {
    const err = new Error(data.message || `Paystack request failed: ${path}`);
    (err as any).paystack = data;
    throw err;
  }
  return data;
}

export const toSubunit = (ghsAmount: number) => Math.round(ghsAmount * 100);
export const fromSubunit = (subunit: number) => subunit / 100;

export async function initiateMomoCharge(opts: {
  email: string; amountGHS: number; phone: string; provider: string; reference: string; metadata?: unknown;
}) {
  const { email, amountGHS, phone, provider, reference, metadata } = opts;
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

export async function verifyTransaction(reference: string) {
  return paystackRequest(`/transaction/verify/${encodeURIComponent(reference)}`);
}

export async function createTransferRecipient(opts: { name: string; phone: string; provider: string }) {
  const { name, phone, provider } = opts;
  return paystackRequest("/transferrecipient", {
    method: "POST",
    body: { type: "mobile_money", name, account_number: phone, bank_code: provider, currency: "GHS" },
  });
}

export async function initiateTransfer(opts: { recipientCode: string; amountGHS: number; reason: string; reference: string }) {
  const { recipientCode, amountGHS, reason, reference } = opts;
  return paystackRequest("/transfer", {
    method: "POST",
    body: { source: "balance", amount: toSubunit(amountGHS), recipient: recipientCode, reason, reference },
  });
}

export async function refundTransaction(opts: { reference: string; amountGHS?: number; reason?: string }) {
  const { reference, amountGHS, reason } = opts;
  return paystackRequest("/refund", {
    method: "POST",
    body: { transaction: reference, amount: amountGHS ? toSubunit(amountGHS) : undefined, merchant_note: reason },
  });
}

export function verifyWebhookSignature(rawBody: string, signatureHeader: string | null) {
  if (!signatureHeader) return false;
  const hash = crypto.createHmac("sha512", secretKey()).update(rawBody).digest("hex");
  return hash === signatureHeader;
}
