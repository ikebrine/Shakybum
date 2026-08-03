# Shakybum Backend

Real Express + SQLite backend covering: escrow-based payments (contact
reveals, duration-billed Bum sessions, paid extensions), Paystack MoMo
integration with proper async webhook confirmation, chat gating, the social
graph (posts/likes/comments/follows/challenges), badge computation from
real activity, and contact-info leak filtering — all backed by an automated
test suite, not just manual spot-checks.

**Test suite: 21/21 passing.** Run `npm test` — see "Testing" below for how
it works without a live Paystack account.

## Stack

- **Express** — HTTP layer
- **better-sqlite3** — synchronous SQLite driver, zero external setup. Fine
  for dev and small-scale single-instance production; see "Scaling to
  Postgres" below for when to move off it.
- **JWT** (jsonwebtoken) — auth
- **bcryptjs** — password hashing
- **Paystack** — MoMo charges, transfers (payouts), refunds, webhooks

*(A Prisma+Postgres version of this schema was the original plan — dropped
because Prisma's engine binary download is blocked by this dev sandbox's
network policy. `better-sqlite3` was chosen specifically because it could
actually be installed and tested here, rather than shipped unverified. The
schema in `src/db/schema.sql` is deliberately close to portable SQL if you
want to move to Postgres later — see below.)*

## Setup

```bash
npm install
cp .env.example .env
# edit .env: set a real JWT_SECRET (openssl rand -hex 32) and your Paystack keys
node -e "import('./src/db/index.js').then(({migrate}) => migrate())"  # creates dev.db
npm run dev
```

Server runs on `http://localhost:4000` by default. `GET /health` should
return `{"ok":true}`.

## Automated test suite

```bash
npm test
```

21 tests across 4 files, using an in-process mock Paystack server (fast
delays, no manual setup needed — this is different from the standalone
`scripts/mock-paystack-server.js`, though both share the same underlying
`src/lib/mockPaystackApp.js` factory):

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

### How the test harness solves the "can't reach api.paystack.co" problem

`src/__tests__/helpers/testEnv.js` starts the real backend app and an
in-process mock Paystack server on ephemeral ports, wires them to each
other (backend's webhook URL → mock; mock's base URL → backend, via
`PAYSTACK_BASE_URL`), and gives each test file a fresh SQLite database.
Each `node --test` file runs in its own process, so parallel test files
never collide on ports or data.

## Testing manually (without a live Paystack account)

For manual/exploratory testing against a real running server (as opposed
to the automated suite above), `scripts/mock-paystack-server.js` does the
same job as a standalone CLI process:

```bash
# Terminal 1
node src/server.js

# Terminal 2 — same PAYSTACK_SECRET_KEY as your .env, so webhook signatures match
PAYSTACK_SECRET_KEY=<same as .env> node scripts/mock-paystack-server.js
```

Then set `PAYSTACK_BASE_URL="http://localhost:5555"` in `.env` (commented
out by default — only for local testing, never set this in production) and
restart the backend. Every `initiateMomoCharge` call now hits the mock
instead of the real API.

**What was actually verified this way**, end to end:
- Signup validation (password length, handle format, contact-info leak filter on handles)
- Bio update blocked when it contains contact info
- Contact request: initiate → webhook confirms → `paid_hold` → approve → payout released → real contact info revealed to payer only
- Decline path: refund issued, status → `declined`, double-decline rejected (prevents double refund)
- Chat: blocked entirely before approval (403), unlocked after, contact-info-in-message still blocked
- Bum session: booking (duration-priced) → approve → start (remainingSec = mins×60) → paid extension (instant, no approval hold, +15min applied correctly) → end
- Authorization: payer can't approve/decline their own request, can't self-request, approval blocked until creator has a registered payout destination

## Environment variables

See `.env.example` for the full list with comments. The ones that matter most:

- `JWT_SECRET` — must be a real random value in production; the server
  refuses to start with the placeholder if `NODE_ENV=production`.
- `PAYSTACK_SECRET_KEY` — from your Paystack dashboard. Used both for API
  calls and to verify webhook signatures (Paystack doesn't use a separate
  webhook secret).
- `PLATFORM_CUT` — your revenue share (0.30 = 30%), applied uniformly to
  contact reveals, Bum sessions, and extensions.

## Deployment

This needs a host that isn't network-restricted the way this dev sandbox
is — Railway, Render, and Fly.io all work and have free/cheap tiers, and
all can reach `api.paystack.co` normally.

1. Deploy this `backend/` folder.
2. Set all env vars from `.env.example` in your host's dashboard (never commit `.env`).
3. In the Paystack dashboard, set your webhook URL to
   `https://your-deployed-backend.com/api/webhooks/paystack`.
4. `better-sqlite3` writes to a local file (`DATABASE_PATH`) — make sure
   your host's filesystem persists across deploys/restarts (Railway and
   Render both support persistent volumes), or move to Postgres first (see
   below) if you're deploying somewhere with ephemeral disk.

### Scaling to Postgres

`better-sqlite3` is single-writer and file-based — fine for one backend
instance, not for horizontal scaling across multiple instances. When you
need that:
1. Stand up a Postgres instance (Railway/Render/Supabase/Neon all have
   cheap tiers).
2. The SQL in `src/db/schema.sql` is close to portable already — main
   changes needed: `TEXT` → keep as-is (uuid strings work fine in Postgres
   too), `datetime('now')` → `now()`, `INTEGER` booleans → real `BOOLEAN`.
3. Swap `src/db/index.js` and the `src/repositories/*.js` files for a
   Postgres driver (`pg` or `postgres.js`) — the repository function
   signatures are already the seam that isolates the rest of the app from
   the storage layer, so this is a contained change.

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

- **No media storage/CDN.** As noted above, `video_url` is metadata-only —
  actual file upload/hosting needs S3, Cloudinary, Mux, or similar wired in
  separately.
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
  but weren't verified against a live account** (this dev environment can't
  reach `api.paystack.co`). Check your Paystack dashboard's webhook event
  log against the field paths in `escrow.service.js` before relying on this
  in production.
- **Rate limiting is in-memory** (`express-rate-limit`'s default store) —
  fine for one instance, resets on restart, and won't be shared correctly
  across multiple instances if you scale horizontally. Swap in a
  Redis-backed store (`rate-limit-redis`) at that point.
