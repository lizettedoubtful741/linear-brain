export interface DashboardSnapshot {
  generated_at: string;
  team_id: string;
  team_name: string;

  cycle: {
    id: string;
    name: string | null;
    starts_at: string;
    ends_at: string;
    progress: number;
    scope_total: number;
    scope_completed: number;
  } | null;

  summary: {
    total_issues: number;
    points_planned: number;
    points_completed: number;
    points_in_progress: number;
    points_in_review: number;
  };

  by_status: Record<StatusType, StatusGroup>;

  members: MemberStats[];

  blockers: FlaggedIssue[];
  stale: FlaggedIssue[];
}

export type StatusType = "triage" | "backlog" | "unstarted" | "started" | "completed" | "cancelled";

export interface StatusGroup {
  count: number;
  points: number;
  issues: IssueSummary[];
}

export interface IssueSummary {
  id: string;
  identifier: string;
  title: string;
  state_name: string;
  state_type: StatusType;
  assignee_name: string | null;
  assignee_id: string | null;
  estimate: number | null;
  priority: number;
  updated_at: string;
  completed_at: string | null;
  cycle_id: string | null;
}

export interface MemberStats {
  id: string;
  name: string;
  display_name: string;
  avatar_url: string | null;
  assigned_count: number;
  points_todo: number;
  points_completed: number;
  points_in_progress: number;
  points_in_review: number;
  points_blocked: number;
  issues: IssueSummary[];
}

export interface FlaggedIssue {
  issue: IssueSummary;
  reason: string;
  days_stale: number | null;
}
