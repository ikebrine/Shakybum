import { Router } from "express";
import { asyncHandler } from "../middleware/errorHandler.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import { followsRepo } from "../repositories/social.js";
import { usersRepo, toPublicUser } from "../repositories/users.js";
import { notificationsRepo } from "../repositories/misc.js";
import { recomputeBadge } from "../services/badge.service.js";

const router = Router();

router.post("/:userId/follow", requireAuth, asyncHandler(async (req, res) => {
  const target = await usersRepo.findById(req.params.userId);
  if (!target) return res.status(404).json({ error: "User not found" });
  if (target.id === req.user.id) return res.status(400).json({ error: "Can't follow yourself" });

  const added = await followsRepo.follow(req.user.id, target.id);
  if (added) {
    await recomputeBadge(target.id); // follower count changed — may push the followee past a badge threshold
    await notificationsRepo.create({ userId: target.id, type: "new_follower", text: `${req.user.name} started following you.` });
  }
  res.json({ following: true, followerCount: await followsRepo.followerCount(target.id) });
}));

router.delete("/:userId/follow", requireAuth, asyncHandler(async (req, res) => {
  const target = await usersRepo.findById(req.params.userId);
  if (!target) return res.status(404).json({ error: "User not found" });

  await followsRepo.unfollow(req.user.id, target.id);
  await recomputeBadge(target.id); // may drop the followee back below a threshold
  res.json({ following: false, followerCount: await followsRepo.followerCount(target.id) });
}));

router.get("/:userId/followers", requireAuth, asyncHandler(async (req, res) => {
  const rows = await followsRepo.followers(req.params.userId);
  res.json({ followers: rows.map((u) => toPublicUser(mapUserRow(u))) });
}));

router.get("/:userId/following", requireAuth, asyncHandler(async (req, res) => {
  const rows = await followsRepo.following(req.params.userId);
  res.json({ following: rows.map((u) => toPublicUser(mapUserRow(u))) });
}));

// followsRepo's joined queries return raw snake_case DB rows (not run through
// usersRepo's toUser mapper) — this brings them into the same camelCase shape
// so toPublicUser can be reused instead of duplicating its field list here.
function mapUserRow(row) {
  return {
    id: row.id, email: row.email, handle: row.handle, name: row.name, passwordHash: row.password_hash,
    bio: row.bio, avatarEmoji: row.avatar_emoji, badge: row.badge, bumEnabled: !!row.bum_enabled,
    allowDownload: !!row.allow_download, contactEmail: row.contact_email, contactPhone: row.contact_phone,
    payoutPhone: row.payout_phone, payoutProvider: row.payout_provider, paystackRecipientCode: row.paystack_recipient_code,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

export default router;
