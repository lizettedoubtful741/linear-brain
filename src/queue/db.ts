import { Database } from "bun:sqlite";
import { mkdirSync } from "fs";
import { dirname } from "path";
import { config } from "../config.ts";

function initDb(): Database {
  // Ensure the data directory exists
  const dir = dirname(config.databasePath);
  mkdirSync(dir, { recursive: true });

  const db = new Database(config.databasePath);

  // WAL mode for better concurrent read performance
  db.run("PRAGMA journal_mode = WAL");

  db.run(`
    CREATE TABLE IF NOT EXISTS proposals (
      id               TEXT PRIMARY KEY,
      created_at       TEXT NOT NULL,
      type             TEXT NOT NULL,
      summary          TEXT NOT NULL,
      reasoning        TEXT NOT NULL,
      payload          TEXT NOT NULL,
      status           TEXT NOT NULL DEFAULT 'pending',
      reviewed_by      TEXT,
      reviewed_at      TEXT,
      feedback         TEXT,
      executed_at      TEXT,
      execution_result TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id           TEXT PRIMARY KEY,
      created_at   TEXT NOT NULL,
      action       TEXT NOT NULL,
      proposal_id  TEXT,
      details      TEXT,
      FOREIGN KEY (proposal_id) REFERENCES proposals(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS dashboard_snapshots (
      id           TEXT PRIMARY KEY,
      created_at   TEXT NOT NULL,
      team_id      TEXT NOT NULL,
      data         TEXT NOT NULL,
      issue_count  INTEGER NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS insights (
      id           TEXT PRIMARY KEY,
      created_at   TEXT NOT NULL,
      team_id      TEXT NOT NULL,
      content      TEXT NOT NULL,
      issue_count  INTEGER NOT NULL
    )
  `);

  console.log(`[db] Opened database at ${config.databasePath}`);
  return db;
}

export const db = initDb();
