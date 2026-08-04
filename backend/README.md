# Shakybum Backend

Real Express + Postgres backend covering: escrow-based payments (contact
reveals, duration-billed Bum sessions, paid extensions), Paystack MoMo
integration with proper async webhook confirmation, chat gating, the social
graph (posts/likes/comments/follows/challenges), badge computation from
real activity, and contact-info leak filtering.

> **⚠️ Migration status:** this backend was originally built and verified
> end-to-end (21/21 automated tests passing, full manual flow testing)
> against SQLite. It was then migrated to Postgres to run on Supabase.
> Every file was rewritten carefully and passed syntax checks, but **the
> Postgres version has not been run against a real database** — the dev
> sandbox that built this couldn't get a working local Postgres server
> (the Ubuntu package mirror 404s on the actual `postgresql-16` binary,
> a real infrastructure gap, not something routed around) and has no
> network access to Supabase directly. **Run `npm test` against your own
> Postgres/Supabase instance before trusting this with real payments** —
> see "Running tests" below.

## Stack

- **Express** — HTTP layer
- **Postgres** via `pg` (node-postgres) — targets Supabase, but works with
  any Postgres 14+
- **JWT** (jsonwebtoken) — auth
- **bcryptjs** — password hashing
- **Paystack** — MoMo charges, transfers (payouts), refunds, webhooks

Money columns (`amount`, `platform_cut`, `creator_cut`) use `NUMERIC(10,2)`,
not `REAL`/`FLOAT` — floating-point currency was a latent correctness risk
in an earlier SQLite version of this schema, fixed during the Postgres
migration rather than carried forward.

## Setup

```bash
npm install
cp .env.example .env
# edit .env:
#  - DATABASE_URL: your Supabase connection string (Project Settings → Database → Connection string)
#  - JWT_SECRET: a real random value (openssl rand -hex 32)
#  - PAYSTACK_SECRET_KEY / PAYSTACK_PUBLIC_KEY: from your Paystack dashboard
npm run dev
```

Tables are created automatically on startup (`migrate()` runs `CREATE
TABLE IF NOT EXISTS` for everything in `src/db/schema.sql` — safe to run
every time the server starts, not just once).

Server runs on `http://localhost:4000` by default. `GET /health` should
return `{"ok":true}`.

## Running tests

```bash
npm test
```

**Requires a real, reachable Postgres** — set `TEST_DATABASE_URL` in `.env`
(falls back to `DATABASE_URL` if unset, which is fine for solo local dev
but risky in CI or anywhere `DATABASE_URL` might point at real data).
This is a genuine trade-off from the pre-Postgres version of this suite,
which used a disposable SQLite file per test run and needed no external
services at all.

Cheapest ways to get a test Postgres:
- A local Postgres (Docker: `docker run -e POSTGRES_PASSWORD=x -p 5432:5432 postgres:16`)
- A second free Supabase project used only for tests
- Neon/Railway's free-tier Postgres

**Isolation**: each test file creates its own Postgres *schema*
(`CREATE SCHEMA test_xxxxx`, dropped on teardown) rather than sharing
tables — `node --test` runs files in parallel by default, so without this,
two test files would corrupt each other's data mid-run. See
`src/__tests__/helpers/testEnv.js`.

21 tests across 4 files, using an in-process mock Paystack server (fast
delays — different from the standalone `scripts/mock-paystack-server.js`
used for manual testing, though both share `src/lib/mockPaystackApp.js`):

- **`badges.unit.test.js`** — pure unit tests for badge threshold logic (no
  server/DB), including that thresholds require BOTH moves AND followers,
  not either alone.
- **`escrow.test.js`** — the core payment state machine: contact request
  approve/decline (payout release, refund, double-decline prevention),
  authorization edge cases (can't approve your own request, can't
  self-request, approval blocked without a registered payout destination),
  chat gating before/after approval, and the full Bum session lifecycle
  (book → approve → start → paid extension → end).
- **`social.test.js`** — posts/likes/comments/follows, contact-info
  filtering on captions and comments, and badge auto-recomputation
  (including the case where a creator's badge drops and Bum sessions get
  auto-disabled).
