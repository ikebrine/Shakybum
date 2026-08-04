import pg from "npm:pg@8.11.3";
import { createMockPaystackApp } from "./mockPaystackApp.ts";

/**
 * Sets up an isolated app + mock-Paystack pair for one test file. Both run
 * as Deno.serve() listeners on ephemeral ports WITHIN this same test
 * process — not separate OS processes — so `deno test` manages the whole
 * lifecycle and there's no subprocess/backgrounding to fight (that's a
 * lesson learned the hard way getting this backend running manually in
 * this dev sandbox — see supabase/README.md).
 *
 * REQUIRES a real, reachable Postgres — set TEST_DATABASE_URL (falls back
 * to DATABASE_URL). Isolation: each call creates its own Postgres SCHEMA,
 * dropped on teardown, so parallel test files can't corrupt each other's
 * data — same approach as the Node backend's test suite.
 *
 * Must be called and awaited BEFORE importing anything from ../../index.ts
 * or ../../lib/paystack.ts in the calling test file, since those read
 * Deno.env at import/call time.
 */
export async function setupTestEnv(opts: { autoSucceed?: boolean; delayMs?: number } = {}) {
  const { autoSucceed = true, delayMs = 20 } = opts;

  const baseConnectionString = Deno.env.get("TEST_DATABASE_URL") || Deno.env.get("DATABASE_URL");
  if (!baseConnectionString) {
    throw new Error(
      "TEST_DATABASE_URL (or DATABASE_URL) must point at a real Postgres instance to run tests — see supabase/README.md."
    );
  }

  const schema = `test_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;

  const bootstrapClient = new pg.Client({ connectionString: baseConnectionString });
  await bootstrapClient.connect();
  await bootstrapClient.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
  await bootstrapClient.end();

  Deno.env.set("DATABASE_URL", baseConnectionString);
  Deno.env.set("PG_SEARCH_PATH", schema);
  Deno.env.set("JWT_SECRET", crypto.randomUUID().replace(/-/g, ""));
  Deno.env.set("JWT_EXPIRES_IN", "1h");
  Deno.env.set("PAYSTACK_SECRET_KEY", "sk_test_mock_secret_for_tests_only");
  Deno.env.set("PLATFORM_CUT", "0.30");
  Deno.env.set("PAYMENT_RATE_LIMIT_MAX", "10000");
  Deno.env.set("CORS_ORIGIN", "*");

  // Import AFTER env vars above are set (db.ts/auth.ts/pricing.ts read them
  // at import time) but BEFORE we know the mock's port — lib/paystack.ts
  // reads PAYSTACK_BASE_URL lazily inside its functions specifically so
  // this ordering works.
  const { default: app } = await import("../../app.ts");

  const appServer = Deno.serve({ port: 0, onListen: () => {} }, app.fetch);
  const appPort = (appServer.addr as Deno.NetAddr).port;
  const appBase = `http://localhost:${appPort}/functions/v1/api`;

  const mockApp = createMockPaystackApp({
    webhookUrl: `${appBase}/webhooks/paystack`,
    secretKey: Deno.env.get("PAYSTACK_SECRET_KEY")!,
    autoSucceed,
    delayMs,
  });
  const mockServer = Deno.serve({ port: 0, onListen: () => {} }, mockApp.fetch);
  const mockPort = (mockServer.addr as Deno.NetAddr).port;

  Deno.env.set("PAYSTACK_BASE_URL", `http://localhost:${mockPort}`);

  async function api(method: string, path: string, opts: { token?: string; body?: unknown } = {}) {
    const { token, body } = opts;
    const res = await fetch(`${appBase}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    let json: any = null;
    try { json = await res.json(); } catch { /* empty body */ }
    return { status: res.status, body: json };
  }

  async function signup(opts: { email: string; password?: string; handle: string; name: string }) {
    const { email, password = "password123", handle, name } = opts;
    const res = await api("POST", "/auth/signup", { body: { email, password, handle, name } });
    if (res.status !== 201) throw new Error(`signup failed: ${JSON.stringify(res.body)}`);
    return res.body; // { token, user }
  }

  async function fireWebhookEvent(event: unknown) {
    const crypto_ = await import("node:crypto");
    const body = JSON.stringify(event);
    const signature = crypto_.default.createHmac("sha512", Deno.env.get("PAYSTACK_SECRET_KEY")!).update(body).digest("hex");
    const res = await fetch(`${appBase}/webhooks/paystack`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-paystack-signature": signature },
      body,
    });
    return res.status;
  }

  async function teardown() {
    await appServer.shutdown();
    await mockServer.shutdown();
    const { pool } = await import("../../lib/db.ts");
    await pool.end();
    const cleanupClient = new pg.Client({ connectionString: baseConnectionString });
    await cleanupClient.connect();
    await cleanupClient.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await cleanupClient.end();
  }

  return { api, signup, teardown, fireWebhookEvent, appPort, mockPort };
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Base36 (not raw Date.now()) — a pure base-10 timestamp is 13 consecutive
// digits, which the contact-info leak filter correctly flags as a phone
// number when it ends up inside a generated handle. Same lesson learned
// porting the Node test suite.
export const uniqueStamp = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
