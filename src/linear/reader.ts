import type { Team, Cycle, Issue, User, IssueLabel } from "@linear/sdk";
import { linearClient } from "./client.ts";

type IssueQueryVars = Parameters<typeof linearClient.issues>[0];

const PAGE_SIZE = 50;

// Collect all pages from a Linear connection into a flat array.
// Linear requires `first` to be set when using `after` for cursor pagination.
async function collectAll<T>(
  fetcher: (after?: string, first?: number) => Promise<{ nodes: T[]; pageInfo: { hasNextPage: boolean; endCursor?: string | null } } | undefined>
): Promise<T[]> {
  const results: T[] = [];
  let cursor: string | undefined = undefined;

  do {
    const page = await fetcher(cursor, PAGE_SIZE);
    if (!page) break;
    results.push(...page.nodes);
    if (!page.pageInfo.hasNextPage) break;
    cursor = page.pageInfo.endCursor ?? undefined;
  } while (true);

  return results;
}

export async function getTeams(): Promise<Team[]> {
  console.log("[linear-reader] fetching teams");
  return collectAll((after, first) => linearClient.teams({ after, first }));
}

export async function getCurrentCycle(teamId: string): Promise<Cycle | null> {
  console.log(`[linear-reader] fetching current cycle for team ${teamId}`);
  const team = await linearClient.team(teamId);
  const cycles = await collectAll((after, first) => team.cycles({ after, first }));
  return cycles.find((c) => c.isActive) ?? null;
}

export async function getIssues(filter?: IssueQueryVars): Promise<Issue[]> {
  console.log("[linear-reader] fetching issues", filter ?? "");
  return collectAll((after, first) => linearClient.issues({ ...filter, after, first }));
}

export async function getIssue(id: string): Promise<Issue | undefined> {
  console.log(`[linear-reader] fetching issue ${id}`);
  return linearClient.issue(id);
}

export async function getUsers(): Promise<User[]> {
  console.log("[linear-reader] fetching users");
  return collectAll((after, first) => linearClient.users({ after, first }));
}

export async function getLabels(teamId: string): Promise<IssueLabel[]> {
  console.log(`[linear-reader] fetching labels for team ${teamId}`);
  const team = await linearClient.team(teamId);
  return collectAll((after, first) => team.labels({ after, first }));
}
