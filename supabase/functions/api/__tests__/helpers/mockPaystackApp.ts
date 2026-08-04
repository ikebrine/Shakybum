// Deno-native mock Paystack — a small Hono app mimicking just enough of
// Paystack's API surface (charge, transferrecipient, transfer, refund) to
// exercise the real backend code path end-to-end, including firing a real
// signed charge.success/transfer.success/refund.processed webhook back at
// the app under test — the same way Paystack does once a user approves the
// MoMo prompt on their phone. Runs in-process alongside the app being
// tested (both via Deno.serve on ephemeral ports within the same test —
// no subprocess spawning, which sidesteps this sandbox's background-process
// quirks entirely for tests).
import { Hono } from "npm:hono@4";
import crypto from "node:crypto";

export function createMockPaystackApp(opts: { webhookUrl: string; secretKey: string; autoSucceed?: boolean; delayMs?: number }) {
  const { webhookUrl, secretKey, autoSucceed = true, delayMs = 20 } = opts;
  const app = new Hono();

  function sign(event: unknown) {
    const body = JSON.stringify(event);
    const signature = crypto.createHmac("sha512", secretKey).update(body).digest("hex");
    return { body, signature };
  }

  async function fireWebhook(event: unknown) {
    const { body, signature } = sign(event);
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-paystack-signature": signature },
      body,
    });
  }

  app.post("/charge", async (c) => {
    const { reference, amount } = await c.req.json();
    if (autoSucceed) {
      setTimeout(() => fireWebhook({ event: "charge.success", data: { reference, status: "success", amount, currency: "GHS" } }), delayMs);
    }
    return c.json({ status: true, data: { reference, status: "pay_offline", display_text: "Approve the prompt on your phone" } });
  });

  app.post("/transferrecipient", (c) => {
    return c.json({ status: true, data: { recipient_code: `RCP_mock_${crypto.randomBytes(6).toString("hex")}` } });
  });

  app.post("/transfer", async (c) => {
    const { reference, amount } = await c.req.json();
    if (autoSucceed) {
      setTimeout(() => fireWebhook({ event: "transfer.success", data: { reference, status: "success", amount } }), delayMs);
    }
    return c.json({ status: true, data: { reference, status: "pending" } });
  });

  app.post("/refund", async (c) => {
    const { transaction, merchant_note } = await c.req.json();
    if (autoSucceed) {
      setTimeout(() => fireWebhook({ event: "refund.processed", data: { transaction: { reference: transaction }, merchant_note } }), delayMs);
    }
    return c.json({ status: true, data: { transaction, status: "processing" } });
  });

  app.get("/transaction/verify/:ref", (c) => {
    return c.json({ status: true, data: { reference: c.req.param("ref"), status: "success" } });
  });

  return app;
}
