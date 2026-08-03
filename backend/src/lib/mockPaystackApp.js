// Factory for the mock Paystack app — used both by scripts/mock-paystack-server.js
// (manual local testing, realistic delays) and the automated test suite
// (fast delays, ephemeral port). NOT for production use.
import express from "express";
import crypto from "crypto";
import fetch from "node-fetch";

export function createMockPaystackApp({ webhookUrl, secretKey, autoSucceed = true, delayMs = 600 }) {
  const app = express();
  app.use(express.json());

  function signedWebhookBody(event) {
    const body = JSON.stringify(event);
    const signature = crypto.createHmac("sha512", secretKey).update(body).digest("hex");
    return { body, signature };
  }

  async function fireWebhook(event) {
    const { body, signature } = signedWebhookBody(event);
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-paystack-signature": signature },
      body,
    });
  }

  app.post("/charge", (req, res) => {
    const { reference, amount } = req.body;
    res.json({ status: true, data: { reference, status: "pay_offline", display_text: "Approve the prompt on your phone" } });
    if (autoSucceed) {
      setTimeout(() => fireWebhook({ event: "charge.success", data: { reference, status: "success", amount, currency: "GHS" } }), delayMs);
    }
  });

  app.post("/transferrecipient", (req, res) => {
    res.json({ status: true, data: { recipient_code: `RCP_mock_${crypto.randomBytes(6).toString("hex")}` } });
  });

  app.post("/transfer", (req, res) => {
    const { reference, amount } = req.body;
    res.json({ status: true, data: { reference, status: "pending" } });
    if (autoSucceed) {
      setTimeout(() => fireWebhook({ event: "transfer.success", data: { reference, status: "success", amount } }), delayMs);
    }
  });

  app.post("/refund", (req, res) => {
    const { transaction, merchant_note } = req.body;
    res.json({ status: true, data: { transaction, status: "processing" } });
    if (autoSucceed) {
      setTimeout(() => fireWebhook({ event: "refund.processed", data: { transaction: { reference: transaction }, merchant_note } }), delayMs);
    }
  });

  app.get("/transaction/verify/:ref", (req, res) => {
    res.json({ status: true, data: { reference: req.params.ref, status: "success" } });
  });

  return app;
}
