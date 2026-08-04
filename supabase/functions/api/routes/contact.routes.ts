import { Hono } from "npm:hono@4";
import { usersRepo } from "../repositories/users.ts";
import { contactRequestsRepo } from "../repositories/contactRequests.ts";
import { initiateContactPayment, approveContactRequest, declineContactRequest } from "../services/escrow.service.ts";
import { MOMO_PROVIDERS } from "../lib/paystack.ts";
import { requireAuth } from "../middleware/auth.ts";
import type { AppEnv } from "../lib/honoTypes.ts";

const app = new Hono<AppEnv>();

app.post("/", requireAuth, async (c) => {
  const me = c.get("user");
  const { creatorHandle, phone, provider } = await c.req.json();
  if (!MOMO_PROVIDERS[provider]) {
    return c.json({ error: `provider must be one of: ${Object.keys(MOMO_PROVIDERS).join(", ")}` }, 400);
  }
  const creator = await usersRepo.findByHandle(creatorHandle ?? "");
  if (!creator) return c.json({ error: "Creator not found" }, 404);

  const { contactRequest, charge } = await initiateContactPayment({
    payer: me, creator, phone, provider: MOMO_PROVIDERS[provider],
  });
  return c.json({ contactRequest, charge: { reference: charge.data?.reference, display_text: charge.data?.display_text } }, 201);
});

app.get("/sent", requireAuth, async (c) => {
  const me = c.get("user");
  return c.json({ requests: await contactRequestsRepo.sentBy(me.id) });
});

app.get("/received", requireAuth, async (c) => {
  const me = c.get("user");
  return c.json({ requests: await contactRequestsRepo.receivedFor(me.id, "paid_hold") });
});

// Reveals the creator's real contact info — only if this specific request is approved.
app.get("/:id", requireAuth, async (c) => {
  const me = c.get("user");
  const cr = await contactRequestsRepo.findById(c.req.param("id") ?? "");
  if (!cr) return c.json({ error: "Not found" }, 404);
  if (![cr.payerId, cr.creatorId].includes(me.id)) return c.json({ error: "Not a participant" }, 403);

  const payload: any = { ...cr };
  if (cr.status === "approved" && me.id === cr.payerId) {
    const creator = await usersRepo.findById(cr.creatorId);
    payload.creatorContact = { email: creator!.contactEmail, phone: creator!.contactPhone };
  }
  return c.json({ contactRequest: payload });
});

app.post("/:id/approve", requireAuth, async (c) => {
  const me = c.get("user");
  const updated = await approveContactRequest({ contactRequestId: c.req.param("id") ?? "", actingUser: me });
  return c.json({ contactRequest: updated });
});

app.post("/:id/decline", requireAuth, async (c) => {
  const me = c.get("user");
  const updated = await declineContactRequest({ contactRequestId: c.req.param("id") ?? "", actingUser: me });
  return c.json({ contactRequest: updated });
});

export default app;
