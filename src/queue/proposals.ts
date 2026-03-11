import { db } from "./db.ts";

// --- Types ---

export type ProposalType = "create_issue" | "update_issue" | "add_comment" | "move_issue";
export type ProposalStatus = "pending" | "approved" | "rejected" | "executed" | "expired";

export interface Proposal {
  id: string;
  created_at: string;
  type: ProposalType;
  summary: string;
  reasoning: string;
  payload: string; // JSON string
  status: ProposalStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  feedback: string | null;
  executed_at: string | null;
  execution_result: string | null;
}

export interface CreateProposalInput {
  type: ProposalType;
  summary: string;
  reasoning: string;
  payload: unknown;
}

// --- ULID-style ID generator ---

function generateId(): string {
  const timestamp = Date.now().toString(36).toUpperCase().padStart(10, "0");
  const random = Math.random().toString(36).slice(2, 14).toUpperCase().padStart(12, "0");
  return `${timestamp}${random}`;
}

function now(): string {
  return new Date().toISOString();
}

// --- Audit log ---

function auditLog(action: string, proposalId: string | null, details?: unknown): void {
  db.run(
    `INSERT INTO audit_log (id, created_at, action, proposal_id, details)
     VALUES (?, ?, ?, ?, ?)`,
    [generateId(), now(), action, proposalId, details ? JSON.stringify(details) : null]
  );
}

// --- Proposal CRUD ---

const VALID_TYPES: ProposalType[] = ["create_issue", "update_issue", "add_comment", "move_issue"];

export function createProposal(input: CreateProposalInput): Proposal {
  if (!VALID_TYPES.includes(input.type)) {
    throw new Error(`Invalid proposal type: ${input.type}`);
  }

  const id = generateId();
  const created_at = now();
  const payload = JSON.stringify(input.payload);

  db.run(
    `INSERT INTO proposals (id, created_at, type, summary, reasoning, payload, status)
     VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
    [id, created_at, input.type, input.summary, input.reasoning, payload]
  );

  auditLog("proposal_created", id, { type: input.type, summary: input.summary });
  console.log(`[proposal-queue] Created proposal ${id} (${input.type})`);

  return getProposal(id)!;
}

export function getProposal(id: string): Proposal | null {
  return db.query<Proposal, string>("SELECT * FROM proposals WHERE id = ?").get(id) ?? null;
}

export function listProposals(status?: ProposalStatus): Proposal[] {
  if (status) {
    return db
      .query<Proposal, string>("SELECT * FROM proposals WHERE status = ? ORDER BY created_at DESC")
      .all(status);
  }
  return db.query<Proposal, []>("SELECT * FROM proposals ORDER BY created_at DESC").all();
}

export function approveProposal(id: string, reviewedBy = "user"): Proposal {
  const proposal = getProposal(id);
  if (!proposal) throw new Error(`Proposal ${id} not found`);
  if (proposal.status !== "pending") {
    throw new Error(`Cannot approve proposal ${id} with status '${proposal.status}'`);
  }

  const reviewed_at = now();
  db.run(
    `UPDATE proposals SET status = 'approved', reviewed_by = ?, reviewed_at = ? WHERE id = ?`,
    [reviewedBy, reviewed_at, id]
  );

  auditLog("approved", id, { reviewed_by: reviewedBy });
  console.log(`[proposal-queue] Approved proposal ${id}`);

  return getProposal(id)!;
}

export function rejectProposal(id: string, feedback: string, reviewedBy = "user"): Proposal {
  const proposal = getProposal(id);
  if (!proposal) throw new Error(`Proposal ${id} not found`);
  if (proposal.status !== "pending") {
    throw new Error(`Cannot reject proposal ${id} with status '${proposal.status}'`);
  }

  const reviewed_at = now();
  db.run(
    `UPDATE proposals SET status = 'rejected', reviewed_by = ?, reviewed_at = ?, feedback = ? WHERE id = ?`,
    [reviewedBy, reviewed_at, feedback, id]
  );

  auditLog("rejected", id, { reviewed_by: reviewedBy, feedback });
  console.log(`[proposal-queue] Rejected proposal ${id}`);

  return getProposal(id)!;
}

export function expireStaleProposals(olderThanMs = 7 * 24 * 60 * 60 * 1000): number {
  const cutoff = new Date(Date.now() - olderThanMs).toISOString();
  const stale = db
    .query<Proposal, string>(
      "SELECT * FROM proposals WHERE status = 'pending' AND created_at < ?"
    )
    .all(cutoff);

  for (const proposal of stale) {
    db.run("UPDATE proposals SET status = 'expired' WHERE id = ?", [proposal.id]);
    auditLog("expired", proposal.id, { reason: "stale" });
  }

  if (stale.length > 0) {
    console.log(`[proposal-queue] Expired ${stale.length} stale proposals`);
  }

  return stale.length;
}
