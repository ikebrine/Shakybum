import { Router } from "express";
import { asyncHandler } from "../middleware/errorHandler.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import { challengesRepo, postsRepo } from "../repositories/social.js";
import { scanContactInfo } from "../lib/contactScan.js";

const router = Router();

router.get("/", requireAuth, asyncHandler(async (req, res) => {
  res.json({ challenges: await challengesRepo.list() });
}));

router.post("/", requireAuth, asyncHandler(async (req, res) => {
  const { title, description, moveTag } = req.body;
  if (!title || !title.trim()) return res.status(400).json({ error: "Title required" });
  const flag = scanContactInfo(`${title} ${description || ""}`);
  if (flag.flagged) return res.status(400).json({ error: `Challenge text can't include ${flag.reason}` });

  const challenge = await challengesRepo.create({ creatorId: req.user.id, title: title.trim(), description, moveTag });
  res.status(201).json({ challenge });
}));

router.get("/:id/entries", requireAuth, asyncHandler(async (req, res) => {
  res.json({ entries: await challengesRepo.entries(req.params.id) });
}));

router.post("/:id/entries", requireAuth, asyncHandler(async (req, res) => {
  const challenge = await challengesRepo.findById(req.params.id);
  if (!challenge) return res.status(404).json({ error: "Challenge not found" });

  const { postId } = req.body;
  const post = postId && await postsRepo.findById(postId);
  if (!post) return res.status(404).json({ error: "Post not found" });
  if (post.userId !== req.user.id) return res.status(403).json({ error: "Can only enter your own post" });

  const added = await challengesRepo.addEntry({ challengeId: challenge.id, userId: req.user.id, postId: post.id });
  res.status(added ? 201 : 200).json({ entered: true });
}));

export default router;
