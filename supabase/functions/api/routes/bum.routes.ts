import { Hono } from "npm:hono@4";
import { usersRepo } from "../repositories/users.ts";
import { bumSessionsRepo } from "../repositories/bumSessions.ts";
import { withRemainingSec } from "../lib/bumTime.ts";
import { BUM_DURATIONS, BUM_OK_BADGES } from "../lib/pricing.ts";
import { MOMO_PROVIDERS } from "../lib/paystack.ts";
import {
  initiateBumPayment, initiateBumExtension,
  approveBumSession, declineBumSession, startBumSession, endBumSession,
} from "../services/escrow.service.ts";
import { requireAuth } from "../middleware/auth.ts";
import type { AppEnv } from "../lib/honoTypes.ts";

const app = new Hono<AppEnv>();

app.post("/", requireAuth, async (c) => {
  const me = c.get("user");
  const { creatorHandle, mins, phone, provider } = await c.req.json();
  if (!BUM_DURATIONS.includes(mins)) {
    return c.json({ error: `mins must be one of: ${BUM_DURATIONS.join(", ")}` }, 400);
  }
  if (!MOMO_PROVIDERS[provider]) {
    return c.json({ error: `provider must be one of: ${Object.keys(MOMO_PROVIDERS).join(", ")}` }, 400);
  }
  const creator = await usersRepo.findByHandle(creatorHandle ?? "");
  if (!creator) return c.json({ error: "Creator not found" }, 404);
  if (!BUM_OK_BADGES.includes(creator.badge) || !creator.bumEnabled) {
    return c.json({ error: "This creator isn't offering Live Bum sessions" }, 400);
  }

  const { bumSession, charge } = await initiateBumPayment({
    payer: me, creator, mins, phone, provider: MOMO_PROVIDERS[provider],
  });
  return c.json({ bumSession, charge: { reference: charge.data?.reference, display_text: charge.data?.display_text } }, 201);
});

app.get("/sent", requireAuth, async (c) => {
  const me = c.get("user");
  const sessions = await bumSessionsRepo.sentBy(me.id);
  return c.json({ sessions: sessions.map(withRemainingSec) });
});

app.get("/received", requireAuth, async (c) => {
  const me = c.get("user");
  return c.json({ sessions: await bumSessionsRepo.receivedFor(me.id, "paid_hold") });
});

app.get("/active", requireAuth, async (c) => {
  const me = c.get("user");
  const sessions = await bumSessionsRepo.activeOrApprovedFor(me.id);
  return c.json({ sessions: sessions.map(withRemainingSec) });
});

app.get("/:id", requireAuth, async (c) => {
  const me = c.get("user");
  const bs = await bumSessionsRepo.findById(c.req.param("id") ?? "");
  if (!bs) return c.json({ error: "Not found" }, 404);
  if (![bs.payerId, bs.creatorId].includes(me.id)) return c.json({ error: "Not a participant" }, 403);
  return c.json({ bumSession: withRemainingSec(bs) });
});

app.post("/:id/approve", requireAuth, async (c) => {
  const me = c.get("user");
  const updated = await approveBumSession({ bumSessionId: c.req.param("id") ?? "", actingUser: me });
  return c.json({ bumSession: updated });
});

app.post("/:id/decline", requireAuth, async (c) => {
  const me = c.get("user");
  const updated = await declineBumSession({ bumSessionId: c.req.param("id") ?? "", actingUser: me });
  return c.json({ bumSession: updated });
});

app.post("/:id/start", requireAuth, async (c) => {
  const me = c.get("user");
  const updated = await startBumSession({ bumSessionId: c.req.param("id") ?? "", actingUser: me });
  return c.json({ bumSession: withRemainingSec(updated!) });
});

app.post("/:id/end", requireAuth, async (c) => {
  const me = c.get("user");
  const updated = await endBumSession({ bumSessionId: c.req.param("id") ?? "", actingUser: me });
  return c.json({ bumSession: updated });
});

app.post("/:id/extend", requireAuth, async (c) => {
  const me = c.get("user");
  const bs = await bumSessionsRepo.findById(c.req.param("id") ?? "");
  if (!bs) return c.json({ error: "Not found" }, 404);
  if (![bs.payerId, bs.creatorId].includes(me.id)) return c.json({ error: "Not a participant" }, 403);

  const { phone, provider } = await c.req.json();
  if (!MOMO_PROVIDERS[provider]) {
    return c.json({ error: `provider must be one of: ${Object.keys(MOMO_PROVIDERS).join(", ")}` }, 400);
  }
  const { extension, charge } = await initiateBumExtension({ bumSession: bs, payer: me, phone, provider: MOMO_PROVIDERS[provider] });
  return c.json({ extension, charge: { reference: charge.data?.reference, display_text: charge.data?.display_text } }, 201);
});

export default app;
