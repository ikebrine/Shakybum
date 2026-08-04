import crypto from "crypto";
import pg from "pg";
import { createMockPaystackApp } from "../../lib/mockPaystackApp.js";

/**
 * Sets up an isolated backend + mock-Paystack pair for one test file.
 *
 * REQUIRES a real, reachable Postgres — set TEST_DATABASE_URL (falls back
 * to DATABASE_URL) before running `npm test`. This is a genuine change
 * from the pre-Postgres-migration version of this suite, which used a
 * throwaway SQLite file and needed no external services; that's the
 * trade-off of moving off SQLite (see backend/README.md).
 *
 * Isolation: each test file gets its own Postgres SCHEMA (not a separate
 * database — works fine on Supabase's single-database-per-project setup),
 * created before the app imports run and dropped on teardown. This matters
 * because `node --test` runs test files in parallel by default; without
 * per-file schemas, two files sharing one set of tables would corrupt each
 * other's state mid-run.
 *
 * Must be called and awaited BEFORE importing anything from src/server.js
 * or src/lib/paystack.js in the calling test file, since those read
 * process.env at import/call time.
 */
export async function setupTestEnv({ autoSucceed = true, delayMs = 30 } = {}) {
  const baseConnectionString = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
  if (!baseConnectionString) {
    throw new Error(
      "TEST_DATABASE_URL (or DATABASE_URL) must point at a real Postgres instance to run tests — " +
      "see backend/README.md 'Running tests' for setup."
    );
  }

  const schema = `test_${crypto.randomBytes(6).toString("hex")}`;

  // Bootstrap: create the schema using a one-off client BEFORE the app's
  // pooled connections (which will have this schema baked into their
  // startup options) try to use it — Postgres won't auto-create a schema
  // referenced only via search_path.
  const bootstrapClient = new pg.Client({ connectionString: baseConnectionString });
  await bootstrapClient.connect();
  await bootstrapClient.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
  await bootstrapClient.end();

  process.env.DATABASE_URL = baseConnectionString;
  process.env.PG_SEARCH_PATH = schema;
  process.env.JWT_SECRET = crypto.randomBytes(32).toString("hex");
  process.env.JWT_EXPIRES_IN = "1h";
  process.env.PAYSTACK_SECRET_KEY = "sk_test_mock_secret_for_tests_only";
  process.env.PLATFORM_CUT = "0.30";
  process.env.PAYMENT_RATE_LIMIT_MAX = "10000"; // real limit (10/min) would be hit within a few test cases
  process.env.NODE_ENV = "test";

  // Import AFTER env vars above are set (db/index.js, auth.js, pricing.js
  // all read them at import time) but BEFORE we know the mock's port —
  // lib/paystack.js reads PAYSTACK_BASE_URL lazily inside its functions
  // specifically so this ordering works: we set that particular var
  // further down, once we know it.
  const { default: app } = await import("../../server.js");
  const { pool } = await import("../../db/index.js");

  const backendServer = app.listen(0);
  await new Promise((resolve) => backendServer.once("listening", resolve));
  const backendPort = backendServer.address().port;

  const mockApp = createMockPaystackApp({
    webhookUrl: `http://localhost:${backendPort}/api/webhooks/paystack`,
    secretKey: process.env.PAYSTACK_SECRET_KEY,
    autoSucceed,
    delayMs,
  });
  const mockServer = mockApp.listen(0);
  await new Promise((resolve) => mockServer.once("listening", resolve));
  const mockPort = mockServer.address().port;

  process.env.PAYSTACK_BASE_URL = `http://localhost:${mockPort}`;

  const baseUrl = `http://localhost:${backendPort}/api`;

  async function api(method, urlPath, { token, body } = {}) {
    const res = await fetch(`${baseUrl}${urlPath}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    let json = null;
    try { json = await res.json(); } catch { /* empty body */ }
    return { status: res.status, body: json };
  }

  async function signup({ email, password = "password123", handle, name }) {
    const res = await api("POST", "/auth/signup", { body: { email, password, handle, name } });
    if (res.status !== 201) throw new Error(`signup failed: ${JSON.stringify(res.body)}`);
    return res.body; // { token, user }
  }

  async function fireWebhookEvent(event) {
    const body = JSON.stringify(event);
    const signature = crypto.createHmac("sha512", process.env.PAYSTACK_SECRET_KEY).update(body).digest("hex");
    const res = await fetch(`http://localhost:${backendPort}/api/webhooks/paystack`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-paystack-signature": signature },
      body,
    });
    return res.status;
  }

  async function teardown() {
    await new Promise((resolve) => backendServer.close(resolve));
    await new Promise((resolve) => mockServer.close(resolve));
    await pool.end(); // close this test's connection pool before dropping its schema
    const cleanupClient = new pg.Client({ connectionString: baseConnectionString });
    await cleanupClient.connect();
    await cleanupClient.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await cleanupClient.end();
  }

  return { api, signup, teardown, fireWebhookEvent, backendPort, mockPort };
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Base36 (not raw Date.now()) — a pure base-10 timestamp is 13 consecutive
// digits, which the contact-info leak filter correctly flags as a phone
// number when it ends up inside a generated handle. This is test-data
// hygiene, not a workaround for a backend bug — the filter catching it was
// actually the intended real-world behavior.
export const uniqueStamp = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
