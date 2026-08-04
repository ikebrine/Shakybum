import { Router } from "express";
import { asyncHandler } from "../middleware/errorHandler.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import { notificationsRepo } from "../repositories/misc.js";

const router = Router();

router.get("/", requireAuth, asyncHandler(async (req, res) => {
  res.json({ notifications: await notificationsRepo.listFor(req.user.id) });
}));

router.post("/:id/read", requireAuth, asyncHandler(async (req, res) => {
  await notificationsRepo.markRead(req.params.id, req.user.id);
  res.json({ ok: true });
}));

export default router;
