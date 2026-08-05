import { Hono } from "npm:hono@4";
import { postsRepo, likesRepo, commentsRepo } from "../repositories/social.ts";
import { scanContactInfo } from "../lib/contactScan.ts";
import { recomputeBadge } from "../services/badge.service.ts";
import { requireAuth } from "../middleware/auth.ts";
import type { AppEnv } from "../lib/honoTypes.ts";

const app = new Hono<AppEnv>();

app.post("/", requireAuth, async (c) => {
  const me = c.get("user");
  const { videoUrl, caption, moveTag, kind } = await c.req.json();
  if (kind && !["post", "short"].includes(kind)) return c.json({ error: "kind must be 'post' or 'short'" }, 400);

  const flag = scanContactInfo(caption || "");
  if (flag.flagged) return c.json({ error: `Caption can't include ${flag.reason}` }, 400);

  const post = await postsRepo.create({ userId: me.id, videoUrl, caption, moveTag, kind });
  const updatedUser = await recomputeBadge(me.id);
  return c.json({ post, user: updatedUser ? { badge: updatedUser.badge, bumEnabled: updatedUser.bumEnabled } : undefined }, 201);
});

app.get("/", requireAuth, async (c) => {
  const me = c.get("user");
  const kind = c.req.query("kind") === "short" ? "short" : "post";
  const limit = Math.min(Number(c.req.query("limit")) || 30, 100);
  return c.json({ posts: await postsRepo.feed({ kind, limit, before: c.req.query("before"), viewerId: me.id }) });
});

app.get("/user/:userId", requireAuth, async (c) => {
  const me = c.get("user");
  const kind = c.req.query("kind");
  return c.json({ posts: await postsRepo.byUser(c.req.param("userId") ?? "", { kind, viewerId: me.id }) });
});

app.get("/:id", requireAuth, async (c) => {
  const me = c.get("user");
  const post = await postsRepo.findById(c.req.param("id") ?? "");
  if (!post) return c.json({ error: "Not found" }, 404);
  return c.json({ post, likedByMe: await likesRepo.hasLiked(post.id, me.id) });
});

app.delete("/:id", requireAuth, async (c) => {
  const me = c.get("user");
  const deleted = await postsRepo.delete(c.req.param("id") ?? "", me.id);
  if (!deleted) return c.json({ error: "Not found, or not yours" }, 404);
  await recomputeBadge(me.id);
  return c.json({ ok: true });
});

app.post("/:id/like", requireAuth, async (c) => {
  const me = c.get("user");
  const post = await postsRepo.findById(c.req.param("id") ?? "");
  if (!post) return c.json({ error: "Not found" }, 404);
  await likesRepo.add(post.id, me.id); // idempotent — liking twice is a no-op, not an error
  return c.json({ post: await postsRepo.findById(post.id), likedByMe: true });
});

app.delete("/:id/like", requireAuth, async (c) => {
  const me = c.get("user");
  const post = await postsRepo.findById(c.req.param("id") ?? "");
  if (!post) return c.json({ error: "Not found" }, 404);
  await likesRepo.remove(post.id, me.id);
  return c.json({ post: await postsRepo.findById(post.id), likedByMe: false });
});

app.get("/:id/comments", requireAuth, async (c) => {
  const post = await postsRepo.findById(c.req.param("id") ?? "");
  if (!post) return c.json({ error: "Not found" }, 404);
  return c.json({ comments: await commentsRepo.byPost(post.id) });
});

app.post("/:id/comments", requireAuth, async (c) => {
  const me = c.get("user");
  const post = await postsRepo.findById(c.req.param("id") ?? "");
  if (!post) return c.json({ error: "Not found" }, 404);

  const { text } = await c.req.json();
  if (!text || !text.trim()) return c.json({ error: "Comment text required" }, 400);
  const flag = scanContactInfo(text);
  if (flag.flagged) return c.json({ error: `Comment can't include ${flag.reason}` }, 400);

  const comment = await commentsRepo.create({ postId: post.id, userId: me.id, text: text.trim() });
  return c.json({ comment }, 201);
});

export default app;
