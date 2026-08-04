import { Hono } from "npm:hono@4";
import { usersRepo, toPublicUser } from "../repositories/users.ts";
import { scanContactInfo } from "../lib/contactScan.ts";
import { createTransferRecipient, MOMO_PROVIDERS } from "../lib/paystack.ts";
import { priceForContact, priceForBum, BUM_DURATIONS, BUM_OK_BADGES } from "../lib/pricing.ts";
import { postsRepo, followsRepo } from "../repositories/social.ts";
import { requireAuth } from "../middleware/auth.ts";
import type { AppEnv } from "../lib/honoTypes.ts";

const app = new Hono<AppEnv>();

async function withCounts(user: any) {
  const [movesCount, followersCount, followingCount] = await Promise.all([
    postsRepo.countByUser(user.id),
    followsRepo.followerCount(user.id),
    followsRepo.followingCount(user.id),
  ]);
  return { ...toPublicUser(user), movesCount, followersCount, followingCount };
}

app.get("/", requireAuth, async (c) => {
  const me = c.get("user");
  const all = await usersRepo.list();
  const users = all.filter((u: any) => u.id !== me.id);
  const withData = await Promise.all(users.map(async (u: any) => ({
    ...(await withCounts(u)),
    contactPrice: priceForContact(u.badge),
    canBum: BUM_OK_BADGES.includes(u.badge) && u.bumEnabled,
    bumPrices: BUM_OK_BADGES.includes(u.badge) && u.bumEnabled
      ? Object.fromEntries(BUM_DURATIONS.map((m) => [m, priceForBum(u.badge, m)]))
      : null,
  })));
  return c.json({ users: withData });
});

app.get("/:handle", requireAuth, async (c) => {
  const user = await usersRepo.findByHandle(c.req.param("handle") ?? "");
  if (!user) return c.json({ error: "User not found" }, 404);
  return c.json({ user: await withCounts(user), contactPrice: priceForContact(user.badge) });
});

app.patch("/me", requireAuth, async (c) => {
  const me = c.get("user");
  const { name, bio, handle, videoUrl } = await c.req.json();

  if (bio !== undefined) {
    const flag = scanContactInfo(bio);
    if (flag.flagged) return c.json({ error: `Bio can't include ${flag.reason}` }, 400);
  }
  if (handle !== undefined) {
    const flag = scanContactInfo(handle);
    if (flag.flagged) return c.json({ error: `Username can't include ${flag.reason}` }, 400);
    const existing = await usersRepo.findByHandle(handle);
    if (existing && existing.id !== me.id) return c.json({ error: "Handle already taken" }, 409);
  }
  // videoUrl should only ever be a URL our own /media/upload endpoint just
  // returned — this isn't arbitrary user text, so no contact-info scan
  // needed here, just a sanity check it's actually a URL and not junk.
  if (videoUrl !== undefined && videoUrl !== null && !/^https?:\/\//.test(videoUrl)) {
    return c.json({ error: "videoUrl must be a valid URL" }, 400);
  }

  const updated = await usersRepo.updateProfile(me.id, { name, bio, handle, videoUrl });
  return c.json({ user: toPublicUser(updated) });
});

// Real contact info (email/phone) shown to a payer only after their request is
// approved — see routes/contact.routes.ts GET /:id which checks this.
app.put("/me/contact-info", requireAuth, async (c) => {
  const me = c.get("user");
  const { contactEmail, contactPhone } = await c.req.json();
  const updated = await usersRepo.updateContactInfo(me.id, { contactEmail, contactPhone });
  return c.json({ user: toPublicUser(updated) });
});

// Registers where a creator's payout goes. Required before they can approve
// any paid contact/Live Bum request — see escrow.service.ts releaseCreatorPayout.
app.post("/me/payout-destination", requireAuth, async (c) => {
  const me = c.get("user");
  const { payoutPhone, payoutProvider } = await c.req.json();
  if (!payoutPhone || !MOMO_PROVIDERS[payoutProvider]) {
    return c.json({ error: `payoutProvider must be one of: ${Object.keys(MOMO_PROVIDERS).join(", ")}` }, 400);
  }
  const recipient = await createTransferRecipient({
    name: me.name,
    phone: payoutPhone,
    provider: MOMO_PROVIDERS[payoutProvider],
  });
  const updated = await usersRepo.updatePayoutDestination(me.id, {
    payoutPhone,
    payoutProvider,
    paystackRecipientCode: recipient.data.recipient_code,
  });
  return c.json({ user: toPublicUser(updated) });
});

// Creator opts in/out of offering Live Bum sessions. Gated on badge tier —
// badge itself isn't self-settable (reputation/activity system, see README).
app.patch("/me/bum-settings", requireAuth, async (c) => {
  const me = c.get("user");
  const { bumEnabled } = await c.req.json();
  if (bumEnabled && !BUM_OK_BADGES.includes(me.badge)) {
    return c.json({ error: `Live Bum sessions require Silver Queen badge or higher (currently: ${me.badge})` }, 403);
  }
  const updated = await usersRepo.updateBumEnabled(me.id, !!bumEnabled);
  return c.json({ user: toPublicUser(updated) });
});

export default app;
