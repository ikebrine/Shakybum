import type { Context, Next } from "npm:hono@4";
import { verifyToken } from "../lib/auth.ts";
import { usersRepo } from "../repositories/users.ts";
import type { AppEnv } from "../lib/honoTypes.ts";

export async function requireAuth(c: Context<AppEnv>, next: Next) {
  const header = c.req.header("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return c.json({ error: "Missing bearer token" }, 401);

  try {
    const payload = verifyToken(token);
    const user = await usersRepo.findById(payload.sub);
    if (!user) return c.json({ error: "User no longer exists" }, 401);
    c.set("user", user);
    await next();
  } catch {
    return c.json({ error: "Invalid or expired token" }, 401);
  }
}
