import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { sql } from "drizzle-orm";
import env from "./env.js";
import logger from "../utils/logger.js";
import { pools, poolParticipants, sessions, users } from "../db/schema.js";

let sqlite;
let db;

const ensureDatabaseFile = () => {
  if (!env.databaseUrl?.startsWith("file:")) return null;
  const filePath = env.databaseUrl.replace("file:", "");
  const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
  const dir = path.dirname(absolutePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return absolutePath;
};

const applyMigrations = () => {
  sqlite.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      telegram_id TEXT UNIQUE,
      username TEXT,
      first_name TEXT,
      last_name TEXT,
      language_code TEXT,
      last_seen_at INTEGER DEFAULT (unixepoch() * 1000),
      created_at INTEGER DEFAULT (unixepoch() * 1000),
      updated_at INTEGER DEFAULT (unixepoch() * 1000)
    );

    CREATE TABLE IF NOT EXISTS pools (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      amount_type TEXT NOT NULL DEFAULT 'total',
      total_amount REAL,
      per_person_amount REAL,
      share_amount REAL,
      expected_participants_count INTEGER NOT NULL DEFAULT 1,
      payment_details TEXT NOT NULL,
      join_code TEXT NOT NULL UNIQUE,
      currency TEXT NOT NULL DEFAULT 'RUB',
      is_closed INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER DEFAULT (unixepoch() * 1000),
      updated_at INTEGER DEFAULT (unixepoch() * 1000),
      FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS pool_participants (
      id TEXT PRIMARY KEY,
      pool_id TEXT NOT NULL,
      user_id TEXT,
      display_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'invited',
      paid_amount REAL NOT NULL DEFAULT 0,
      expected_amount REAL NOT NULL DEFAULT 0,
      pay_method TEXT NOT NULL DEFAULT 'unknown',
      note TEXT,
      joined_at INTEGER,
      marked_at INTEGER,
      confirmed_at INTEGER,
      created_at INTEGER DEFAULT (unixepoch() * 1000),
      updated_at INTEGER DEFAULT (unixepoch() * 1000),
      FOREIGN KEY (pool_id) REFERENCES pools(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_pool_participants_pool ON pool_participants(pool_id);
    CREATE INDEX IF NOT EXISTS idx_pool_participants_user ON pool_participants(user_id);

    CREATE TABLE IF NOT EXISTS sessions (
      key TEXT PRIMARY KEY,
      data TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER DEFAULT (unixepoch() * 1000),
      updated_at INTEGER DEFAULT (unixepoch() * 1000)
    );
  `);
};

export const connectToDatabase = async () => {
  try {
    const filePath = ensureDatabaseFile();
    sqlite = new Database(filePath || ":memory:");
    applyMigrations();
    db = drizzle(sqlite);
    logger.info({ url: env.databaseUrl }, "✅ Connected to SQLite database");
    return db;
  } catch (error) {
    logger.error({ err: error }, "❌ Error connecting to SQLite");
    process.exit(1);
  }
};

export const disconnectFromDatabase = async () => {
  try {
    sqlite?.close?.();
    logger.info("✅ SQLite connection closed");
  } catch (error) {
    logger.error({ err: error }, "❌ Error closing SQLite connection");
  }
};

export const getDb = () => db;
export { users, pools, poolParticipants, sessions, sql };

export default getDb;
