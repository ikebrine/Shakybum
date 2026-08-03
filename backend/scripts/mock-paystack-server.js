// Mock Paystack server for local dev/testing — NOT for production use.
//
// Mimics just enough of Paystack's API surface to exercise the real backend
// code path end-to-end: charge initiation, transfer recipient creation,
// payouts, refunds, and — critically — fires a real signed `charge.success`
// webhook back at the backend a moment after a charge is initiated, the same
// way Paystack does once a user approves the MoMo prompt on their phone.
//
// Usage: PAYSTACK_SECRET_KEY=<same as backend .env> node scripts/mock-paystack-server.js
import express from "express";
import crypto from "crypto";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

const SECRET = process.env.PAYSTACK_SECRET_KEY;
const WEBHOOK_URL = process.env.BACKEND_WEBHOOK_URL || "http://localhost:4000/api/webhooks/paystack";
const AUTO_SUCCEED = process.env.MOCK_PAYSTACK_AUTOSUCCEED !== "false"; // set to "false" to test the pending/never-confirmed path

function signedWebhookBody(event) {
  const body = JSON.stringify(event);
  const signature = crypto.createHmac("sha512", SECRET).update(body).digest("hex");
  return { body, signature };
}

async function fireChargeSuccessWebhook(reference, amountSubunit) {
  const event = {
    event: "charge.success",
    data: { reference, status: "success", amount: amountSubunit, currency: "GHS" },
  };
  const { body, signature } = signedWebhookBody(event);
  try {
    await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-paystack-signature": signature },
      body,
    });
    console.log(`[mock-paystack] fired charge.success webhook for ${reference}`);
  } catch (err) {
    console.error(`[mock-paystack] failed to deliver webhook for ${reference}:`, err.message);
  }
}

app.post("/charge", async (req, res) => {
  const { reference, amount } = req.body;
  console.log(`[mock-paystack] charge initiated: ${reference} for ${amount} pesewas`);
  res.json({
    status: true,
    message: "Charge attempted",
    data: { reference, status: "pay_offline", display_text: "Approve the prompt on your phone" },
  });
  if (AUTO_SUCCEED) {
    // Real Paystack/MoMo confirmation takes seconds (user has to approve an
    // STK-style prompt) — short delay here mirrors that instead of resolving
    // synchronously, which would mask any race-condition bugs in the webhook handler.
    setTimeout(() => fireChargeSuccessWebhook(reference, amount), 800);
  }
});

app.post("/transferrecipient", (req, res) => {
  const code = `RCP_mock_${crypto.randomBytes(6).toString("hex")}`;
  console.log(`[mock-paystack] transfer recipient created: ${code}`);
  res.json({ status: true, data: { recipient_code: code } });
});

app.post("/transfer", (req, res) => {
  console.log(`[mock-paystack] transfer: GHS ${(req.body.amount / 100).toFixed(2)} to ${req.body.recipient} (${req.body.reason})`);
  res.json({ status: true, data: { reference: req.body.reference, status: "success" } });
});

app.post("/refund", (req, res) => {
  console.log(`[mock-paystack] refund issued for transaction ${req.body.transaction}`);
  res.json({ status: true, data: { transaction: req.body.transaction, status: "processed" } });
});

app.get("/transaction/verify/:ref", (req, res) => {
  res.json({ status: true, data: { reference: req.params.ref, status: "success" } });
});

const PORT = process.env.MOCK_PAYSTACK_PORT || 5555;
app.listen(PORT, () => console.log(`[mock-paystack] listening on :${PORT}, webhooks -> ${WEBHOOK_URL}`));
