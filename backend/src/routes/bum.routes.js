import { Router } from "express";
import { asyncHandler } from "../middleware/errorHandler.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import { usersRepo } from "../repositories/users.js";
import { bumSessionsRepo } from "../repositories/bumSessions.js";
import { withRemainingSec } from "../lib/bumTime.js";
import { BUM_DURATIONS, BUM_OK_BADGES } from "../lib/pricing.js";
import { MOMO_PROVIDERS } from "../lib/paystack.js";
import {
  initiateBumPayment, initiateBumExtension,
  approveBumSession, declineBumSession, startBumSession, endBumSession,
} from "../services/escrow.service.js";

const router = Router();

router.post("/", requireAuth, asyncHandler(async (req, res) => {
  const { creatorHandle, mins, phone, provider } = req.body;
  if (!BUM_DURATIONS.includes(mins)) {
    return res.status(400).json({ error: `mins must be one of: ${BUM_DURATIONS.join(", ")}` });
  }
  if (!MOMO_PROVIDERS[provider]) {
    return res.status(400).json({ error: `provider must be one of: ${Object.keys(MOMO_PROVIDERS).join(", ")}` });
  }
  const creator = usersRepo.findByHandle(creatorHandle);
  if (!creator) return res.status(404).json({ error: "Creator not found" });
  if (!BUM_OK_BADGES.includes(creator.badge) || !creator.bumEnabled) {
    return res.status(400).json({ error: "This creator isn't offering Bum sessions" });
  }

  const { bumSession, charge } = await initiateBumPayment({
    payer: req.user, creator, mins, phone, provider: MOMO_PROVIDERS[provider],
  });
  res.status(201).json({ bumSession, charge: { reference: charge.data?.reference, display_text: charge.data?.display_text } });
}));

router.get("/sent", requireAuth, (req, res) => {
  res.json({ sessions: bumSessionsRepo.sentBy(req.user.id).map(withRemainingSec) });
});

router.get("/received", requireAuth, (req, res) => {
  res.json({ sessions: bumSessionsRepo.receivedFor(req.user.id, "paid_hold") });
});

router.get("/active", requireAuth, (req, res) => {
  res.json({ sessions: bumSessionsRepo.activeOrApprovedFor(req.user.id).map(withRemainingSec) });
});

router.get("/:id", requireAuth, (req, res) => {
  const bs = bumSessionsRepo.findById(req.params.id);
  if (!bs) return res.status(404).json({ error: "Not found" });
  if (![bs.payerId, bs.creatorId].includes(req.user.id)) return res.status(403).json({ error: "Not a participant" });
  res.json({ bumSession: withRemainingSec(bs) });
});

router.post("/:id/approve", requireAuth, asyncHandler(async (req, res) => {
  const updated = await approveBumSession({ bumSessionId: req.params.id, actingUser: req.user });
  res.json({ bumSession: updated });
}));

router.post("/:id/decline", requireAuth, asyncHandler(async (req, res) => {
  const updated = await declineBumSession({ bumSessionId: req.params.id, actingUser: req.user });
  res.json({ bumSession: updated });
}));

router.post("/:id/start", requireAuth, asyncHandler(async (req, res) => {
  const updated = await startBumSession({ bumSessionId: req.params.id, actingUser: req.user });
  res.json({ bumSession: withRemainingSec(updated) });
}));

router.post("/:id/end", requireAuth, asyncHandler(async (req, res) => {
  const updated = await endBumSession({ bumSessionId: req.params.id, actingUser: req.user });
  res.json({ bumSession: updated });
}));

router.post("/:id/extend", requireAuth, asyncHandler(async (req, res) => {
  const bs = bumSessionsRepo.findById(req.params.id);
  if (!bs) return res.status(404).json({ error: "Not found" });
  if (![bs.payerId, bs.creatorId].includes(req.user.id)) return res.status(403).json({ error: "Not a participant" });

  const { phone, provider } = req.body;
  if (!MOMO_PROVIDERS[provider]) {
    return res.status(400).json({ error: `provider must be one of: ${Object.keys(MOMO_PROVIDERS).join(", ")}` });
  }
  const { extension, charge } = await initiateBumExtension({ bumSession: bs, payer: req.user, phone, provider: MOMO_PROVIDERS[provider] });
  res.status(201).json({ extension, charge: { reference: charge.data?.reference, display_text: charge.data?.display_text } });
}));

export default router;
