import { Hono } from "npm:hono@4";
import { challengesRepo, postsRepo } from "../repositories/social.ts";
import { scanContactInfo } from "../lib/contactScan.ts";
import { requireAuth } from "../middleware/auth.ts";
import type { AppEnv } from "../lib/honoTypes.ts";

const app = new Hono<AppEnv>();

app.get("/", requireAuth, async (c) => {
  return c.json({ challenges: await challengesRepo.list() });
});

app.post("/", requireAuth, async (c) => {
  const me = c.get("user");
  const { title, description, moveTag } = await c.req.json();
  if (!title || !title.trim()) return c.json({ error: "Title required" }, 400);
  const flag = scanContactInfo(`${title} ${description || ""}`);
  if (flag.flagged) return c.json({ error: `Challenge text can't include ${flag.reason}` }, 400);

  const challenge = await challengesRepo.create({ creatorId: me.id, title: title.trim(), description, moveTag });
  return c.json({ challenge }, 201);
});

app.get("/:id/entries", requireAuth, async (c) => {
  return c.json({ entries: await challengesRepo.entries(c.req.param("id") ?? "") });
});

app.post("/:id/entries", requireAuth, async (c) => {
  const me = c.get("user");
  const challenge = await challengesRepo.findById(c.req.param("id") ?? "");
  if (!challenge) return c.json({ error: "Challenge not found" }, 404);

  const { postId } = await c.req.json();
  const post = postId && await postsRepo.findById(postId);
  if (!post) return c.json({ error: "Post not found" }, 404);
  if (post.userId !== me.id) return c.json({ error: "Can only enter your own post" }, 403);

  const added = await challengesRepo.addEntry({ challengeId: challenge.id, userId: me.id, postId: post.id });
  return c.json({ entered: true }, added ? 201 : 200);
});

export default app;
