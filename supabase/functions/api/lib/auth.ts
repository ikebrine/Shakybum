import bcrypt from "npm:bcryptjs@2.4.3";
import jwt from "npm:jsonwebtoken@9.0.2";

const JWT_SECRET = Deno.env.get("JWT_SECRET") ?? "";
const JWT_EXPIRES_IN = Deno.env.get("JWT_EXPIRES_IN") || "7d";

if (!JWT_SECRET || JWT_SECRET === "change-me-to-a-random-64-char-hex-string") {
  if (Deno.env.get("ENVIRONMENT") === "production") {
    throw new Error("JWT_SECRET must be set to a real random value in production.");
  }
  console.warn("⚠️  Using a placeholder JWT_SECRET — fine for local dev, never for production.");
}

export async function hashPassword(plain: string) {
  return bcrypt.hash(plain, 12);
}

export async function verifyPassword(plain: string, hash: string) {
  return bcrypt.compare(plain, hash);
}

export function signToken(user: { id: string; handle: string }) {
  return jwt.sign({ sub: user.id, handle: user.handle }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyToken(token: string) {
  return jwt.verify(token, JWT_SECRET) as { sub: string; handle: string };
}
