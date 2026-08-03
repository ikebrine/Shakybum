import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, "../../dev.db");

export const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL"); // safe concurrent reads while a write is in flight
db.pragma("foreign_keys = ON");

export function migrate() {
  const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf-8");
  db.exec(schema);
}
