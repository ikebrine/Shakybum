import { Hono } from "npm:hono@4";
import { usersRepo, toPublicUser } from "../repositories/users.ts";
import { hashPassword, verifyPassword, signToken } from "../lib/auth.ts";
import { scanContactInfo } from "../lib/contactScan.ts";
import { requireAuth } from "../middleware/auth.ts";
import type { AppEnv } from "../lib/honoTypes.ts";

const app = new Hono<AppEnv>();

app.post("/signup", async (c) => {
  const { email, password, handle, name } = await c.req.json();
  if (!email || !password || !handle || !name) {
    return c.json({ error: "email, password, handle, and name are required" }, 400);
  }
  if (password.length < 8) {
    return c.json({ error: "Password must be at least 8 characters" }, 400);
  }
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(handle)) {
    return c.json({ error: "Handle must be 3-20 chars, letters/numbers/underscore only" }, 400);
  }

  const handleFlag = scanContactInfo(handle);
  if (handleFlag.flagged) return c.json({ error: `Usernames can't include ${handleFlag.reason}` }, 400);

  if (await usersRepo.findByEmail(email)) return c.json({ error: "Email already registered" }, 409);
  if (await usersRepo.findByHandle(handle)) return c.json({ error: "Handle already taken" }, 409);

  const passwordHash = await hashPassword(password);
  const user = await usersRepo.create({ email, handle, name, passwordHash });
  const token = signToken(user!);
  return c.json({ token, user: toPublicUser(user) }, 201);
});

app.post("/login", async (c) => {
  const { email, password } = await c.req.json();
  const user = await usersRepo.findByEmail(email || "");
  if (!user) return c.json({ error: "Invalid email or password" }, 401);

  const ok = await verifyPassword(password || "", user.passwordHash);
  if (!ok) return c.json({ error: "Invalid email or password" }, 401);

  const token = signToken(user);
  return c.json({ token, user: toPublicUser(user) });
});

app.get("/me", requireAuth, (c) => {
  return c.json({ user: toPublicUser(c.get("user")) });
});

export default app;
