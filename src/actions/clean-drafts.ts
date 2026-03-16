import { getTeams, getTeamIssues, getLabels } from "../linear/reader.ts";
import { createProposal, listProposals, type CreateProposalInput } from "../queue/proposals.ts";
import { db } from "../queue/db.ts";
import { readFileSync, existsSync } from "fs";

interface DraftIssueData {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  labelNames: string[];
  assigneeName: string | null;
  stateName: string;
  estimate: number | null;
}

interface EstimateReference {
  identifier: string;
  title: string;
  estimate: number;
  labels: string[];
}

// Gather DRAFT issues and reference tickets with estimates
async function gatherBoardData(): Promise<{
  drafts: DraftIssueData[];
  references: EstimateReference[];
  teamId: string;
}> {
  const teams = await getTeams();
  const team = teams[0];
  if (!team) throw new Error("No teams found");

  const [issues, labels] = await Promise.all([
    getTeamIssues(team.id),
    getLabels(team.id),
  ]);

  const labelMap = new Map(labels.map((l) => [l.id, l.name]));

  const drafts: DraftIssueData[] = [];
  const references: EstimateReference[] = [];

  for (const issue of issues) {
    const issueLabels = issue.labelIds.map((id) => labelMap.get(id)).filter((n): n is string => !!n);
    const isDraft = issueLabels.some((l) => l.toUpperCase() === "DRAFT");

    if (isDraft) {
      const assignee = issue.assigneeId ? await issue.assignee : undefined;
      drafts.push({
        id: issue.id,
        identifier: issue.identifier,
        title: issue.title,
        description: issue.description ?? null,
        labelNames: issueLabels,
        assigneeName: assignee?.name ?? null,
        stateName: "unknown",
        estimate: issue.estimate ?? null,
      });
    } else if (issue.estimate != null && issue.estimate > 0) {
      // Collect estimated non-draft tickets as calibration references
      references.push({
        identifier: issue.identifier,
        title: issue.title,
        estimate: issue.estimate,
        labels: issueLabels,
      });
    }
  }

  return { drafts, references, teamId: team.id };
}

function loadBoardRules(): string {
  const path = "BOARD_RULES.md";
  if (existsSync(path)) return readFileSync(path, "utf-8");
  const examplePath = "BOARD_RULES.example.md";
  if (existsSync(examplePath)) return readFileSync(examplePath, "utf-8");
  return "No BOARD_RULES.md found. Use sensible defaults for ticket cleanup.";
}

function buildPrompt(
  drafts: DraftIssueData[],
  references: EstimateReference[],
  boardRules: string,
): string {
  const draftList = drafts.map((i) => `
--- ${i.identifier} (uuid: ${i.id}) ---
Title: ${i.title}
Labels: ${i.labelNames.join(", ")}
Assignee: ${i.assigneeName ?? "Unassigned"}
Estimate: ${i.estimate ?? "None"}
Description:
${i.description ?? "(empty)"}
`).join("\n");

  // Build reference section — show a representative spread of estimates
  const refSection = references.length > 0
    ? `## Existing Ticket Estimates (for calibration)

Use these as reference points to gauge how the team sizes work. Match your estimates to this scale.

${references.map((r) => `- ${r.identifier}: "${r.title}" [${r.labels.join(", ")}] → ${r.estimate} pts`).join("\n")}
`
    : "";

  return `You are a project management assistant. Your job is to clean up DRAFT tickets on a Linear board.

## Board Rules
${boardRules}

${refSection}
## DRAFT Tickets to Clean Up
${draftList}

## Instructions

For EACH ticket above, output a JSON object describing the cleanup needed. Your response must be ONLY a valid JSON array, no other text. Each element should have this shape:

{
  "issue_id": "the Linear issue UUID (from the 'uuid:' field shown for each ticket — this MUST be the full UUID, not the identifier)",
  "identifier": "e.g. F2-123",
  "updated_title": "cleaned up title following naming format",
  "updated_description": "rewritten description following the board rules format. Preserve ALL existing attachments, images, screenshots, and links.",
  "labels_to_add": ["labels that should be added per mandatory groups"],
  "labels_to_remove": ["DRAFT"],
  "estimate": 3,
  "reasoning": "brief explanation of what you changed and why, including how you arrived at the estimate"
}

Rules:
- Fix titles to match the naming format in Board Rules
- Ensure mandatory label groups are satisfied
- Rewrite descriptions to the standard format (intro + requirements + links)
- ALWAYS preserve existing attachments, images, screenshots, and links in descriptions
- Remove the DRAFT label
- If context is unclear, use [TBC] rather than guessing
- For the estimate: this is REQUIRED. Study the reference tickets carefully to understand this team's fibonacci point scale (1, 2, 3, 5, 8). Estimate based on the apparent scope, complexity, and how it compares to similar reference tickets. When in doubt, round UP — it's better to slightly overestimate than underestimate. Only use null if the ticket is genuinely too vague to estimate at all.
- Output ONLY the JSON array, nothing else`;
}

