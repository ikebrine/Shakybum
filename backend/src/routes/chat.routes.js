import { Router } from "express";
import { asyncHandler } from "../middleware/errorHandler.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import { usersRepo } from "../repositories/users.js";
import { contactRequestsRepo } from "../repositories/contactRequests.js";
import { messagesRepo, notificationsRepo } from "../repositories/misc.js";
import { scanContactInfo } from "../lib/contactScan.js";

const router = Router();

// Chat only exists between two users once an approved contact request links
// them in EITHER direction — mirrors the frontend's "chat opens after
// approved contact" rule, enforced here so it can't be bypassed by calling
// the API directly.
function canChat(userA, userB) {
  return contactRequestsRepo.isApprovedBetween(userA, userB) || contactRequestsRepo.isApprovedBetween(userB, userA);
}

router.get("/:userId/messages", requireAuth, (req, res) => {
  const other = usersRepo.findById(req.params.userId);
  if (!other) return res.status(404).json({ error: "User not found" });
  if (!canChat(req.user.id, other.id)) return res.status(403).json({ error: "Chat unlocks after an approved contact request" });
  res.json({ messages: messagesRepo.listBetween(req.user.id, other.id) });
});

router.post("/:userId/messages", requireAuth, asyncHandler(async (req, res) => {
  const other = usersRepo.findById(req.params.userId);
  if (!other) return res.status(404).json({ error: "User not found" });
  if (!canChat(req.user.id, other.id)) return res.status(403).json({ error: "Chat unlocks after an approved contact request" });

  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: "Message text required" });

  // Even in an unlocked chat, block attempts to route payment off-platform
  // (e.g. "pay me directly next time on...") — same policy as everywhere else.
  const flag = scanContactInfo(text);
  if (flag.flagged) return res.status(400).json({ error: `Message can't include ${flag.reason}` });

  const message = messagesRepo.create({ senderId: req.user.id, otherUserId: other.id, text: text.trim() });
  notificationsRepo.create({ userId: other.id, type: "message", text: `New message from ${req.user.name}` });
  res.status(201).json({ message });
}));

export default router;
