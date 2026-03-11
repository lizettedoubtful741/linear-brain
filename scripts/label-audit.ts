import { linearClient } from "../src/linear/client.ts";

const allIssues: Array<{
  identifier: string;
  title: string;
  status: string;
  labels: Array<{ name: string; id: string }>;
}> = [];

let after: string | undefined;
while (true) {
  const result = await linearClient.issues({ first: 50, after });
  for (const issue of result.nodes) {
    const labels = await issue.labels();
    const state = await issue.state;
    allIssues.push({
      identifier: issue.identifier,
      title: issue.title,
      status: state?.name ?? "unknown",
      labels: labels.nodes.map((l) => ({ name: l.name, id: l.id })),
    });
  }
  if (!result.pageInfo.hasNextPage) break;
  after = result.pageInfo.endCursor;
}

console.log("=== TICKETS WITH NO LABELS ===");
for (const issue of allIssues) {
  if (issue.labels.length === 0) {
    console.log(`${issue.identifier} | ${issue.title} | ${issue.status}`);
  }
}

console.log("\n=== TICKETS STILL WITH OLD NUMBERED LABELS ===");
for (const issue of allIssues) {
  const hasOld = issue.labels.some((l) => /\d/.test(l.name));
  if (hasOld) {
    console.log(`${issue.identifier} | ${issue.title} | ${issue.labels.map((l) => l.name).join(", ")}`);
  }
}

console.log("\n=== ALL ACTIVE TICKETS ===");
for (const issue of allIssues) {
  if (issue.status === "Done" || issue.status === "Canceled") continue;
  const labelStr = issue.labels.length > 0 ? issue.labels.map((l) => l.name).join(", ") : "NO LABELS";
  console.log(`${issue.identifier} | ${labelStr} | ${issue.title}`);
}
