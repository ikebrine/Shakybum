import { Hono } from "npm:hono@4";
import { cors } from "npm:hono@4/cors";
import { HTTPException } from "npm:hono@4/http-exception";

import { migrate } from "./lib/db.ts";
import { EscrowError } from "./services/escrow.service.ts";
import type { AppEnv } from "./lib/honoTypes.ts";

import authRoutes from "./routes/auth.routes.ts";
import usersRoutes from "./routes/users.routes.ts";
import contactRoutes from "./routes/contact.routes.ts";
import bumRoutes from "./routes/bum.routes.ts";
import chatRoutes from "./routes/chat.routes.ts";
import paymentsRoutes from "./routes/payments.routes.ts";
import notificationsRoutes from "./routes/notifications.routes.ts";
import postsRoutes from "./routes/posts.routes.ts";
import followsRoutes from "./routes/follows.routes.ts";
import challengesRoutes from "./routes/challenges.routes.ts";
import { paymentLimiter } from "./middleware/rateLimit.ts";

// Runs on cold start; CREATE TABLE IF NOT EXISTS is idempotent so this is
// safe to re-run on every cold start rather than needing a separate
// one-time migration step.
await migrate();

// Supabase Edge Functions are invoked at the full path
// /functions/v1/<function-name>/... — basePath mirrors that so route
// definitions below can stay clean ("/auth/signup" etc). The frontend's
// VITE_API_BASE_URL should be set to
// https://<project-ref>.supabase.co/functions/v1/api
const app = new Hono<AppEnv>().basePath("/functions/v1/api");

app.use("*", cors({ origin: Deno.env.get("CORS_ORIGIN") || "*" }));

app.get("/health", (c) => c.json({ ok: true }));

app.route("/auth", authRoutes);
app.route("/users", usersRoutes);
app.route("/users", followsRoutes); // /users/:userId/follow etc — shares the /users prefix
app.use("/contact-requests/*", paymentLimiter);
app.route("/contact-requests", contactRoutes);
app.use("/bum-sessions/*", paymentLimiter);
app.route("/bum-sessions", bumRoutes);
app.route("/chat", chatRoutes);
app.route("/webhooks", paymentsRoutes);
app.route("/notifications", notificationsRoutes);
app.route("/posts", postsRoutes);
app.route("/challenges", challengesRoutes);

app.notFound((c) => c.json({ error: "Not found" }, 404));

// Central error handler — mirrors the Node backend's middleware/errorHandler.js.
// EscrowError carries its own HTTP status (403/404/409 etc, thrown from
// services/escrow.service.ts); anything else is an unexpected 500, logged
// server-side but not leaked to the client.
app.onError((err, c) => {
  if (err instanceof EscrowError) {
    return c.json({ error: err.message }, err.status as any);
  }
  if (err instanceof HTTPException) {
    return err.getResponse();
  }
  console.error(err);
  return c.json({ error: "Internal server error" }, 500);
});

// Only start listening when run directly (`deno run index.ts`), not when
// imported by the test suite — Hono's app.request() tests the app
// in-memory without needing a real network listener at all, which sidesteps
// the process/networking issues that come with spinning up real servers.
if (import.meta.main) {
  Deno.serve(app.fetch);
}

export default app;
