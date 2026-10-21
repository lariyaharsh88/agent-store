import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { SEED_PRODUCTS, DEFAULT_SETTINGS } from "./seed";

const g = globalThis as unknown as { __agentStoreDb?: DatabaseSync };

const SCHEMA = `
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY, slug TEXT UNIQUE NOT NULL, name TEXT NOT NULL, description TEXT NOT NULL,
  category TEXT NOT NULL, price REAL NOT NULL, base_price REAL NOT NULL, cost REAL NOT NULL,
  stock INTEGER NOT NULL DEFAULT 0, emoji TEXT NOT NULL, hue INTEGER NOT NULL DEFAULT 220,
  tags TEXT NOT NULL DEFAULT '[]', sort_order INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, session_id TEXT NOT NULL, type TEXT NOT NULL,
  product_id TEXT, value REAL, meta TEXT
);
CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts);
CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id);
CREATE INDEX IF NOT EXISTS idx_events_type_product ON events(type, product_id);
CREATE TABLE IF NOT EXISTS carts (
  session_id TEXT NOT NULL, product_id TEXT NOT NULL, qty INTEGER NOT NULL, unit_price REAL NOT NULL,
  PRIMARY KEY(session_id, product_id)
);
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY, session_id TEXT NOT NULL, items TEXT NOT NULL, subtotal REAL NOT NULL,
  shipping REAL NOT NULL, total REAL NOT NULL, created_at TEXT NOT NULL, meta TEXT
);
CREATE TABLE IF NOT EXISTS experiments (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, surface TEXT NOT NULL, hypothesis TEXT, status TEXT NOT NULL,
  arms TEXT NOT NULL, conversion_event TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL,
  ended_at TEXT, winner_arm TEXT, outcome TEXT
);
CREATE INDEX IF NOT EXISTS idx_experiments_surface ON experiments(surface, status);
CREATE TABLE IF NOT EXISTS arm_stats (
  experiment_id TEXT NOT NULL, arm_id TEXT NOT NULL, impressions INTEGER NOT NULL DEFAULT 0,
  conversions INTEGER NOT NULL DEFAULT 0, revenue REAL NOT NULL DEFAULT 0, PRIMARY KEY(experiment_id, arm_id)
);
CREATE TABLE IF NOT EXISTS assignments (
  session_id TEXT NOT NULL, experiment_id TEXT NOT NULL, arm_id TEXT NOT NULL,
  converted INTEGER NOT NULL DEFAULT 0, exposed INTEGER NOT NULL DEFAULT 1, assigned_at TEXT NOT NULL,
  PRIMARY KEY(session_id, experiment_id)
);
CREATE TABLE IF NOT EXISTS agent_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, agent TEXT NOT NULL, tool TEXT NOT NULL,
  input TEXT NOT NULL, output TEXT NOT NULL, ok INTEGER NOT NULL, run_id TEXT
);
CREATE TABLE IF NOT EXISTS insights (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, agent TEXT NOT NULL, topic TEXT NOT NULL,
  text TEXT NOT NULL, evidence TEXT, confidence REAL
);
CREATE TABLE IF NOT EXISTS agent_runs (
  id TEXT PRIMARY KEY, started_at TEXT NOT NULL, finished_at TEXT, mode TEXT NOT NULL,
  summary TEXT, tool_calls INTEGER NOT NULL DEFAULT 0, ok INTEGER
);
`;

export function now(): string {
  return new Date().toISOString();
}

export function newId(prefix = ""): string {
  const id = randomUUID().replace(/-/g, "").slice(0, 12);
  return prefix ? `${prefix}_${id}` : id;
}

function seedIfEmpty(d: DatabaseSync) {
  const row = d.prepare("SELECT COUNT(*) AS n FROM products").get() as { n: number };
  if (row.n === 0) {
    const ins = d.prepare(
      `INSERT INTO products (id, slug, name, description, category, price, base_price, cost, stock, emoji, hue, tags, sort_order, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    );
    const ts = now();
    SEED_PRODUCTS.forEach((p, i) => {
      ins.run(newId("prd"), p.slug, p.name, p.description, p.category, p.price, p.price, p.cost, p.stock, p.emoji, p.hue, JSON.stringify(p.tags), i, ts, ts);
    });
  }
  const setIns = d.prepare("INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES (?, ?, ?)");
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) setIns.run(k, v, now());
}

export function db(): DatabaseSync {
  if (g.__agentStoreDb) return g.__agentStoreDb;
  const file = process.env.DATABASE_PATH || "./data/store.db";
  const abs = path.resolve(process.cwd(), file);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const d = new DatabaseSync(abs);
  d.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
  d.exec(SCHEMA);
  try { d.exec("ALTER TABLE assignments ADD COLUMN exposed INTEGER NOT NULL DEFAULT 1"); } catch { /* column exists */ }
  seedIfEmpty(d);
  g.__agentStoreDb = d;
  return d;
}

/** Wipe all behavioural data but keep the catalog and settings. */
export function resetData() {
  const d = db();
  d.exec("DELETE FROM events; DELETE FROM carts; DELETE FROM orders; DELETE FROM experiments; DELETE FROM arm_stats; DELETE FROM assignments; DELETE FROM agent_actions; DELETE FROM insights; DELETE FROM agent_runs;");
  d.exec("UPDATE products SET price = base_price");
  const setIns = d.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)");
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) setIns.run(k, v, now());
}
