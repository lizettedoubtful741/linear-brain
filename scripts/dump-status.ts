/**
 * Dump all issues with a given workflow status, including comments.
 * Usage: bun run scripts/dump-status.ts "In Progress"
 */
import { linearClient } from "../src/linear/client.ts";

const statusName = process.argv[2] || "Todo";

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
  comments: Array<{ author: string; body: string; createdAt: string }>;
}> = [];

let after: string | undefined;
while (true) {
  const result = await linearClient.issues({ first: 50, after });
  for (const issue of result.nodes) {
    const state = await issue.state;
    if (state?.name !== statusName) continue;
    const labels = await issue.labels();
    const assignee = await issue.assignee;
    const parent = await issue.parent;
    const commentsResult = await issue.comments();
    const comments = [];
    for (const c of commentsResult.nodes) {
      const user = await c.user;
      comments.push({
        author: user?.name ?? "unknown",
        body: c.body,
        createdAt: c.createdAt.toISOString(),
      });
    }
    issues.push({
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      description: issue.description ?? "",
      status: state.name,
      labels: labels.nodes.map((l) => ({ id: l.id, name: l.name })),
      assignee: assignee?.name ?? null,
      parent: parent ? `${parent.identifier}: ${parent.title}` : null,
      url: issue.url,
      comments,
    });
  }
  if (!result.pageInfo.hasNextPage) break;
  after = result.pageInfo.endCursor;
}

console.log(JSON.stringify(issues, null, 2));
