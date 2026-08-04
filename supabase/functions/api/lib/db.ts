import pg from "npm:pg@8.11.3";

const { Pool } = pg;

// DATABASE_URL must be set explicitly as a function secret:
//   supabase secrets set DATABASE_URL="postgresql://postgres:[password]@[project].supabase.co:5432/postgres"
// (Supabase does NOT auto-inject a database connection string into Edge
// Functions by default — this is a common assumption worth stating
// plainly rather than leaving implicit.)
const DATABASE_URL = Deno.env.get("DATABASE_URL");
if (!DATABASE_URL) {
  throw new Error("DATABASE_URL is required — set it with `supabase secrets set DATABASE_URL=...`.");
}

// Matches the Node backend's SSL-detection approach (src/db/index.js) —
// Edge Functions are a separate execution context from Supabase's Postgres
// host, not literally inside it, so this still needs the same SSL handling
// as any external connection.
const useSSL = /sslmode=require|supabase\.co|neon\.tech|render\.com/.test(DATABASE_URL);

export const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: useSSL ? { rejectUnauthorized: false } : undefined,
  // Edge Function instances are short-lived relative to a normal server —
  // cap the pool small so we're not holding onto idle connections a cold
  // instance never gets to release cleanly.
  max: 5,
  // Test isolation: each test file runs in its own Postgres schema so
  // `deno test`'s parallel test execution can't have two files stomp on
  // each other's data — see __tests__/helpers/testEnv.ts. Production/dev
  // leave this unset and use the default "public" schema.
  options: Deno.env.get("PG_SEARCH_PATH") ? `-c search_path=${Deno.env.get("PG_SEARCH_PATH")}` : undefined,
});

export const db = {
  query: (text: string, params?: unknown[]) => pool.query(text, params),
};

export async function migrate() {
  const { SCHEMA_SQL } = await import("./schema.ts");
  await pool.query(SCHEMA_SQL);
  const { ensureVideosBucket } = await import("./storage.ts");
  await ensureVideosBucket();
}