- **`webhooks.test.js`** — signature verification, `charge.success`
  idempotency (firing the same webhook twice doesn't double-process), and
  the `transfer.failed` / `refund.processed` async confirmation paths that
  the happy-path tests don't reach.

*(This test suite passed 21/21 against the pre-migration SQLite backend —
the assertions and flow logic haven't changed, only the storage layer
underneath them. It has not yet been re-run against Postgres — do that
first, before relying on any of the "verified" claims below.)*

## Testing manually (without a live Paystack account)

`scripts/mock-paystack-server.js` mimics Paystack's charge/transfer/refund
endpoints and fires real signed webhooks back at a running backend — good
for exploratory testing against a real server instance (as opposed to the
automated suite, which spins up its own in-process instance per file):

```bash
# Terminal 1
node src/server.js

# Terminal 2 — same PAYSTACK_SECRET_KEY as your .env, so webhook signatures match
PAYSTACK_SECRET_KEY=<same as .env> node scripts/mock-paystack-server.js
```

Then set `PAYSTACK_BASE_URL="http://localhost:5555"` in `.env` (only for
local testing — never set this in production) and restart the backend.

**What was verified this way against the pre-migration SQLite backend**
(see the migration-status warning at the top — re-verify against Postgres):
- Signup validation (password length, handle format, contact-info leak filter on handles)
- Bio update blocked when it contains contact info
- Contact request: initiate → webhook confirms → `paid_hold` → approve → payout released → real contact info revealed to payer only
- Decline path: refund issued, status → `declined`, double-decline rejected (prevents double refund)
- Chat: blocked entirely before approval (403), unlocked after, contact-info-in-message still blocked
- Bum session: booking (duration-priced) → approve → start (remainingSec = mins×60) → paid extension (instant, no approval hold, +15min applied correctly) → end
- Authorization: payer can't approve/decline their own request, can't self-request, approval blocked until creator has a registered payout destination

## Environment variables

See `.env.example` for the full list with comments. The ones that matter most:

- `DATABASE_URL` — Supabase (or any Postgres) connection string. Use the
  connection-pooling URL (port 6543) if deploying to a serverless platform
  with many short-lived connections; the direct URL (port 5432) for a
  long-running server (Railway/Render/Fly).
- `TEST_DATABASE_URL` — separate Postgres for `npm test`. Never point this
  at production data.
- `JWT_SECRET` — must be a real random value in production; the server
  refuses to start with the placeholder if `NODE_ENV=production`.
- `PAYSTACK_SECRET_KEY` — from your Paystack dashboard. Used both for API
  calls and to verify webhook signatures (Paystack doesn't use a separate
  webhook secret).
- `PLATFORM_CUT` — your revenue share (0.30 = 30%), applied uniformly to
  contact reveals, Bum sessions, and extensions.

## Deployment

This needs a host that isn't network-restricted the way the dev sandbox
that built this is — Railway, Render, Fly.io, and Vercel (serverless
functions) all work and can reach both `api.paystack.co` and Supabase
normally.

1. Deploy this `backend/` folder.
2. Set all env vars from `.env.example` in your host's dashboard (never commit `.env`).
3. In the Paystack dashboard, set your webhook URL to
   `https://your-deployed-backend.com/api/webhooks/paystack`.
4. Point `DATABASE_URL` at your Supabase project — tables auto-create on
   first startup.

## API surface added for the social/content layer

Beyond the payment engine (auth, contact-requests, bum-sessions, chat,
webhooks — all covered above), this now also includes:

- **`POST/GET/DELETE /api/posts`**, `/api/posts/:id/like`,
  `/api/posts/:id/comments` — captions and comments run through the same
  contact-info filter as everything else.
- **`POST/DELETE /api/users/:userId/follow`**, `/api/users/:userId/followers`,
  `/api/users/:userId/following`.
- **`GET/POST /api/challenges`**, `/api/challenges/:id/entries`.
- Video/media files themselves are **not** stored here — `posts.video_url`
  expects a URL from wherever that ends up living (S3/Cloudinary/Mux etc.).
  This backend owns the social graph and engagement data, not media hosting.

## Badge computation

`src/lib/badges.js` computes badges from real activity (moves posted +
follower count, both required — see the file for the exact thresholds and
the one documented anchor point they're extrapolated from). `recomputeBadge`
runs automatically after posting/deleting a post and after follow/unfollow,
and auto-disables `bumEnabled` if a creator's badge drops below Bum-session
eligibility. `scripts/dev-set-badge.js` still exists for manually overriding
a badge during testing/demos.

## Known gaps (what's genuinely still missing)

- **Postgres migration is unverified against a real database** — see the
  warning at the top of this file. This is the most important gap right now.
- **No media storage/CDN.** `video_url` is metadata-only — actual file
  upload/hosting needs S3, Cloudinary, Mux, or similar wired in separately.
- **Chat and notifications are poll-based, not real-time.** `GET
  /api/chat/:userId/messages` and `GET /api/notifications` need to be
  polled by a client; there's no websocket/SSE push. Fine for an MVP,
  worth adding before chat needs to feel instant.
- **No admin/moderation tooling.** Nothing here lets an operator review
  flagged content, handle disputes, or manually resolve a `payout_failed`
  reconciliation case (see `handleTransferFailed` in
  `escrow.service.js`) other than direct DB access.
- **Paystack webhook event shapes for `transfer.success`/`transfer.failed`/
  `refund.processed` are implemented against Paystack's documented payloads
  but weren't verified against a live account.** Check your Paystack
  dashboard's webhook event log against the field paths in
  `escrow.service.js` before relying on this in production.
- **Rate limiting is in-memory** (`express-rate-limit`'s default store) —
  fine for one instance, resets on restart, and won't be shared correctly
  across multiple instances if you scale horizontally. Swap in a
  Redis-backed store (`rate-limit-redis`) at that point.
