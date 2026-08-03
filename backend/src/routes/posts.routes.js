import { Router } from "express";
import { asyncHandler } from "../middleware/errorHandler.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import { postsRepo, likesRepo, commentsRepo } from "../repositories/social.js";
import { scanContactInfo } from "../lib/contactScan.js";
import { recomputeBadge } from "../services/badge.service.js";

const router = Router();

router.post("/", requireAuth, asyncHandler(async (req, res) => {
  const { videoUrl, caption, moveTag, kind } = req.body;
  if (kind && !["post", "short"].includes(kind)) return res.status(400).json({ error: "kind must be 'post' or 'short'" });

  const flag = scanContactInfo(caption || "");
  if (flag.flagged) return res.status(400).json({ error: `Caption can't include ${flag.reason}` });

  const post = postsRepo.create({ userId: req.user.id, videoUrl, caption, moveTag, kind });
  const updatedUser = recomputeBadge(req.user.id); // a new "move" posted can push moves-count past a badge threshold
  res.status(201).json({ post, user: updatedUser ? { badge: updatedUser.badge, bumEnabled: updatedUser.bumEnabled } : undefined });
}));

router.get("/", requireAuth, (req, res) => {
  const kind = req.query.kind === "short" ? "short" : "post";
  const limit = Math.min(Number(req.query.limit) || 30, 100);
  res.json({ posts: postsRepo.feed({ kind, limit, before: req.query.before }) });
});

router.get("/user/:userId", requireAuth, (req, res) => {
  const kind = req.query.kind;
  res.json({ posts: postsRepo.byUser(req.params.userId, { kind }) });
});

router.get("/:id", requireAuth, (req, res) => {
  const post = postsRepo.findById(req.params.id);
  if (!post) return res.status(404).json({ error: "Not found" });
  res.json({ post, likedByMe: likesRepo.hasLiked(post.id, req.user.id) });
});

router.delete("/:id", requireAuth, (req, res) => {
  const deleted = postsRepo.delete(req.params.id, req.user.id);
  if (!deleted) return res.status(404).json({ error: "Not found, or not yours" });
  recomputeBadge(req.user.id); // deleting a move can drop moves-count back below a threshold
  res.json({ ok: true });
});

router.post("/:id/like", requireAuth, (req, res) => {
  const post = postsRepo.findById(req.params.id);
  if (!post) return res.status(404).json({ error: "Not found" });
  likesRepo.add(post.id, req.user.id); // idempotent — liking twice is a no-op, not an error
  res.json({ post: postsRepo.findById(post.id) });
});

router.delete("/:id/like", requireAuth, (req, res) => {
  const post = postsRepo.findById(req.params.id);
  if (!post) return res.status(404).json({ error: "Not found" });
  likesRepo.remove(post.id, req.user.id);
  res.json({ post: postsRepo.findById(post.id) });
});

router.get("/:id/comments", requireAuth, (req, res) => {
  const post = postsRepo.findById(req.params.id);
  if (!post) return res.status(404).json({ error: "Not found" });
  res.json({ comments: commentsRepo.byPost(post.id) });
});

router.post("/:id/comments", requireAuth, asyncHandler(async (req, res) => {
  const post = postsRepo.findById(req.params.id);
  if (!post) return res.status(404).json({ error: "Not found" });

  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: "Comment text required" });
  const flag = scanContactInfo(text);
  if (flag.flagged) return res.status(400).json({ error: `Comment can't include ${flag.reason}` });

  const comment = commentsRepo.create({ postId: post.id, userId: req.user.id, text: text.trim() });
  res.status(201).json({ comment });
}));

export default router;
