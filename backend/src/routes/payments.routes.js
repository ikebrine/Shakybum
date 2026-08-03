import { Router } from "express";
import { verifyWebhookSignature } from "../lib/paystack.js";
import { handleChargeSuccess } from "../services/escrow.service.js";

const router = Router();

// IMPORTANT: this route is mounted with express.raw() in server.js, NOT
// express.json() — Paystack's signature is computed over the exact raw bytes
// of the request body, and re-serializing parsed JSON will not match.
router.post("/paystack", async (req, res) => {
  const signature = req.headers["x-paystack-signature"];
  const rawBody = req.body; // Buffer, thanks to express.raw()

  if (!verifyWebhookSignature(rawBody, signature)) {
    return res.status(401).json({ error: "Invalid webhook signature" });
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString("utf-8"));
  } catch {
    return res.status(400).json({ error: "Invalid JSON body" });
  }

  // Always 200 quickly — Paystack retries on non-2xx, and slow/failing
  // responses here just cause duplicate retries, not correctness issues,
  // since handleChargeSuccess is idempotent.
  res.status(200).json({ received: true });

  if (event.event === "charge.success") {
    try {
      await handleChargeSuccess(event.data.reference);
    } catch (err) {
      console.error("Error handling charge.success webhook:", err);
    }
  }
  // Other event types (transfer.success, transfer.failed, refund.processed)
  // are worth handling too in production — logged here as a reminder, not
  // wired up, since the happy-path transfer/refund calls in escrow.service.js
  // already treat a non-2xx Paystack response as a thrown error synchronously.
});

export default router;
