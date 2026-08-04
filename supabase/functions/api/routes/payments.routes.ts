import { Hono } from "npm:hono@4";
import { verifyWebhookSignature } from "../lib/paystack.ts";
import { handleChargeSuccess, handleTransferSuccess, handleTransferFailed, handleRefundProcessed } from "../services/escrow.service.ts";

const app = new Hono();

// Raw body (not c.req.json()) is required for signature verification —
// Paystack's signature is computed over the exact raw bytes, and
// re-serializing parsed JSON would not match.
app.post("/paystack", async (c) => {
  const signature = c.req.header("x-paystack-signature") ?? null;
  const rawBody = await c.req.text();

  if (!verifyWebhookSignature(rawBody, signature)) {
    return c.json({ error: "Invalid webhook signature" }, 401);
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  // Process before responding — unlike a traditional server, an Edge
  // Function's execution context can end the moment a response is sent,
  // so (unlike the Node backend's "respond 200 first, then process"
  // pattern) we deliberately await this BEFORE responding here. Paystack's
  // retry-on-timeout behavior is the safety net if this takes too long,
  // same as it would be for any slow webhook consumer.
  try {
    switch (event.event) {
      case "charge.success":
        await handleChargeSuccess(event.data.reference);
        break;
      case "transfer.success":
        await handleTransferSuccess(event.data.reference);
        break;
      case "transfer.failed":
      case "transfer.reversed":
        await handleTransferFailed(event.data.reference, event.data.reason || event.data.failure_reason);
        break;
      case "refund.processed":
        await handleRefundProcessed(event.data.transaction?.reference || event.data.reference);
        break;
      default:
        // Unhandled event types are expected — Paystack sends many we don't act on.
        break;
    }
  } catch (err) {
    console.error(`Error handling ${event.event} webhook:`, err);
    // Still return 200 — we don't want Paystack to keep retrying a webhook
    // that failed for a reason retrying won't fix (e.g. a bug), and the
    // idempotent status checks in each handler mean a legitimate retry
    // (transient DB error, etc.) is safe to re-deliver on Paystack's own
    // retry schedule regardless of what we return here.
  }

  return c.json({ received: true });
});

export default app;
