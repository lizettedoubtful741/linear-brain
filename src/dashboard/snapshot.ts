import { getTeams, getWorkflowStates, getTeamIssues, getUsers, getCurrentCycle } from "../linear/reader.ts";
import type { DashboardSnapshot, IssueSummary, StatusType, StatusGroup, MemberStats, FlaggedIssue } from "./types.ts";

const STALE_DAYS = 3;

function getWeekStart(): Date {
  const now = new Date();
  const day = now.getUTCDay();
  const diff = day === 0 ? 6 : day - 1; // Monday = 0
  const monday = new Date(now);
  monday.setUTCDate(monday.getUTCDate() - diff);
  monday.setUTCHours(0, 0, 0, 0);
  return monday;
}

// Count business days (Mon–Fri) elapsed since a given date, inclusive of today.
// e.g. last update Tuesday, today Friday → Wed, Thu, Fri = 3 business days.
function businessDaysSince(date: Date): number {
  let count = 0;
  const start = new Date(date);
  start.setUTCHours(0, 0, 0, 0);
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  // Count each day from (start + 1) through today (inclusive)
  const current = new Date(start);
  current.setUTCDate(current.getUTCDate() + 1);
  while (current <= today) {
    const day = current.getUTCDay();
    if (day !== 0 && day !== 6) count++;
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return count;
}

// Normalize Linear's state types to our status types
function normalizeStateType(type: string): StatusType {
  switch (type) {
    case "triage": return "triage";
    case "backlog": return "backlog";
    case "unstarted": return "unstarted";
    case "started": return "started";
    case "completed": return "completed";
    case "cancelled":
    case "canceled":
    case "duplicate":
      return "cancelled";
    default: return "backlog";
  }
}

export async function generateSnapshot(teamId?: string): Promise<DashboardSnapshot> {
  console.log("[dashboard] Generating snapshot...");

  // Resolve team
  const teams = await getTeams();
  const team = teamId ? teams.find((t) => t.id === teamId) : teams[0];
  if (!team) throw new Error(teamId ? `Team ${teamId} not found` : "No teams found in workspace");

  // Fetch all data in parallel
  const [states, issues, users, cycle] = await Promise.all([
    getWorkflowStates(team.id),
    getTeamIssues(team.id),
    getUsers(),
    getCurrentCycle(team.id),
  ]);

  // Build lookup maps
  const stateMap = new Map(states.map((s) => [s.id, { name: s.name, type: normalizeStateType(s.type) }]));
  const userMap = new Map(users.map((u) => [u.id, { name: u.name, displayName: u.displayName, avatarUrl: u.avatarUrl }]));

  const weekStart = getWeekStart();

  // Build IssueSummary for each issue
  const summaries: IssueSummary[] = issues.map((issue) => {
    const stateId = issue.stateId;
    const state = stateId ? stateMap.get(stateId) : undefined;
    const assigneeId = issue.assigneeId;
    const assignee = assigneeId ? userMap.get(assigneeId) : undefined;

    return {
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      state_name: state?.name ?? "Unknown",
      state_type: state?.type ?? "backlog",
      assignee_name: assignee?.name ?? null,
      assignee_id: assigneeId ?? null,
      estimate: issue.estimate ?? null,
      priority: issue.priority,
      updated_at: issue.updatedAt.toISOString(),
      completed_at: issue.completedAt?.toISOString() ?? null,
      cycle_id: issue.cycleId ?? null,
    };
  });

  // Group by status
  const statusTypes: StatusType[] = ["triage", "backlog", "unstarted", "started", "completed", "cancelled"];
  const byStatus = {} as Record<StatusType, StatusGroup>;
  for (const st of statusTypes) {
    const group = summaries.filter((s) => s.state_type === st);
    byStatus[st] = {
      count: group.length,
      points: group.reduce((sum, s) => sum + (s.estimate ?? 0), 0),
      issues: group,
    };
  }

  // Completed this week
  const completedThisWeek = summaries.filter(
    (s) => s.state_type === "completed" && s.completed_at && new Date(s.completed_at) >= weekStart
  );
  const pointsCompletedThisWeek = completedThisWeek.reduce((sum, s) => sum + (s.estimate ?? 0), 0);

  // In-review detection: state name contains "review" (case-insensitive)
  const inReview = summaries.filter(
    (s) => s.state_type === "started" && s.state_name.toLowerCase().includes("review")
  );
  const pointsInReview = inReview.reduce((sum, s) => sum + (s.estimate ?? 0), 0);

  // Summary
  const summary = {
    total_issues: summaries.length,
    points_planned: summaries.reduce((sum, s) => sum + (s.estimate ?? 0), 0),
    points_completed: pointsCompletedThisWeek,
    points_in_progress: byStatus.started.points,
    points_in_review: pointsInReview,
  };

  // Per-member stats
  const memberIds = new Set(summaries.map((s) => s.assignee_id).filter((id): id is string => id !== null));
  const members: MemberStats[] = [...memberIds].map((memberId) => {
    const user = userMap.get(memberId);
    const assigned = summaries.filter((s) => s.assignee_id === memberId);
    const memberCompleted = assigned.filter(
      (s) => s.state_type === "completed" && s.completed_at && new Date(s.completed_at) >= weekStart
    );
    const memberBlocked = assigned.filter(
      (s) => s.state_name.toLowerCase().includes("block")
    );
    const memberTodo = assigned.filter(
      (s) => s.state_type === "unstarted" && !s.state_name.toLowerCase().includes("block")
    );
    const memberInProgress = assigned.filter(
      (s) => s.state_type === "started" && !s.state_name.toLowerCase().includes("review") && !s.state_name.toLowerCase().includes("block")
    );
    const memberInReview = assigned.filter(
      (s) => s.state_type === "started" && s.state_name.toLowerCase().includes("review")
    );

    return {
      id: memberId,
      name: user?.name ?? "Unknown",
      display_name: user?.displayName ?? user?.name ?? "Unknown",
      avatar_url: user?.avatarUrl ?? null,
      assigned_count: assigned.length,
      points_todo: memberTodo.reduce((sum, s) => sum + (s.estimate ?? 0), 0),
      points_completed: memberCompleted.reduce((sum, s) => sum + (s.estimate ?? 0), 0),
      points_in_progress: memberInProgress.reduce((sum, s) => sum + (s.estimate ?? 0), 0),
      points_in_review: memberInReview.reduce((sum, s) => sum + (s.estimate ?? 0), 0),
      points_blocked: memberBlocked.reduce((sum, s) => sum + (s.estimate ?? 0), 0),
      issues: assigned,
    };
  });

  // Sort members by assigned count descending
  members.sort((a, b) => b.assigned_count - a.assigned_count);

  // Blockers: urgent priority (1) + not completed
  const blockers: FlaggedIssue[] = summaries
    .filter((s) => s.priority === 1 && s.state_type !== "completed" && s.state_type !== "cancelled")
    .map((s) => {
      const days = businessDaysSince(new Date(s.updated_at));
      return {
        issue: s,
        reason: `Urgent priority, currently "${s.state_name}"`,
        days_stale: days,
      };
    });

  // Stale: in started state, no update in STALE_DAYS+ business days
  const stale: FlaggedIssue[] = summaries
    .filter((s) => {
      if (s.state_type !== "started") return false;
      return businessDaysSince(new Date(s.updated_at)) >= STALE_DAYS;
    })
    .map((s) => {
      const days = businessDaysSince(new Date(s.updated_at));
      return {
        issue: s,
        reason: `No movement for ${days} working day${days === 1 ? "" : "s"}`,
        days_stale: days,
      };
    })
    .sort((a, b) => (b.days_stale ?? 0) - (a.days_stale ?? 0));

  // Cycle info
  const cycleInfo = cycle
    ? {
        id: cycle.id,
        name: cycle.name ?? null,
        starts_at: cycle.startsAt.toISOString(),
        ends_at: cycle.endsAt.toISOString(),
        progress: cycle.progress,
        scope_total: summaries.filter((s) => s.cycle_id === cycle.id).length,
        scope_completed: summaries.filter(
          (s) => s.cycle_id === cycle.id && s.state_type === "completed"
        ).length,
      }
    : null;

  const snapshot: DashboardSnapshot = {
    generated_at: new Date().toISOString(),
    team_id: team.id,
    team_name: team.name,
    cycle: cycleInfo,
    summary,
    by_status: byStatus,
    members,
    blockers,
    stale,
  };

  console.log(
    `[dashboard] Snapshot generated: ${summary.total_issues} issues, ${members.length} members, ${blockers.length} blockers, ${stale.length} stale`
  );

  return snapshot;
}
