import { Hono } from "npm:hono@4";
import { usersRepo } from "../repositories/users.ts";
import { contactRequestsRepo } from "../repositories/contactRequests.ts";
import { messagesRepo, notificationsRepo } from "../repositories/misc.ts";
import { scanContactInfo } from "../lib/contactScan.ts";
import { requireAuth } from "../middleware/auth.ts";
import type { AppEnv } from "../lib/honoTypes.ts";

const app = new Hono<AppEnv>();

async function canChat(userA: string, userB: string) {
  const [a, b] = await Promise.all([
    contactRequestsRepo.isApprovedBetween(userA, userB),
    contactRequestsRepo.isApprovedBetween(userB, userA),
  ]);
  return a || b;
}

app.get("/:userId/messages", requireAuth, async (c) => {
  const me = c.get("user");
  const other = await usersRepo.findById(c.req.param("userId") ?? "");
  if (!other) return c.json({ error: "User not found" }, 404);
  if (!(await canChat(me.id, other.id))) return c.json({ error: "Chat unlocks after an approved contact request" }, 403);
  return c.json({ messages: await messagesRepo.listBetween(me.id, other.id) });
});

app.post("/:userId/messages", requireAuth, async (c) => {
  const me = c.get("user");
  const other = await usersRepo.findById(c.req.param("userId") ?? "");
  if (!other) return c.json({ error: "User not found" }, 404);
  if (!(await canChat(me.id, other.id))) return c.json({ error: "Chat unlocks after an approved contact request" }, 403);

  const { text } = await c.req.json();
  if (!text || !text.trim()) return c.json({ error: "Message text required" }, 400);

  const flag = scanContactInfo(text);
  if (flag.flagged) return c.json({ error: `Message can't include ${flag.reason}` }, 400);

  const message = await messagesRepo.create({ senderId: me.id, otherUserId: other.id, text: text.trim() });
  await notificationsRepo.create({ userId: other.id, type: "message", text: `New message from ${me.name}` });
  return c.json({ message }, 201);
});

export default app;
