/**
 * READ-ONLY script: fetches all Linear issues and prints full details as JSON.
 * Usage: bun run scripts/dump-issues.ts
 */
import { getIssues, getTeams } from "../src/linear/reader.ts";

async function main() {
  const teams = await getTeams();
  const allIssues = await getIssues();

  // Resolve lazy-loaded relations for each issue
  const detailed = await Promise.all(
    allIssues.map(async (issue) => {
      const [state, assignee, labels, parent, project, cycle, creator] =
        await Promise.all([
          issue.state,
          issue.assignee,
          issue.labels(),
          issue.parent,
          issue.project,
          issue.cycle,
          issue.creator,
        ]);

      return {
        id: issue.id,
        identifier: issue.identifier,
        title: issue.title,
        description: issue.description ?? null,
        status: state ? { id: state.id, name: state.name, type: state.type } : null,
        assignee: assignee ? { id: assignee.id, name: assignee.name, email: assignee.email } : null,
        creator: creator ? { id: creator.id, name: creator.name } : null,
        priority: issue.priority,
        priorityLabel: issue.priorityLabel,
        estimate: issue.estimate ?? null,
        labels: labels.nodes.map((l) => ({ id: l.id, name: l.name, color: l.color })),
        project: project ? { id: project.id, name: project.name } : null,
        cycle: cycle ? { id: cycle.id, name: cycle.name, number: cycle.number } : null,
        parent: parent ? { id: parent.id, identifier: parent.identifier, title: parent.title } : null,
        dueDate: issue.dueDate ?? null,
        createdAt: issue.createdAt,
        updatedAt: issue.updatedAt,
        completedAt: issue.completedAt ?? null,
        startedAt: issue.startedAt ?? null,
        canceledAt: issue.canceledAt ?? null,
        url: issue.url,
      };
    })
  );

  // Print teams for context, then issues
  const output = {
    teams: teams.map((t) => ({ id: t.id, name: t.name, key: t.key })),
    totalIssues: detailed.length,
    issues: detailed,
  };

  console.log(JSON.stringify(output, null, 2));
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
