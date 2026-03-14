import { gatherBoard, type BoardIssue } from "./gather-board.ts";
import { db } from "../queue/db.ts";
import { readFileSync, existsSync } from "fs";

function generateId(): string {
  const timestamp = Date.now().toString(36).toUpperCase().padStart(10, "0");
  const random = Math.random().toString(36).slice(2, 14).toUpperCase().padStart(12, "0");
  return `${timestamp}${random}`;
}

function getWeekStart(): Date {
  const now = new Date();
  const day = now.getUTCDay();
  const diff = day === 0 ? 6 : day - 1;
  const monday = new Date(now);
  monday.setUTCDate(monday.getUTCDate() - diff);
  monday.setUTCHours(0, 0, 0, 0);
  return monday;
}

function loadBoardRules(): string {
  const path = "BOARD_RULES.md";
  if (existsSync(path)) return readFileSync(path, "utf-8");
  return "";
}

function buildPrompt(issues: BoardIssue[], teamName: string, cycleInfo: string, statsBlock: string, boardRules: string): string {
  const issueList = issues.map((i) => {
    const commentsSection = i.comments.length > 0
      ? `  Comments:\n${i.comments.map((c) => `    [${c.author}]: ${c.body}`).join("\n")}`
      : "";

    return `  ${i.identifier} [${i.stateName}] — ${i.title}
    Assignee: ${i.assigneeName ?? "Unassigned"} | Priority: ${i.priorityLabel} | Estimate: ${i.estimate ?? "?"} pts
    Labels: ${i.labels.join(", ") || "none"}${i.description ? `\n    Description: ${i.description.slice(0, 200)}${i.description.length > 200 ? "..." : ""}` : ""}${commentsSection ? `\n${commentsSection}` : ""}`;
  }).join("\n\n");

  return `You are a senior project manager writing a daily briefing for the dev lead and design lead of a small team. Your tone is direct, honest, and data-driven. You are not a cheerleader — you are a trusted advisor who tells it like it is.

## Team: ${teamName}
## Date: ${new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}

${cycleInfo}

## Computed Statistics
${statsBlock}

${boardRules ? `## Board Rules\n${boardRules}\n` : ""}

## Full Board
${issueList}

## Your Task

Write a structured daily insight report. This report will be read by the dev and design leads every morning. It must be:

1. **Deterministic** — given the same board state, you should produce essentially the same analysis. Base every claim on observable data (ticket counts, point totals, states, dates). Do not speculate or inject randomness.
2. **Brutally honest** — if someone is falling behind, say so clearly. If the board is in bad shape, say it. The leads need truth, not comfort.
3. **Actionable** — every observation should lead to a clear "so what" or "do this".

## Required Sections (use these exact headings in markdown)

### Summary
2-3 sentences. The single most important thing the leads need to know today. What is the state of the project right now?

### Cycle Progress
If there's an active cycle: are we on track? What percentage is done vs expected at this point? If no cycle, skip this section.

### Focus Areas
Top 3 things that need attention RIGHT NOW, ranked by urgency. For each: what is it, why does it matter, what should happen next.

### Team Performance
For EACH team member, provide:
- Their name
- How many tickets they have in each state (in progress, in review, blocked, todo)
- Points completed this week vs points still in progress
- A candid 1-sentence assessment: are they on track, overloaded, underutilised, or blocked?

Be fair but honest. If someone has 30+ points in review and nothing moving, that's a bottleneck. If someone has 0 points completed and 10 in progress, they may be spread too thin.

### Risks & Blockers
Any blocked tickets, stale items (no movement in 3+ business days), dependency chains, or things that could derail the week. Be specific — name the tickets.

### Recommendations
3-5 concrete actions the leads should take today, in priority order. These should be specific enough to act on immediately (not vague advice like "improve communication").

## Format
Output the report as clean markdown. No JSON. No code blocks wrapping the whole thing. Just the markdown sections above.`;
}

function computeStats(issues: BoardIssue[]): string {
  const weekStart = getWeekStart();

  const byState: Record<string, { count: number; points: number }> = {};
  const byMember: Record<string, { name: string; todo: number; inProgress: number; inReview: number; blocked: number; completed: number; completedThisWeek: number; totalAssigned: number }> = {};

  let totalPoints = 0;
  let completedThisWeekPts = 0;

  for (const issue of issues) {
    const pts = issue.estimate ?? 0;
    totalPoints += pts;

    const st = issue.stateName;
    if (!byState[st]) byState[st] = { count: 0, points: 0 };
    byState[st].count++;
    byState[st].points += pts;

    const name = issue.assigneeName ?? "Unassigned";
    if (!byMember[name]) byMember[name] = { name, todo: 0, inProgress: 0, inReview: 0, blocked: 0, completed: 0, completedThisWeek: 0, totalAssigned: 0 };
    const m = byMember[name]!;
    m.totalAssigned++;

    const sn = issue.stateName.toLowerCase();
    const isCompletedThisWeek = issue.stateType === "completed" && issue.completedAt && new Date(issue.completedAt) >= weekStart;

    if (sn.includes("block")) { m.blocked += pts; }
    else if (issue.stateType === "completed") { m.completed += pts; if (isCompletedThisWeek) { m.completedThisWeek += pts; completedThisWeekPts += pts; } }
    else if (sn.includes("review")) { m.inReview += pts; }
    else if (issue.stateType === "started") { m.inProgress += pts; }
    else if (issue.stateType === "unstarted") { m.todo += pts; }
  }

  const lines: string[] = [];
  lines.push(`Total active issues: ${issues.length}`);
  lines.push(`Total story points: ${totalPoints}`);
  lines.push(`Points completed this week: ${completedThisWeekPts}`);
  lines.push("");
  lines.push("Issues by state:");
  for (const [state, data] of Object.entries(byState).sort((a, b) => b[1].count - a[1].count)) {
    lines.push(`  ${state}: ${data.count} issues (${data.points} pts)`);
  }
  lines.push("");
  lines.push("Points by member:");
  for (const m of Object.values(byMember).sort((a, b) => b.totalAssigned - a.totalAssigned)) {
    lines.push(`  ${m.name}: ${m.totalAssigned} tickets | todo=${m.todo} prog=${m.inProgress} review=${m.inReview} blocked=${m.blocked} done_this_week=${m.completedThisWeek}`);
  }

  return lines.join("\n");
}

export interface InsightRow {
  id: string;
  created_at: string;
  team_id: string;
  content: string;
  issue_count: number;
}

export function getInsights(limit = 20): InsightRow[] {
  return db
    .query<InsightRow, number>("SELECT * FROM insights ORDER BY created_at DESC LIMIT ?")
    .all(limit);
}

export function getInsight(id: string): InsightRow | null {
  return db.query<InsightRow, string>("SELECT * FROM insights WHERE id = ?").get(id) ?? null;
}

export async function runGenerateInsight(): Promise<{ id: string; created_at: string }> {
  console.log("[insights] Generating board insight...");

  const { issues, teamName, cycle } = await gatherBoard();

  const activeIssues = issues.filter((i) => i.stateType !== "cancelled" && i.stateType !== "canceled");

  console.log(`[insights] Gathered ${activeIssues.length} issues, sending to Claude Opus...`);

  const boardRules = loadBoardRules();
  const statsBlock = computeStats(activeIssues);

  const cycleInfo = cycle
    ? `## Active Cycle: ${cycle.name ?? "Current"}\nProgress: ${Math.round(cycle.progress * 100)}% | ${cycle.startsAt.toLocaleDateString("en-GB")} → ${cycle.endsAt.toLocaleDateString("en-GB")}`
    : "No active cycle.";

  const prompt = buildPrompt(activeIssues, teamName, cycleInfo, statsBlock, boardRules);

  const proc = Bun.spawn(["claude", "-p", prompt, "--output-format", "json", "--model", "opus"], {
    cwd: process.cwd(),
    stdout: "pipe",
    stderr: "pipe",
  });

  const output = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    console.error("[insights] Claude process failed:", stderr);
    throw new Error(`Claude process exited with code ${exitCode}`);
  }

  let content: string;
  try {
    const envelope = JSON.parse(output) as { result: string };
    content = envelope.result;
  } catch (err) {
    console.error("[insights] Failed to parse Claude output:", output.slice(0, 500));
    throw new Error(`Failed to parse Claude response: ${String(err)}`);
  }

  // Store the insight
  const id = generateId();
  const created_at = new Date().toISOString();

  db.run(
    `INSERT INTO insights (id, created_at, team_id, content, issue_count) VALUES (?, ?, ?, ?, ?)`,
    [id, created_at, "default", content, activeIssues.length]
  );

  // Prune old insights (keep last 90 days)
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  db.run(`DELETE FROM insights WHERE created_at < ?`, [cutoff]);

  console.log(`[insights] Insight ${id} saved (${activeIssues.length} issues analyzed)`);
  return { id, created_at };
}
