import { getTeams, getTeamIssues, getLabels, getWorkflowStates, getUsers, getCurrentCycle } from "../linear/reader.ts";
import type { Cycle } from "@linear/sdk";

export interface IssueComment {
  author: string;
  body: string;
  createdAt: string;
}

export interface BoardIssue {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  labels: string[];
  assigneeName: string | null;
  assigneeId: string | null;
  stateName: string;
  stateType: string;
  estimate: number | null;
  priority: number;
  priorityLabel: string;
  completedAt: string | null;
  comments: IssueComment[];
}

export interface BoardData {
  issues: BoardIssue[];
  teamId: string;
  teamName: string;
  cycle: Cycle | null;
  memberNames: Map<string, string>;
}

export async function gatherBoard(): Promise<BoardData> {
  const teams = await getTeams();
  const team = teams[0];
  if (!team) throw new Error("No teams found");

  const [issues, labels, states, users, cycle] = await Promise.all([
    getTeamIssues(team.id),
    getLabels(team.id),
    getWorkflowStates(team.id),
    getUsers(),
    getCurrentCycle(team.id),
  ]);

  const labelMap = new Map(labels.map((l) => [l.id, l.name]));
  const stateMap = new Map(states.map((s) => [s.id, { name: s.name, type: s.type }]));
  const userMap = new Map(users.map((u) => [u.id, u.name]));

  const boardIssues: BoardIssue[] = [];
  for (const issue of issues) {
    const issueLabels = issue.labelIds.map((id) => labelMap.get(id)).filter((n): n is string => !!n);
    const state = issue.stateId ? stateMap.get(issue.stateId) : undefined;
    const assigneeName = issue.assigneeId ? userMap.get(issue.assigneeId) ?? null : null;

    const commentsConn = await issue.comments();
    const comments: IssueComment[] = (commentsConn?.nodes ?? []).map((c) => ({
      author: c.userId ? userMap.get(c.userId) ?? "Unknown" : "Unknown",
      body: c.body,
      createdAt: c.createdAt.toISOString(),
    }));

    boardIssues.push({
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      description: issue.description ?? null,
      labels: issueLabels,
      assigneeName,
      assigneeId: issue.assigneeId ?? null,
      stateName: state?.name ?? "Unknown",
      stateType: state?.type ?? "unknown",
      estimate: issue.estimate ?? null,
      priority: issue.priority,
      priorityLabel: issue.priorityLabel,
      completedAt: issue.completedAt?.toISOString() ?? null,
      comments,
    });
  }

  return { issues: boardIssues, teamId: team.id, teamName: team.name, cycle, memberNames: userMap };
}
