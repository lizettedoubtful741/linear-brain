/**
 * Dump all issues with a specific label (defaults to "DRAFT").
 * Usage: bun run scripts/dump-drafts.ts [label-name]
 */
import { linearClient } from "../src/linear/client.ts";

const targetLabel = process.argv[2] || "DRAFT";

const issues: Array<{
  id: string;
  identifier: string;
  title: string;
  description: string;
  status: string;
  labels: Array<{ id: string; name: string }>;
  assignee: string | null;
  parent: string | null;
  url: string;
}> = [];

let after: string | undefined;
while (true) {
  const result = await linearClient.issues({ first: 50, after });
  for (const issue of result.nodes) {
    const labels = await issue.labels();
    const hasTarget = labels.nodes.some((l) => l.name === targetLabel);
    if (!hasTarget) continue;
    const state = await issue.state;
    const assignee = await issue.assignee;
    const parent = await issue.parent;
    issues.push({
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      description: issue.description ?? "",
      status: state?.name ?? "unknown",
      labels: labels.nodes.map((l) => ({ id: l.id, name: l.name })),
      assignee: assignee?.name ?? null,
      parent: parent ? `${parent.identifier}: ${parent.title}` : null,
      url: issue.url,
    });
  }
  if (!result.pageInfo.hasNextPage) break;
  after = result.pageInfo.endCursor;
}

console.log(JSON.stringify(issues, null, 2));
