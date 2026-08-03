import { Router } from "express";
import { requireAuth } from "../middleware/authMiddleware.js";
import { challengesRepo, postsRepo } from "../repositories/social.js";
import { scanContactInfo } from "../lib/contactScan.js";

const router = Router();

router.get("/", requireAuth, (req, res) => {
  res.json({ challenges: challengesRepo.list() });
});

router.post("/", requireAuth, (req, res) => {
  const { title, description, moveTag } = req.body;
  if (!title || !title.trim()) return res.status(400).json({ error: "Title required" });
  const flag = scanContactInfo(`${title} ${description || ""}`);
  if (flag.flagged) return res.status(400).json({ error: `Challenge text can't include ${flag.reason}` });

  const challenge = challengesRepo.create({ creatorId: req.user.id, title: title.trim(), description, moveTag });
  res.status(201).json({ challenge });
});

router.get("/:id/entries", requireAuth, (req, res) => {
  res.json({ entries: challengesRepo.entries(req.params.id) });
});

router.post("/:id/entries", requireAuth, (req, res) => {
  const challenge = challengesRepo.findById(req.params.id);
  if (!challenge) return res.status(404).json({ error: "Challenge not found" });

  const { postId } = req.body;
  const post = postId && postsRepo.findById(postId);
  if (!post) return res.status(404).json({ error: "Post not found" });
  if (post.userId !== req.user.id) return res.status(403).json({ error: "Can only enter your own post" });

  const added = challengesRepo.addEntry({ challengeId: challenge.id, userId: req.user.id, postId: post.id });
  res.status(added ? 201 : 200).json({ entered: true });
});

export default router;
