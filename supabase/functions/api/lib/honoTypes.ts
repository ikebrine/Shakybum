// Shared Hono generic type for the `user` context variable set by
// middleware/auth.ts's requireAuth. Import this everywhere a route or
// middleware needs to read/write c.get("user")/c.set("user", ...) so
// TypeScript actually knows the shape instead of defaulting to `never`.
export type AppEnv = { Variables: { user: any } };
