import pg from "pg";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required — set it to your Postgres/Supabase connection string.");
}

// Supabase (and most managed Postgres) requires SSL; reject-unauthorized is
// disabled because these providers use certs not in Node's default trust
// store — this matches Supabase's own connection examples, not a security
// shortcut specific to this app. Local Postgres (no `?sslmode=require` in
// the URL) skips SSL entirely.
const useSSL = /sslmode=require|supabase\.co|neon\.tech|render\.com/.test(process.env.DATABASE_URL);

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: useSSL ? { rejectUnauthorized: false } : undefined,
  // Test isolation: each test file runs in its own Postgres schema so
  // `node --test`'s default parallel-file execution can't have two files
  // stomp on each other's data — see __tests__/helpers/testEnv.js.
  // Production/dev leave this unset and use the default "public" schema.
  options: process.env.PG_SEARCH_PATH ? `-c search_path=${process.env.PG_SEARCH_PATH}` : undefined,
});

// Thin wrapper kept as `db.query` (rather than exporting `pool` everywhere)
// so repositories have one consistent call shape and swapping drivers again
// later only touches this file.
export const db = {
  query: (text, params) => pool.query(text, params),
};

export async function migrate() {
  const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf-8");
  await pool.query(schema);
}
