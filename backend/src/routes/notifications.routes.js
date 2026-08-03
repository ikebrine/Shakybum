import { Router } from "express";
import { requireAuth } from "../middleware/authMiddleware.js";
import { notificationsRepo } from "../repositories/misc.js";

const router = Router();

router.get("/", requireAuth, (req, res) => {
  res.json({ notifications: notificationsRepo.listFor(req.user.id) });
});

router.post("/:id/read", requireAuth, (req, res) => {
  notificationsRepo.markRead(req.params.id, req.user.id);
  res.json({ ok: true });
});

export default router;
