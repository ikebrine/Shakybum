import { Router } from "express";
import { asyncHandler } from "../middleware/errorHandler.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import { usersRepo, toPublicUser } from "../repositories/users.js";
import { hashPassword, verifyPassword, signToken } from "../lib/auth.js";
import { scanContactInfo } from "../lib/contactScan.js";

const router = Router();

router.post("/signup", asyncHandler(async (req, res) => {
  const { email, password, handle, name } = req.body;
  if (!email || !password || !handle || !name) {
    return res.status(400).json({ error: "email, password, handle, and name are required" });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(handle)) {
    return res.status(400).json({ error: "Handle must be 3-20 chars, letters/numbers/underscore only" });
  }

  // Server-side is the enforcement point — the frontend check is just UX.
  const handleFlag = scanContactInfo(handle);
  if (handleFlag.flagged) return res.status(400).json({ error: `Usernames can't include ${handleFlag.reason}` });

  if (await usersRepo.findByEmail(email)) return res.status(409).json({ error: "Email already registered" });
  if (await usersRepo.findByHandle(handle)) return res.status(409).json({ error: "Handle already taken" });

  const passwordHash = await hashPassword(password);
  const user = await usersRepo.create({ email, handle, name, passwordHash });
  const token = signToken(user);
  res.status(201).json({ token, user: toPublicUser(user) });
}));

router.post("/login", asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const user = await usersRepo.findByEmail(email || "");
  if (!user) return res.status(401).json({ error: "Invalid email or password" });

  const ok = await verifyPassword(password || "", user.passwordHash);
  if (!ok) return res.status(401).json({ error: "Invalid email or password" });

  const token = signToken(user);
  res.json({ token, user: toPublicUser(user) });
}));

router.get("/me", requireAuth, (req, res) => {
  res.json({ user: toPublicUser(req.user) });
});

export default router;
