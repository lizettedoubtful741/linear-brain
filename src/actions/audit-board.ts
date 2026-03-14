import { createProposal, listProposals, type CreateProposalInput, type ProposalType } from "../queue/proposals.ts";
import { db } from "../queue/db.ts";
import { readFileSync, existsSync } from "fs";
import { gatherBoard, type BoardIssue } from "./gather-board.ts";

function loadBoardRules(): string {
  const path = "BOARD_RULES.md";
  if (existsSync(path)) return readFileSync(path, "utf-8");
  const examplePath = "BOARD_RULES.example.md";
  if (existsSync(examplePath)) return readFileSync(examplePath, "utf-8");
  return "No BOARD_RULES.md found. Use sensible defaults.";
}

function buildPrompt(issues: BoardIssue[], boardRules: string): string {
  const issueList = issues.map((i) => {
    const commentsSection = i.comments.length > 0
      ? `Comments:\n${i.comments.map((c) => `  [${c.author}]: ${c.body}`).join("\n")}`
      : "Comments: (none)";

    return `
--- ${i.identifier} [${i.stateName}] (uuid: ${i.id}) ---
Title: ${i.title}
Labels: ${i.labels.join(", ") || "none"}
Assignee: ${i.assigneeName ?? "Unassigned"}
Priority: ${i.priorityLabel} (${i.priority})
Estimate: ${i.estimate ?? "None"}
Description:
${i.description ?? "(empty)"}
${commentsSection}
`;
  }).join("\n");

  return `You are a senior project management assistant auditing a Linear board for a small team (2 devs, 2-3 designers). Your job is to find meaningful issues and suggest improvements.

## Board Rules
${boardRules}

## Current Board (${issues.length} tickets)
${issueList}

## Your Task

Audit the entire board and identify issues that NEED attention. Only flag things that matter — do NOT suggest trivial changes.

**What to look for:**
- Titles that don't follow the naming convention (Subject: Action)
- Missing or incorrect mandatory labels (check the label groups in Board Rules)
- Descriptions that are empty, vague, or missing the required format
- Comments that clarify or add context that the description is missing — if a comment answers a question or adds important detail that should live in the description, fold it in. Only do this when it genuinely improves the ticket — don't rewrite descriptions just because a comment exists.
- Tickets that seem related or duplicated — suggest linking them in descriptions
- Tickets missing estimates
- Tickets with mismatched priority vs scope (e.g. urgent but 1pt, or low priority but 8pt)
- Blocked tickets that should be unblocked or reprioritised
- Tickets with no assignee that are in progress
- Any other inconsistencies or quality issues

**What to IGNORE:**
- Tickets that are already well-formatted and complete
- Minor stylistic preferences that don't affect clarity
- Completed tickets — don't audit those
- Don't suggest changes just for the sake of changing things

## Output Format

Your response must be ONLY a valid JSON array, no other text. Each element represents one proposed change:

{
  "issue_id": "the Linear issue UUID (from the 'uuid:' field shown for each ticket — this MUST be the full UUID, not the identifier)",
  "identifier": "e.g. F2-123",
  "type": "update_issue",
  "summary": "short human-readable summary of what you're changing",
  "reasoning": "why this change matters — be specific about what was wrong and what you're fixing",
  "changes": {
    "title": "new title (only if changing)",
    "description": "new description (only if changing — PRESERVE all existing attachments/images/links)",
    "labelsToAdd": ["label names to add"],
    "labelsToRemove": ["label names to remove"],
    "estimate": 5
  }
}

Rules:
- Only include fields in "changes" that you're actually modifying — omit unchanged fields
- ALWAYS preserve existing attachments, images, screenshots, and links in descriptions
- If you're suggesting a link between tickets, mention the related ticket identifiers in the updated description
- Use the fibonacci scale for estimates (1, 2, 3, 5, 8) — study existing estimates for calibration
- Be conservative — only propose changes that meaningfully improve the board
- If the board looks clean, return an empty array []
- Output ONLY the JSON array, nothing else`;
}

