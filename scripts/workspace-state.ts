/**
 * workspace-state.ts
 * Fetch and display the current state of the Linear workspace.
 * Usage: bun run scripts/workspace-state.ts
 */

import { getTeams, getCurrentCycle, getIssues, getUsers, getLabels } from "../src/linear/reader.ts";

async function main() {
  console.log("=== Linear Workspace State ===\n");

  // Teams
  const teams = await getTeams();
  console.log(`Teams (${teams.length}):`);
  for (const team of teams) {
    console.log(`  - ${team.name} (${team.id}) [key: ${team.key}]`);
  }
  console.log();

  // Current cycles per team
  console.log("Active Cycles:");
  for (const team of teams) {
    const cycle = await getCurrentCycle(team.id);
    if (cycle) {
      console.log(`  - ${team.name}: Cycle #${cycle.number} "${cycle.name ?? "(no name)"}" ends ${cycle.endsAt}`);
    } else {
      console.log(`  - ${team.name}: no active cycle`);
    }
  }
  console.log();

  // Users
  const users = await getUsers();
  console.log(`Members (${users.length}):`);
  for (const user of users) {
    console.log(`  - ${user.name} <${user.email}>`);
  }
  console.log();

  // Issues per team (open only)
  for (const team of teams) {
    const issues = await getIssues({
      filter: { team: { id: { eq: team.id } }, state: { type: { nin: ["completed", "cancelled"] } } },
    });
    console.log(`Open Issues — ${team.name} (${issues.length} total):`);
    for (const issue of issues.slice(0, 20)) {
      const state = await issue.state;
      const assignee = await issue.assignee;
      console.log(
        `  [${issue.identifier}] ${issue.title} | ${state?.name ?? "?"} | ${assignee?.name ?? "unassigned"}`
      );
    }
    if (issues.length > 20) console.log(`  ... and ${issues.length - 20} more`);
    console.log();
  }
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
