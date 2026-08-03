import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

if (!JWT_SECRET || JWT_SECRET === "change-me-to-a-random-64-char-hex-string") {
  // Fail loud in any environment that isn't local dev with the example file
  // untouched — a default JWT secret means anyone can forge tokens.
  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET must be set to a real random value in production.");
  }
  console.warn("⚠️  Using a placeholder JWT_SECRET — fine for local dev, never for production.");
}

export async function hashPassword(plain) {
  return bcrypt.hash(plain, 12);
}

export async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

export function signToken(user) {
  return jwt.sign({ sub: user.id, handle: user.handle }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET); // throws on invalid/expired — caller handles
}
