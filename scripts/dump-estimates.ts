/**
 * Dump all non-cancelled issues grouped by estimated vs unestimated.
 * Usage: bun run scripts/dump-estimates.ts
 */
import { linearClient } from "../src/linear/client.ts";

const issues: Array<{
  identifier: string;
  title: string;
  status: string;
  estimate: number | null;
  labels: string[];
  parent: string | null;
}> = [];

let after: string | undefined;
while (true) {
  const result = await linearClient.issues({ first: 50, after });
  for (const issue of result.nodes) {
    const state = await issue.state;
    if (!state || state.type === "canceled") continue;
    const labels = await issue.labels();
    const parent = await issue.parent;
    issues.push({
      identifier: issue.identifier,
      title: issue.title,
      status: state.name,
      estimate: issue.estimate ?? null,
      labels: labels.nodes.map((l) => l.name),
      parent: parent ? parent.identifier : null,
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

console.log("=== ESTIMATED ===");
for (const i of issues.filter((x) => x.estimate !== null)) {
  console.log(
    `${i.identifier} [${i.estimate}pt] ${i.status} | ${i.title} | ${i.labels.join(", ")}${i.parent ? " | parent: " + i.parent : ""}`
  );
}
console.log("\n=== UNESTIMATED ===");
for (const i of issues.filter((x) => x.estimate === null)) {
  console.log(
    `${i.identifier} [?] ${i.status} | ${i.title} | ${i.labels.join(", ")}${i.parent ? " | parent: " + i.parent : ""}`
  );
}

const estimated = issues.filter((x) => x.estimate !== null).length;
const unestimated = issues.filter((x) => x.estimate === null).length;
console.log(`\nTotal: ${issues.length} | Estimated: ${estimated} | Unestimated: ${unestimated}`);
