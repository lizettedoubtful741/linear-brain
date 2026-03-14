import type { Proposal, ProposalStatus, AuditEntry, DashboardSnapshot, Insight } from "./types";

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((body as { error?: string }).error ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function fetchProposals(status?: ProposalStatus): Promise<Proposal[]> {
  const params = status ? `?status=${status}` : "";
  return request<Proposal[]>(`/api/proposals${params}`);
}

export function fetchProposal(id: string): Promise<Proposal> {
  return request<Proposal>(`/api/proposals/${id}`);
}

export function approveProposal(id: string): Promise<{ ok: true; proposal: Proposal }> {
  return request(`/api/proposals/${id}/approve`, { method: "POST" });
}

export function rejectProposal(id: string, feedback: string): Promise<{ ok: true; proposal: Proposal }> {
  return request(`/api/proposals/${id}/reject`, {
    method: "POST",
    body: JSON.stringify({ feedback }),
  });
}

export function approveAll(): Promise<{ succeeded: number; failed: number; errors: string[] }> {
  return request("/api/proposals/approve-all", { method: "POST" });
}

export function rejectAll(): Promise<{ rejected: number }> {
  return request("/api/proposals/reject-all", { method: "POST" });
}

export function fetchAuditLog(): Promise<AuditEntry[]> {
  return request<AuditEntry[]>("/api/audit");
}

export function fetchDashboard(): Promise<{ id: string; created_at: string; snapshot: DashboardSnapshot }> {
  return request("/api/dashboard");
}

export function refreshSnapshot(): Promise<{ id: string; created_at: string; team_id: string; issue_count: number }> {
  return request("/api/dashboard/snapshot", { method: "POST", body: JSON.stringify({}) });
}

export function cleanDrafts(): Promise<{ proposalCount: number; issues: string[] }> {
  return request("/api/actions/clean-drafts", { method: "POST" });
}

export function auditBoard(): Promise<{ proposalCount: number; issues: string[] }> {
  return request("/api/actions/audit-board", { method: "POST" });
}

export function fetchInsights(): Promise<Insight[]> {
  return request<Insight[]>("/api/insights");
}

export function generateInsight(): Promise<{ id: string; created_at: string }> {
  return request("/api/insights/generate", { method: "POST" });
}
