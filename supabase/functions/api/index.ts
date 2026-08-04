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

// Supabase Edge Functions' exact request-path behavior (whether the
// /functions/v1/<function-name> prefix is stripped before your code sees
// it, or passed through) isn't something this sandbox can verify against a
// real deployed project — it's undocumented/has varied across Supabase
// runtime versions. Rather than bet on one behavior, routes are defined
// once on `inner` (bare paths, no prefix) and mounted at BOTH `/` and
// `/functions/v1/api`, so requests match correctly either way.
const inner = new Hono<AppEnv>();

inner.use("*", cors({ origin: Deno.env.get("CORS_ORIGIN") || "*" }));

inner.get("/health", (c) => c.json({ ok: true }));

inner.route("/auth", authRoutes);
inner.route("/users", usersRoutes);
inner.route("/users", followsRoutes); // /users/:userId/follow etc — shares the /users prefix
inner.use("/contact-requests/*", paymentLimiter);
inner.route("/contact-requests", contactRoutes);
inner.use("/bum-sessions/*", paymentLimiter);
inner.route("/bum-sessions", bumRoutes);
inner.route("/chat", chatRoutes);
inner.route("/webhooks", paymentsRoutes);
inner.route("/notifications", notificationsRoutes);
inner.route("/posts", postsRoutes);
inner.route("/challenges", challengesRoutes);

inner.notFound((c) => c.json({ error: "Not found" }, 404));

// Central error handler — mirrors the Node backend's middleware/errorHandler.js.
// EscrowError carries its own HTTP status (403/404/409 etc, thrown from
// services/escrow.service.ts); anything else is an unexpected 500, logged
// server-side but not leaked to the client.
inner.onError((err, c) => {
  if (err instanceof EscrowError) {
    return c.json({ error: err.message }, err.status as any);
  }
  if (err instanceof HTTPException) {
    return err.getResponse();
  }
  console.error(err);
  return c.json({ error: "Internal server error" }, 500);
});

const app = new Hono<AppEnv>();
app.route("/", inner);
app.route("/functions/v1/api", inner);

// Only start listening when run directly (`deno run index.ts`), not when
// imported by the test suite — Hono's app.request() tests the app
// in-memory without needing a real network listener at all, which sidesteps
// the process/networking issues that come with spinning up real servers.
if (import.meta.main) {
  Deno.serve(app.fetch);
}

export default app;
