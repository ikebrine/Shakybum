import { Hono } from "npm:hono@4";
import { notificationsRepo } from "../repositories/misc.ts";
import { requireAuth } from "../middleware/auth.ts";
import type { AppEnv } from "../lib/honoTypes.ts";

const app = new Hono<AppEnv>();

app.get("/", requireAuth, async (c) => {
  const me = c.get("user");
  return c.json({ notifications: await notificationsRepo.listFor(me.id) });
});

app.post("/:id/read", requireAuth, async (c) => {
  const me = c.get("user");
  await notificationsRepo.markRead(c.req.param("id") ?? "", me.id);
  return c.json({ ok: true });
});

export default app;