interface AuditItem {
  issue_id: string;
  identifier: string;
  type: string;
  summary: string;
  reasoning: string;
  changes: {
    title?: string;
    description?: string;
    labelsToAdd?: string[];
    labelsToRemove?: string[];
    estimate?: number | null;
  };
}

// Tag used to identify audit proposals for cleanup
const AUDIT_TAG = "[audit]";

function removeStaleAuditProposals(newIssueIds: Set<string>): number {
  const pending = listProposals("pending");
  const rejected = listProposals("rejected");
  const existing = [...pending, ...rejected].filter((p) => {
    if (!p.summary.startsWith(AUDIT_TAG)) return false;
    try {
      const payload = JSON.parse(p.payload) as { issueId?: string };
      return payload.issueId && newIssueIds.has(payload.issueId);
    } catch {
      return false;
    }
  });

  for (const p of existing) {
    db.run("DELETE FROM proposals WHERE id = ?", [p.id]);
  }

  return existing.length;
}

export async function runAuditBoard(): Promise<{ proposalCount: number; issues: string[] }> {
  console.log("[audit-board] Starting board audit...");

  const { issues } = await gatherBoard();

  // Filter out completed tickets — don't audit those
  const activeIssues = issues.filter((i) => i.stateType !== "completed" && i.stateType !== "cancelled" && i.stateType !== "canceled");

  if (activeIssues.length === 0) {
    console.log("[audit-board] No active issues to audit");
    return { proposalCount: 0, issues: [] };
  }

  console.log(`[audit-board] Auditing ${activeIssues.length} active issues, sending to Claude Opus...`);

  const boardRules = loadBoardRules();
  const prompt = buildPrompt(activeIssues, boardRules);

  const proc = Bun.spawn(["claude", "-p", prompt, "--output-format", "json", "--model", "opus"], {
    cwd: process.cwd(),
    stdout: "pipe",
    stderr: "pipe",
  });

  const output = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    console.error("[audit-board] Claude process failed:", stderr);
    throw new Error(`Claude process exited with code ${exitCode}`);
  }

  let auditItems: AuditItem[];
  try {
    const envelope = JSON.parse(output) as { result: string };
    const resultText = envelope.result;
    const jsonMatch = resultText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error("No JSON array found in Claude response");
    auditItems = JSON.parse(jsonMatch[0]) as AuditItem[];
  } catch (err) {
    console.error("[audit-board] Failed to parse Claude output:", output.slice(0, 500));
    throw new Error(`Failed to parse Claude response: ${String(err)}`);
  }

  console.log(`[audit-board] Claude found ${auditItems.length} issues to fix`);

  if (auditItems.length === 0) {
    return { proposalCount: 0, issues: [] };
  }

  // Remove existing audit proposals for the same issues
  const issueIds = new Set(auditItems.map((i) => i.issue_id));
  const removed = removeStaleAuditProposals(issueIds);
  if (removed > 0) {
    console.log(`[audit-board] Removed ${removed} superseded audit proposals`);
  }

  const proposalIds: string[] = [];
  for (const item of auditItems) {
    const proposalType: ProposalType = (item.type === "add_comment" ? "add_comment" : "update_issue");

    const input: CreateProposalInput = {
      type: proposalType,
      summary: `${AUDIT_TAG} ${item.identifier} — ${item.summary}`,
      reasoning: item.reasoning,
      payload: {
        issueId: item.issue_id,
        identifier: item.identifier,
        ...item.changes,
      },
    };

    try {
      const proposal = createProposal(input);
      proposalIds.push(proposal.id);
    } catch (err) {
      console.error(`[audit-board] Failed to create proposal for ${item.identifier}:`, err);
    }
  }

  console.log(`[audit-board] Created ${proposalIds.length} proposals`);
  return { proposalCount: proposalIds.length, issues: auditItems.map((i) => i.identifier) };
}