interface ClaudeCleanupItem {
  issue_id: string;
  identifier: string;
  updated_title: string;
  updated_description: string;
  labels_to_add: string[];
  labels_to_remove: string[];
  estimate: number | null;
  reasoning: string;
}

export async function runCleanDrafts(): Promise<{ proposalCount: number; issues: string[] }> {
  console.log("[clean-drafts] Starting DRAFT cleanup...");

  const { drafts, references } = await gatherBoardData();

  if (drafts.length === 0) {
    console.log("[clean-drafts] No DRAFT issues found");
    return { proposalCount: 0, issues: [] };
  }

  console.log(`[clean-drafts] Found ${drafts.length} DRAFT issues, ${references.length} reference tickets, sending to Claude Opus...`);

  const boardRules = loadBoardRules();
  const prompt = buildPrompt(drafts, references, boardRules);

  // Spawn headless Claude on Opus
  const proc = Bun.spawn(["claude", "-p", prompt, "--output-format", "json", "--model", "opus"], {
    cwd: process.cwd(),
    stdout: "pipe",
    stderr: "pipe",
  });

  const output = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    console.error("[clean-drafts] Claude process failed:", stderr);
    throw new Error(`Claude process exited with code ${exitCode}`);
  }

  // Parse the Claude output — it's wrapped in a JSON envelope
  let cleanupItems: ClaudeCleanupItem[];
  try {
    const envelope = JSON.parse(output) as { result: string };
    const resultText = envelope.result;

    // Extract JSON array from the result (claude might wrap it in markdown code blocks)
    const jsonMatch = resultText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error("No JSON array found in Claude response");
    cleanupItems = JSON.parse(jsonMatch[0]) as ClaudeCleanupItem[];
  } catch (err) {
    console.error("[clean-drafts] Failed to parse Claude output:", output.slice(0, 500));
    throw new Error(`Failed to parse Claude response: ${String(err)}`);
  }

  console.log(`[clean-drafts] Claude returned ${cleanupItems.length} cleanup items`);

  // Map issue_id back from gathered data — Claude may not always return the correct UUID
  const identifierToUuid = new Map(drafts.map((d) => [d.identifier, d.id]));
  for (const item of cleanupItems) {
    const correctId = identifierToUuid.get(item.identifier);
    if (correctId) {
      item.issue_id = correctId;
    } else {
      console.warn(`[clean-drafts] Could not map identifier ${item.identifier} to UUID, using Claude's value: ${item.issue_id}`);
    }
  }

  // Remove existing pending/rejected draft-cleanup proposals for these issues
  const issueIds = new Set(cleanupItems.map((i) => i.issue_id));
  const pending = listProposals("pending");
  const rejected = listProposals("rejected");
  const existing = [...pending, ...rejected].filter((p) => {
    try {
      const payload = JSON.parse(p.payload) as { issueId?: string };
      return payload.issueId && issueIds.has(payload.issueId);
    } catch {
      return false;
    }
  });

  if (existing.length > 0) {
    for (const p of existing) {
      db.run("DELETE FROM proposals WHERE id = ?", [p.id]);
    }
    console.log(`[clean-drafts] Removed ${existing.length} superseded proposals`);
  }

  // Create proposals for each cleanup
  const proposalIds: string[] = [];
  for (const item of cleanupItems) {
    const input: CreateProposalInput = {
      type: "update_issue",
      summary: `Clean up DRAFT: ${item.identifier} — ${item.updated_title}`,
      reasoning: item.reasoning,
      payload: {
        issueId: item.issue_id,
        identifier: item.identifier,
        title: item.updated_title,
        description: item.updated_description,
        labelsToAdd: item.labels_to_add,
        labelsToRemove: item.labels_to_remove,
        estimate: item.estimate,
      },
    };

    try {
      const proposal = createProposal(input);
      proposalIds.push(proposal.id);
    } catch (err) {
      console.error(`[clean-drafts] Failed to create proposal for ${item.identifier}:`, err);
    }
  }

  console.log(`[clean-drafts] Created ${proposalIds.length} proposals`);
  return { proposalCount: proposalIds.length, issues: cleanupItems.map((i) => i.identifier) };
}
