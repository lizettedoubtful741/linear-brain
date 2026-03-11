/**
 * Full board analysis: fetches all non-cancelled issues with detailed metadata.
 * Useful for feeding to an AI for PM-style insights.
 * Usage: bun run scripts/board-analysis.ts
 */
import { linearClient } from "../src/linear/client.ts";

const issues: Array<{
  identifier: string;
  title: string;
  status: string;
  statusType: string;
  estimate: number | null;
  labels: string[];
  assignee: string | null;
  parent: string | null;
  childCount: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  priority: number;
}> = [];

let after: string | undefined;
while (true) {
  const result = await linearClient.issues({ first: 50, after });
  for (const issue of result.nodes) {
    const state = await issue.state;
    if (!state || state.type === "canceled") continue;
    const labels = await issue.labels();
    const assignee = await issue.assignee;
    const parent = await issue.parent;
    const children = await issue.children();
    issues.push({
      identifier: issue.identifier,
      title: issue.title,
      status: state.name,
      statusType: state.type,
      estimate: issue.estimate ?? null,
      labels: labels.nodes.map((l) => l.name),
      assignee: assignee?.name ?? null,
      parent: parent ? parent.identifier : null,
      childCount: children.nodes.length,
      createdAt: issue.createdAt.toISOString().split("T")[0],
      startedAt: issue.startedAt ? issue.startedAt.toISOString().split("T")[0] : null,
      completedAt: issue.completedAt ? issue.completedAt.toISOString().split("T")[0] : null,
      priority: issue.priority,
    });
  }
  if (!result.pageInfo.hasNextPage) break;
  after = result.pageInfo.endCursor;
}

const order = ["Backlog", "Todo", "Blocked", "In Progress", "In Review", "Done"];
issues.sort((a, b) => {
  const oa = order.indexOf(a.status);
  const ob = order.indexOf(b.status);
  if (oa !== ob) return oa - ob;
  return a.identifier.localeCompare(b.identifier, undefined, { numeric: true });
});

console.log(JSON.stringify(issues, null, 2));
