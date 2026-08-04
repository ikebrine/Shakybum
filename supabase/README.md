# Shakybum API — Supabase Edge Function

This is the Vercel + Supabase (2-service) version of the backend — a
rewrite of `backend/` (the Express/Node version) to run as a Supabase Edge
Function, so the whole app fits on Vercel (frontend) + Supabase (database
+ API) with no third hosting service.

**Automated test suite: 24/24 passing** against a real local Postgres 16
instance — run `deno task test` (see "Running tests" below). This is on
top of the manual end-to-end verification described further down.

## Why this exists / how it differs from `backend/`

`backend/` is a standard Express/Node app — the natural fit if you're
hosting on Railway/Render/Fly (a persistent process). This version is a
port to Deno + [Hono](https://hono.dev) (a lightweight router, since
Express itself doesn't run on Edge Functions) so it can run as a Supabase
Edge Function instead, keeping the whole stack to two services.

**The logic is the same** — same escrow state machine, same pricing, same
contact-info filtering, same badge computation. What changed is the
runtime: Deno instead of Node, Hono instead of Express, and one
Postgres-specific correctness fix (see "Webhook processing order" below).

## Setup

1. Install the [Supabase CLI](https://supabase.com/docs/guides/cli).
2. `supabase login`, then `supabase link --project-ref <your-project-ref>`.
3. Set secrets (never commit these):
   ```bash
   supabase secrets set DATABASE_URL="postgresql://postgres:[password]@[project].supabase.co:5432/postgres"
   supabase secrets set JWT_SECRET="$(openssl rand -hex 32)"
   supabase secrets set PAYSTACK_SECRET_KEY="sk_live_..."
   supabase secrets set PAYSTACK_PUBLIC_KEY="pk_live_..."
   supabase secrets set PLATFORM_CUT="0.30"
   supabase secrets set CORS_ORIGIN="https://your-vercel-app.vercel.app"
   ```
4. Deploy: `supabase functions deploy api`
5. Your API is now live at:
   `https://<project-ref>.supabase.co/functions/v1/api`
6. Set that as `VITE_API_BASE_URL` in Vercel (Project Settings →
   Environment Variables), then redeploy the frontend (env var changes
   don't trigger an automatic rebuild).
7. In Paystack's dashboard, set the webhook URL to:
   `https://<project-ref>.supabase.co/functions/v1/api/webhooks/paystack`

Tables auto-create on cold start (`migrate()` runs the same
`CREATE TABLE IF NOT EXISTS` schema as the Node version — safe to
re-run every cold start).

## Video storage (Supabase Storage — no third-party service)

`POST /api/media/upload` accepts a video (raw bytes, `Content-Type:
video/webm|video/mp4|video/quicktime`, 100MB cap) from an authenticated
user and stores it in **Supabase's own Storage product** — not S3,
Cloudinary, or any other third party, specifically to keep the whole app
at two services (Vercel + Supabase). Returns a real, permanent public URL.

The `videos` storage bucket is created automatically on cold start
(`ensureVideosBucket()` in `lib/db.ts`'s `migrate()`) — no manual dashboard
step needed, same pattern as the database tables.

**Credentials**: `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are
commonly auto-injected into Supabase Edge Functions without needing
`supabase secrets set` — this couldn't be verified against a live project
from this dev sandbox (no network path to it). If video uploads fail with
a "not set" error in your function logs, set them explicitly:
```bash
supabase secrets set SUPABASE_URL="https://<project-ref>.supabase.co"
supabase secrets set SUPABASE_SERVICE_ROLE_KEY="<from Project Settings → API → service_role>"
```
The service role key bypasses Row Level Security and must never reach the
frontend — only this backend code calls Supabase Storage directly; the
frontend uploads to *this* API (authenticated via the normal user JWT),
never to Supabase directly.

This closes what was previously a documented gap ("no media storage/CDN")
— recorded/uploaded videos now persist permanently instead of vanishing
as session-only Blob URLs on page reload.



```bash
cd supabase/functions/api
export TEST_DATABASE_URL="postgresql://postgres:password@localhost:5432/shakybum_test"
deno task test
```

**Requires a real, reachable Postgres** — same trade-off as the Node
backend's test suite (a disposable SQLite file isn't an option here since
there's no SQLite version of this backend). Cheapest options: a local
Postgres (`docker run -e POSTGRES_PASSWORD=x -p 5432:5432 postgres:16`),
a second free Supabase project used only for tests, or Neon/Railway's
free-tier Postgres.

24 tests across 4 files:
- **`badges.unit.test.ts`** (3 tests) — pure unit tests for badge
  threshold logic, no server/DB needed.
- **`escrow.test.ts`** (9 tests) — the core payment state machine: full
  contact-request approve/decline cycle, authorization edge cases, chat
  gating, and the complete Bum session lifecycle including the paid
  extension.
- **`social.test.ts`** (7 tests) — posts/likes/comments/follows,
  contact-info filtering, badge auto-recomputation (including
  auto-disabling Bum sessions when a badge drops).
- **`webhooks.test.ts`** (5 tests) — signature verification, idempotency,
  and the `transfer.failed`/`refund.processed` async paths the happy-path
  tests don't reach.

**How test isolation works without subprocess juggling**: the app and a
Deno-native mock Paystack server (`__tests__/helpers/mockPaystackApp.ts`)
both run as `Deno.serve()` listeners on ephemeral ports *within the same
test process* — not as separate OS processes. `deno test` manages the
whole lifecycle, so there's no backgrounding, no `setsid`, none of the
process-management issues documented further down for manual testing.
Each test file gets its own Postgres schema (created before import,
dropped on teardown) so parallel test files can't corrupt each other's data.

## Testing manually (without the automated suite)

For exploratory testing against a real running instance — as opposed to
the in-process automated suite above — the same manual approach from
earlier in this project still works, with the caveats in "Getting this
running in this dev sandbox" below (background processes need `setsid` +
`< /dev/null` to survive reliably here).

Requires [Deno](https://deno.com) and a local (or remote) Postgres:

```bash
cd supabase/functions/api
export DATABASE_URL="postgresql://postgres:password@localhost:5432/shakybum_dev"
export JWT_SECRET="dev-secret-do-not-use-in-prod"
export PAYSTACK_SECRET_KEY="sk_test_..."
deno run --allow-net --allow-env --allow-read index.ts
```

Runs on `http://localhost:8000/functions/v1/api` — matching the real
deployed path structure (`basePath` in `index.ts`), so local testing
exercises the exact same routing Supabase will use in production.

For testing against a mock Paystack instead of a live account, the Node
backend's `backend/scripts/mock-paystack-server.js` works fine here too —
it's just an HTTP server, doesn't care what's calling it. Set
`PAYSTACK_BASE_URL="http://localhost:5555"` and point the mock's
`BACKEND_WEBHOOK_URL` at `http://localhost:8000/functions/v1/api/webhooks/paystack`.

## What was actually verified (live, not just type-checked)

Every source and test file passes `deno check` with zero errors.
Beyond the automated suite above, this was also run manually for real
against a live local Postgres 16 instance and the mock Paystack server,
covering:

- **Signup/login** — real bcrypt hashing, real JWT issuance, confirmed
  the exact response shape.
- **Contact request full cycle** — initiate → webhook fires and moves
  `pending` → `paid_hold` → creator approves → payout released → status
  `approved`. Confirmed at every step by re-fetching the resource, not
  just checking the immediate response.
- **Chat gating** — blocked before approval implicitly verified via the
  contact-approval prerequisite; confirmed unlocked immediately after
  approval, and confirmed the contact-info leak filter still blocks a
  message inside an unlocked chat (`"call me on whatsapp 0241234567"` →
  400).
- **Bum session full cycle** — book (confirmed correct pricing: 15 min ×
  GHS 1.20/min = GHS 18 at Silver Queen) → webhook confirms → approve →
  start (confirmed `remainingSec: 900`) → extend (confirmed `totalSec`
  900→1800, `extensions` 0→1, `remainingSec` correctly reflecting elapsed
  time, not just reset to 1800).
- **Authorization** — missing bearer token → 401; nonexistent resource →
  404; double-approve → 400 with the exact `EscrowError` message,
  confirming the centralized `app.onError` handler correctly maps
  `EscrowError.status` to the HTTP response.
- **Badge-gated Bum eligibility** — confirmed a Newcomer-badge creator
  can't enable Bum sessions (403), confirmed enabling works once badge is
  Silver Queen+.

**What was not re-verified here** (carried over from `backend/`'s own
"Known gaps," unchanged by this port): media storage, real-time
chat/notifications (still poll-based), admin/moderation tooling, and the
`transfer.success`/`transfer.failed`/`refund.processed` webhook event
shapes (implemented against Paystack's documented payloads, not a live
account).

## Webhook processing order — a deliberate difference from `backend/`

The Node/Express version responds `200` to Paystack *before* finishing
webhook processing (a common "ack fast, work after" pattern) — safe on a
persistent server, but risky on serverless/Edge Functions, where the
execution context can end the moment a response is sent. This version
**awaits processing before responding** instead (see
`routes/payments.routes.ts`). Paystack's retry-on-timeout behavior is the
safety net if processing takes too long; every handler is idempotent
(checks current status before acting), so a legitimate retry is safe.

This is the same reliability concern originally raised about deploying
the Express backend to Vercel serverless functions — Edge Functions have
the same fundamental constraint, and this port handles it correctly
rather than inheriting the Node version's "ack first" pattern unchanged.

## Rate limiting caveat (same as `backend/`)

`hono-rate-limiter`'s default store is in-memory — fine for one warm
instance, resets on cold start, and isn't shared across concurrent Edge
Function instances. A Redis/Upstash-backed store is the upgrade path if
that becomes a real problem at scale.

## Getting this running in this dev sandbox — worth knowing

Two environment-specific things that had nothing to do with the code, in
case they come up again:
1. **PostgreSQL 16 was assumed impossible to install here** earlier in
   this project (the Ubuntu `security.ubuntu.com` mirror 404'd on the
   actual package) — that turned out to be a transient mirror sync issue,
   not a hard block. It installed cleanly on retry.
2. **Backgrounded Deno processes need `setsid` and `< /dev/null`** to
   survive reliably in this sandbox's shell — without both, `deno run`
   would hang or silently die between commands, even though the exact
   same pattern worked fine for Node processes. Not a Deno bug, just this
   particular sandboxed environment's process/job-control quirks.
