export type ProposalType = "create_issue" | "update_issue" | "add_comment" | "move_issue";
export type ProposalStatus = "pending" | "approved" | "rejected" | "executed" | "expired";

export interface Proposal {
  id: string;
  created_at: string;
  type: ProposalType;
  summary: string;
  reasoning: string;
  payload: string;
  status: ProposalStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  feedback: string | null;
  executed_at: string | null;
  execution_result: string | null;
}

export interface AuditEntry {
  id: string;
  created_at: string;
  action: string;
  proposal_id: string | null;
  details: string | null;
}

// Dashboard types

export type StatusType = "triage" | "backlog" | "unstarted" | "started" | "completed" | "cancelled";

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

export interface Insight {
  id: string;
  created_at: string;
  team_id: string;
  content: string;
  issue_count: number;
}
