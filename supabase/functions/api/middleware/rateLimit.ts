import { rateLimiter } from "npm:hono-rate-limiter@0.4";

// Payment-initiating endpoints get a tighter rate limit — these trigger
// real MoMo charges, so this is a fraud/abuse control, not just a DoS guard.
// Same in-memory-store limitation as the Node backend had: fine for a
// single warm instance, resets on cold start, and won't be shared across
// concurrent Edge Function instances. A Redis/Upstash-backed store is the
// upgrade path if that becomes a real problem — flagged here rather than
// silently carried forward as if it were solved.
export const paymentLimiter = rateLimiter({
  windowMs: 60_000,
  limit: Number(Deno.env.get("PAYMENT_RATE_LIMIT_MAX")) || 10,
  standardHeaders: "draft-6",
  keyGenerator: (c) => c.req.header("x-forwarded-for") || "anonymous",
});
