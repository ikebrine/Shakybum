import { Hono } from "npm:hono@4";
import { followsRepo } from "../repositories/social.ts";
import { usersRepo, toPublicUser } from "../repositories/users.ts";
import { notificationsRepo } from "../repositories/misc.ts";
import { recomputeBadge } from "../services/badge.service.ts";
import { requireAuth } from "../middleware/auth.ts";
import type { AppEnv } from "../lib/honoTypes.ts";

const app = new Hono<AppEnv>();

// followsRepo's joined queries return raw snake_case DB rows — bring them
// into the same camelCase shape so toPublicUser can be reused.
function mapUserRow(row: any) {
  return {
    id: row.id, email: row.email, handle: row.handle, name: row.name, passwordHash: row.password_hash,
    bio: row.bio, avatarEmoji: row.avatar_emoji, badge: row.badge, bumEnabled: !!row.bum_enabled,
    allowDownload: !!row.allow_download, contactEmail: row.contact_email, contactPhone: row.contact_phone,
    payoutPhone: row.payout_phone, payoutProvider: row.payout_provider, paystackRecipientCode: row.paystack_recipient_code,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

app.post("/:userId/follow", requireAuth, async (c) => {
  const me = c.get("user");
  const target = await usersRepo.findById(c.req.param("userId") ?? "");
  if (!target) return c.json({ error: "User not found" }, 404);
  if (target.id === me.id) return c.json({ error: "Can't follow yourself" }, 400);

  const added = await followsRepo.follow(me.id, target.id);
  if (added) {
    await recomputeBadge(target.id);
    await notificationsRepo.create({ userId: target.id, type: "new_follower", text: `${me.name} started following you.` });
  }
  return c.json({ following: true, followerCount: await followsRepo.followerCount(target.id) });
});

app.delete("/:userId/follow", requireAuth, async (c) => {
  const target = await usersRepo.findById(c.req.param("userId") ?? "");
  if (!target) return c.json({ error: "User not found" }, 404);
  const me = c.get("user");

  await followsRepo.unfollow(me.id, target.id);
  await recomputeBadge(target.id);
  return c.json({ following: false, followerCount: await followsRepo.followerCount(target.id) });
});

app.get("/:userId/followers", requireAuth, async (c) => {
  const rows = await followsRepo.followers(c.req.param("userId") ?? "");
  return c.json({ followers: rows.map((u: any) => toPublicUser(mapUserRow(u))) });
});

app.get("/:userId/following", requireAuth, async (c) => {
  const rows = await followsRepo.following(c.req.param("userId") ?? "");
  return c.json({ following: rows.map((u: any) => toPublicUser(mapUserRow(u))) });
});

export default app;
