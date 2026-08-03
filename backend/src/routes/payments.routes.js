import { Router } from "express";
import { verifyWebhookSignature } from "../lib/paystack.js";
import { handleChargeSuccess, handleTransferSuccess, handleTransferFailed, handleRefundProcessed } from "../services/escrow.service.js";

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
  // since every handler below is idempotent (checks current status first).
  res.status(200).json({ received: true });

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
        // Assumes data.transaction.reference per Paystack's documented shape —
        // see the NOTE in escrow.service.js above handleRefundProcessed.
        await handleRefundProcessed(event.data.transaction?.reference || event.data.reference);
        break;
      default:
        // Unhandled event types are expected — Paystack sends many we don't
        // act on (e.g. subscription events). Not an error.
        break;
    }
  } catch (err) {
    console.error(`Error handling ${event.event} webhook:`, err);
  }
});

export default router;
