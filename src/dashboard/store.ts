import { db } from "../queue/db.ts";
import type { DashboardSnapshot } from "./types.ts";

function generateId(): string {
  const timestamp = Date.now().toString(36).toUpperCase().padStart(10, "0");
  const random = Math.random().toString(36).slice(2, 14).toUpperCase().padStart(12, "0");
  return `${timestamp}${random}`;
}

function now(): string {
  return new Date().toISOString();
}

export interface SnapshotRow {
  id: string;
  created_at: string;
  team_id: string;
  data: string;
  issue_count: number;
}

export function saveSnapshot(teamId: string, data: DashboardSnapshot): { id: string; created_at: string } {
  const id = generateId();
  const created_at = now();
  const json = JSON.stringify(data);

  db.run(
    `INSERT INTO dashboard_snapshots (id, created_at, team_id, data, issue_count) VALUES (?, ?, ?, ?, ?)`,
    [id, created_at, teamId, json, data.summary.total_issues]
  );

  // Prune snapshots older than 30 days
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  db.run(`DELETE FROM dashboard_snapshots WHERE created_at < ?`, [cutoff]);

  console.log(`[dashboard] Saved snapshot ${id} (${data.summary.total_issues} issues)`);
  return { id, created_at };
}

export function getLatestSnapshot(teamId: string): { id: string; created_at: string; data: DashboardSnapshot } | null {
  const row = db
    .query<SnapshotRow, string>(
      "SELECT * FROM dashboard_snapshots WHERE team_id = ? ORDER BY created_at DESC LIMIT 1"
    )
    .get(teamId);

  if (!row) return null;
  return { id: row.id, created_at: row.created_at, data: JSON.parse(row.data) as DashboardSnapshot };
}

export function getLastSnapshotTime(teamId: string): Date | null {
  const row = db
    .query<{ created_at: string }, string>(
      "SELECT created_at FROM dashboard_snapshots WHERE team_id = ? ORDER BY created_at DESC LIMIT 1"
    )
    .get(teamId);

  return row ? new Date(row.created_at) : null;
}
