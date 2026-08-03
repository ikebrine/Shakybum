# Shakybum Backend

Real Express + SQLite backend for the escrow-based payment system: contact
reveals, Bum sessions (duration-billed), the paid extension flow, chat
gating, and Paystack MoMo integration.

This isn't a stub — every flow below was actually run end-to-end against a
mock Paystack server during development (see "Testing" section) and every
listed check passed, including the security/authorization edge cases.

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

## Testing without a real Paystack account

`scripts/mock-paystack-server.js` mimics Paystack's charge/transfer/refund
endpoints and — critically — fires a real signed `charge.success` webhook
back at your running backend a moment after a charge is initiated, the same
way Paystack does once a user approves the MoMo prompt on their phone. This
lets you exercise the *entire* payment state machine locally, including the
webhook round-trip, without a live Paystack account.

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

## Known gaps

- **Badge/reputation system isn't built.** Badges (Newcomer → Diamond,
  which drive contact-reveal and Bum-session pricing) are currently only
  settable via `scripts/dev-set-badge.js`, a dev-only tool. A real system
  would compute this from moves posted, followers, engagement, etc. — that
  logic lives in the social/content features, which are out of this
  backend's scope (see the frontend `shakybum.jsx` for where badges are
  currently just hardcoded mock data).
- **No content/social endpoints** (posts, videos, likes, comments,
  follows, challenges). This backend covers auth + the monetization/escrow
  engine + chat only — the frontend's social features still run on local
  mock state.
- **Webhook events beyond `charge.success` aren't handled** —
  `transfer.success` / `transfer.failed` / `refund.processed` are noted in
  `routes/payments.routes.js` but not wired up. Right now, a failed payout
  transfer would throw synchronously in `escrow.service.js` at approval
  time (since `initiateTransfer` awaits Paystack's immediate response), so
  this mostly matters for transfers that fail *asynchronously* after
  initially being accepted — worth adding before real money is at stake.
- **No automated test suite** — the verification above was run manually,
  end to end, against the mock server. Given the amount of state-machine
  logic in `escrow.service.js`, converting those manual runs into a
  `node --test` suite (see the `test` script in `package.json`) is the
  natural next step before this handles real payments.
