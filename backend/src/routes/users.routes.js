import { Router } from "express";
import { asyncHandler } from "../middleware/errorHandler.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import { usersRepo, toPublicUser } from "../repositories/users.js";
import { scanContactInfo } from "../lib/contactScan.js";
import { createTransferRecipient, MOMO_PROVIDERS } from "../lib/paystack.js";
import { priceForContact, priceForBum, BUM_DURATIONS, BUM_OK_BADGES } from "../lib/pricing.js";
import { postsRepo, followsRepo } from "../repositories/social.js";

const router = Router();

// Attaches real activity counts a user list needs for display (badge
// context, "X followers" etc) — separate from toPublicUser since those
// counts aren't stored on the user row itself (see repositories/social.js).
async function withCounts(user) {
  const [movesCount, followersCount, followingCount] = await Promise.all([
    postsRepo.countByUser(user.id),
    followsRepo.followerCount(user.id),
    followsRepo.followingCount(user.id),
  ]);
  return { ...toPublicUser(user), movesCount, followersCount, followingCount };
}

router.get("/", requireAuth, asyncHandler(async (req, res) => {
  const all = await usersRepo.list();
  const users = all.filter((u) => u.id !== req.user.id);
  const withData = await Promise.all(users.map(async (u) => ({
    ...(await withCounts(u)),
    contactPrice: priceForContact(u.badge),
    canBum: BUM_OK_BADGES.includes(u.badge) && u.bumEnabled,
    bumPrices: BUM_OK_BADGES.includes(u.badge) && u.bumEnabled
      ? Object.fromEntries(BUM_DURATIONS.map((m) => [m, priceForBum(u.badge, m)]))
      : null,
  })));
  res.json({ users: withData });
}));

router.get("/:handle", requireAuth, asyncHandler(async (req, res) => {
  const user = await usersRepo.findByHandle(req.params.handle);
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({ user: await withCounts(user), contactPrice: priceForContact(user.badge) });
}));

router.patch("/me", requireAuth, asyncHandler(async (req, res) => {
  const { name, bio, handle } = req.body;

  if (bio !== undefined) {
    const flag = scanContactInfo(bio);
    if (flag.flagged) return res.status(400).json({ error: `Bio can't include ${flag.reason}` });
  }
  if (handle !== undefined) {
    const flag = scanContactInfo(handle);
    if (flag.flagged) return res.status(400).json({ error: `Username can't include ${flag.reason}` });
    const existing = await usersRepo.findByHandle(handle);
    if (existing && existing.id !== req.user.id) return res.status(409).json({ error: "Handle already taken" });
  }

  const updated = await usersRepo.updateProfile(req.user.id, { name, bio, handle });
  res.json({ user: toPublicUser(updated) });
}));

// Real contact info (email/phone) shown to a payer only after their request is
// approved — see routes/contact.routes.js GET /:id which checks this.
router.put("/me/contact-info", requireAuth, asyncHandler(async (req, res) => {
  const { contactEmail, contactPhone } = req.body;
  const updated = await usersRepo.updateContactInfo(req.user.id, { contactEmail, contactPhone });
  res.json({ user: toPublicUser(updated) });
}));

// Registers where a creator's payout goes. Required before they can approve
// any paid contact/Live Bum request — see escrow.service.js releaseCreatorPayout.
router.post("/me/payout-destination", requireAuth, asyncHandler(async (req, res) => {
  const { payoutPhone, payoutProvider } = req.body;
  if (!payoutPhone || !MOMO_PROVIDERS[payoutProvider]) {
    return res.status(400).json({ error: `payoutProvider must be one of: ${Object.keys(MOMO_PROVIDERS).join(", ")}` });
  }
  const recipient = await createTransferRecipient({
    name: req.user.name,
    phone: payoutPhone,
    provider: MOMO_PROVIDERS[payoutProvider],
  });
  const updated = await usersRepo.updatePayoutDestination(req.user.id, {
    payoutPhone,
    payoutProvider,
    paystackRecipientCode: recipient.data.recipient_code,
  });
  res.json({ user: toPublicUser(updated) });
}));

// Creator opts in/out of offering Live Bum sessions. Gated on badge tier — badge
// itself isn't self-settable (it should reflect a reputation/activity system
// that isn't part of this backend's scope yet; see README "Known gaps").
router.patch("/me/bum-settings", requireAuth, asyncHandler(async (req, res) => {
  const { bumEnabled } = req.body;
  if (bumEnabled && !BUM_OK_BADGES.includes(req.user.badge)) {
    return res.status(403).json({ error: `Live Bum sessions require Silver Queen badge or higher (currently: ${req.user.badge})` });
  }
  const updated = await usersRepo.updateBumEnabled(req.user.id, !!bumEnabled);
  res.json({ user: toPublicUser(updated) });
}));

export default router;
