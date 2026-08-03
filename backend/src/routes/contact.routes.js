import { Router } from "express";
import { asyncHandler } from "../middleware/errorHandler.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import { usersRepo, toPublicUser } from "../repositories/users.js";
import { contactRequestsRepo } from "../repositories/contactRequests.js";
import { initiateContactPayment, approveContactRequest, declineContactRequest } from "../services/escrow.service.js";
import { MOMO_PROVIDERS } from "../lib/paystack.js";

const router = Router();

router.post("/", requireAuth, asyncHandler(async (req, res) => {
  const { creatorHandle, phone, provider } = req.body;
  if (!MOMO_PROVIDERS[provider]) {
    return res.status(400).json({ error: `provider must be one of: ${Object.keys(MOMO_PROVIDERS).join(", ")}` });
  }
  const creator = usersRepo.findByHandle(creatorHandle);
  if (!creator) return res.status(404).json({ error: "Creator not found" });

  const { contactRequest, charge } = await initiateContactPayment({
    payer: req.user, creator, phone, provider: MOMO_PROVIDERS[provider],
  });
  res.status(201).json({ contactRequest, charge: { reference: charge.data?.reference, display_text: charge.data?.display_text } });
}));

router.get("/sent", requireAuth, (req, res) => {
  res.json({ requests: contactRequestsRepo.sentBy(req.user.id) });
});

router.get("/received", requireAuth, (req, res) => {
  res.json({ requests: contactRequestsRepo.receivedFor(req.user.id, "paid_hold") });
});

// Reveals the creator's real contact info — only if this specific request is approved.
router.get("/:id", requireAuth, (req, res) => {
  const cr = contactRequestsRepo.findById(req.params.id);
  if (!cr) return res.status(404).json({ error: "Not found" });
  if (![cr.payerId, cr.creatorId].includes(req.user.id)) return res.status(403).json({ error: "Not a participant" });

  const payload = { ...cr };
  if (cr.status === "approved" && req.user.id === cr.payerId) {
    const creator = usersRepo.findById(cr.creatorId);
    payload.creatorContact = { email: creator.contactEmail, phone: creator.contactPhone };
  }
  res.json({ contactRequest: payload });
});

router.post("/:id/approve", requireAuth, asyncHandler(async (req, res) => {
  const updated = await approveContactRequest({ contactRequestId: req.params.id, actingUser: req.user });
  res.json({ contactRequest: updated });
}));

router.post("/:id/decline", requireAuth, asyncHandler(async (req, res) => {
  const updated = await declineContactRequest({ contactRequestId: req.params.id, actingUser: req.user });
  res.json({ contactRequest: updated });
}));

export default router;
