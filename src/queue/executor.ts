/**
 * executor.ts — the ONLY module that triggers Linear write operations.
 *
 * Takes an approved proposal ID, double-checks the approval status,
 * dispatches to writer.ts, logs the result, and marks the proposal executed.
 *
 * If status is not 'approved', it throws — no exceptions.
 */

import { db } from "./db.ts";
import { getProposal } from "./proposals.ts";
import { createIssue, updateIssue, addComment } from "../linear/writer.ts";

// --- Audit log helper (local copy to avoid circular imports) ---

function auditLog(action: string, proposalId: string, details?: unknown): void {
  const id =
    Date.now().toString(36).toUpperCase().padStart(10, "0") +
    Math.random().toString(36).slice(2, 14).toUpperCase().padStart(12, "0");
  db.run(
    `INSERT INTO audit_log (id, created_at, action, proposal_id, details) VALUES (?, ?, ?, ?, ?)`,
    [id, new Date().toISOString(), action, proposalId, details ? JSON.stringify(details) : null]
  );
}

// --- Payload types expected per proposal type ---

interface CreateIssuePayload {
  teamId: string;
  title: string;
  description?: string;
  assigneeId?: string;
  priority?: number;
  labelIds?: string[];
  stateId?: string;
}

interface UpdateIssuePayload {
  id: string;
  title?: string;
  description?: string;
  assigneeId?: string;
  priority?: number;
  labelIds?: string[];
  stateId?: string;
}

interface AddCommentPayload {
  issueId: string;
  body: string;
}

// --- Executor ---

export async function executeProposal(proposalId: string): Promise<unknown> {
  // Load and double-check approval status
  const proposal = getProposal(proposalId);
  if (!proposal) throw new Error(`Proposal ${proposalId} not found`);
  if (proposal.status !== "approved") {
    throw new Error(
      `Cannot execute proposal ${proposalId}: status is '${proposal.status}', must be 'approved'`
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(proposal.payload);
  } catch {
    throw new Error(`Proposal ${proposalId} has invalid JSON payload`);
  }

  console.log(`[executor] Executing proposal ${proposalId} (${proposal.type})`);

  let result: unknown;

  try {
    switch (proposal.type) {
      case "create_issue": {
        const p = payload as CreateIssuePayload;
        result = await createIssue(p);
        break;
      }
      case "update_issue": {
        const p = payload as UpdateIssuePayload;
        const { id, ...rest } = p;
        result = await updateIssue(id, rest);
        break;
      }
      case "add_comment": {
        const p = payload as AddCommentPayload;
        result = await addComment({ issueId: p.issueId, body: p.body });
        break;
      }
      case "move_issue": {
        // move_issue is a state change — use updateIssue with a stateId
        const p = payload as UpdateIssuePayload;
        const { id, ...rest } = p;
        result = await updateIssue(id, rest);
        break;
      }
      default: {
        const exhaustive: never = proposal.type;
        throw new Error(`Unknown proposal type: ${exhaustive}`);
      }
    }

    // Mark executed
    db.run(
      `UPDATE proposals SET status = 'executed', executed_at = ?, execution_result = ? WHERE id = ?`,
      [new Date().toISOString(), JSON.stringify(result), proposalId]
    );
    auditLog("executed", proposalId, { result });
    console.log(`[executor] Proposal ${proposalId} executed successfully`);

    return result;
  } catch (err) {
    auditLog("error", proposalId, { error: String(err) });
    console.error(`[executor] Proposal ${proposalId} failed:`, err);
    throw err;
  }
}
