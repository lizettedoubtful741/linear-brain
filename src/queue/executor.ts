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
import { getIssue, getIssues, getLabels, getTeams } from "../linear/reader.ts";

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
  id?: string;
  issueId?: string;
  identifier?: string;
  title?: string;
  description?: string;
  assigneeId?: string;
  priority?: number;
  labelIds?: string[];
  stateId?: string;
  estimate?: number | null;
  labelsToAdd?: string[];
  labelsToRemove?: string[];
}

// Resolve label names to IDs for add/remove operations
async function resolveLabelChanges(
  issueId: string,
  labelsToAdd?: string[],
  labelsToRemove?: string[],
): Promise<string[] | undefined> {
  if (!labelsToAdd?.length && !labelsToRemove?.length) return undefined;

  const issue = await getIssue(issueId);
  if (!issue) throw new Error(`Issue ${issueId} not found`);

  const teams = await getTeams();
  const team = teams[0];
  if (!team) throw new Error("No teams found");

  const allLabels = await getLabels(team.id);
  const labelNameToId = new Map(allLabels.map((l) => [l.name.toLowerCase(), l.id]));

  // Start with current label IDs
  const currentIds = new Set(issue.labelIds);

  // Add labels by name
  if (labelsToAdd) {
    for (const name of labelsToAdd) {
      const id = labelNameToId.get(name.toLowerCase());
      if (id) currentIds.add(id);
      else console.warn(`[executor] Label "${name}" not found, skipping add`);
    }
  }

  // Remove labels by name
  if (labelsToRemove) {
    for (const name of labelsToRemove) {
      const id = labelNameToId.get(name.toLowerCase());
      if (id) currentIds.delete(id);
      else console.warn(`[executor] Label "${name}" not found, skipping remove`);
    }
  }

  return [...currentIds];
}

// Check if a string looks like a Linear identifier (e.g. "F2-123", "ENG-42")
function isLinearIdentifier(value: string): boolean {
  return /^[A-Z][A-Z0-9]*-\d+$/.test(value);
}

// Resolve an issue ID — accepts UUID or identifier (e.g. "F2-123"), returns UUID
async function resolveIssueId(idOrIdentifier: string): Promise<string> {
  // If it's NOT a Linear identifier pattern, assume it's a UUID/ID and use directly
  if (!isLinearIdentifier(idOrIdentifier)) return idOrIdentifier;

  // Otherwise look up by identifier
  console.log(`[executor] Resolving identifier "${idOrIdentifier}" to UUID...`);
  const issues = await getIssues({ filter: { number: { eq: parseInt(idOrIdentifier.replace(/\D+/g, ""), 10) } } });
  const match = issues.find((i) => i.identifier === idOrIdentifier);
  if (!match) throw new Error(`Could not resolve identifier "${idOrIdentifier}" to a Linear issue`);
  console.log(`[executor] Resolved ${idOrIdentifier} → ${match.id}`);
  return match.id;
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
        const rawId = p.id ?? p.issueId ?? p.identifier;
        if (!rawId) throw new Error("update_issue payload must have 'id', 'issueId', or 'identifier'");
        const issueId = await resolveIssueId(rawId);

        // Resolve label add/remove to final labelIds array
        const labelIds = await resolveLabelChanges(issueId, p.labelsToAdd, p.labelsToRemove);

        // Build the update input — only include fields that are present
        const updateInput: Record<string, unknown> = {};
        if (p.title !== undefined) updateInput.title = p.title;
        if (p.description !== undefined) updateInput.description = p.description;
        if (p.assigneeId !== undefined) updateInput.assigneeId = p.assigneeId;
        if (p.priority !== undefined) updateInput.priority = p.priority;
        if (p.stateId !== undefined) updateInput.stateId = p.stateId;
        if (p.estimate !== undefined) updateInput.estimate = p.estimate;
        if (labelIds) updateInput.labelIds = labelIds;
        if (p.labelIds && !labelIds) updateInput.labelIds = p.labelIds;

        result = await updateIssue(issueId, updateInput);
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
        const moveId = p.id ?? p.issueId;
        if (!moveId) throw new Error("move_issue payload must have 'id' or 'issueId'");
        const { id: _id, issueId: _iid, identifier: _ident, labelsToAdd: _la, labelsToRemove: _lr, ...rest } = p;
        result = await updateIssue(moveId, rest);
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
