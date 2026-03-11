import { describe, it, expect, beforeEach, mock } from "bun:test";

// Mock writer.ts BEFORE any imports that would load the executor
mock.module("../src/linear/writer.ts", () => ({
  createIssue: mock(async () => ({ id: "new-issue-id", identifier: "ENG-100" })),
  updateIssue: mock(async () => ({ id: "issue-id", identifier: "ENG-42" })),
  addComment: mock(async () => ({ id: "comment-id" })),
}));

import { db } from "../src/queue/db.ts";
import { createProposal, approveProposal, rejectProposal, getProposal } from "../src/queue/proposals.ts";
import { executeProposal } from "../src/queue/executor.ts";

beforeEach(() => {
  db.run("DELETE FROM audit_log");
  db.run("DELETE FROM proposals");
});

const commentProposal = {
  type: "add_comment" as const,
  summary: "Nudge ENG-42",
  reasoning: "Stale for 5 days",
  payload: { issueId: "issue-abc", body: "Any blockers?" },
};

describe("executeProposal — safety guards", () => {
  it("throws for a pending proposal", async () => {
    const p = createProposal(commentProposal);
    await expect(executeProposal(p.id)).rejects.toThrow("must be 'approved'");
    // Status must remain pending — no mutation happened
    expect(getProposal(p.id)?.status).toBe("pending");
  });

  it("throws for a rejected proposal", async () => {
    const p = createProposal(commentProposal);
    rejectProposal(p.id, "not needed");
    await expect(executeProposal(p.id)).rejects.toThrow("must be 'approved'");
    expect(getProposal(p.id)?.status).toBe("rejected");
  });

  it("throws for an already-executed proposal", async () => {
    const p = createProposal(commentProposal);
    approveProposal(p.id);
    await executeProposal(p.id); // first execution succeeds
    await expect(executeProposal(p.id)).rejects.toThrow("must be 'approved'");
  });

  it("throws for a nonexistent proposal id", async () => {
    await expect(executeProposal("does-not-exist")).rejects.toThrow("not found");
  });
});

describe("executeProposal — success flows", () => {
  it("executes an approved add_comment proposal", async () => {
    const p = createProposal(commentProposal);
    approveProposal(p.id);

    const result = await executeProposal(p.id);
    expect(result).toEqual({ id: "comment-id" });

    const updated = getProposal(p.id);
    expect(updated?.status).toBe("executed");
    expect(updated?.executed_at).toBeTruthy();
    expect(updated?.execution_result).toContain("comment-id");
  });

  it("executes an approved create_issue proposal", async () => {
    const p = createProposal({
      type: "create_issue",
      summary: "Create login bug ticket",
      reasoning: "Gap in backlog",
      payload: { teamId: "team-1", title: "Fix login crash" },
    });
    approveProposal(p.id);

    const result = await executeProposal(p.id);
    expect(result).toEqual({ id: "new-issue-id", identifier: "ENG-100" });
    expect(getProposal(p.id)?.status).toBe("executed");
  });

  it("executes an approved update_issue proposal", async () => {
    const p = createProposal({
      type: "update_issue",
      summary: "Close stale ticket",
      reasoning: "No activity in 30 days",
      payload: { id: "issue-abc", stateId: "done-state" },
    });
    approveProposal(p.id);

    const result = await executeProposal(p.id);
    expect(result).toEqual({ id: "issue-id", identifier: "ENG-42" });
    expect(getProposal(p.id)?.status).toBe("executed");
  });

  it("logs execution to audit_log", async () => {
    const p = createProposal(commentProposal);
    approveProposal(p.id);
    await executeProposal(p.id);

    const entry = db
      .query<{ action: string }, string>(
        "SELECT action FROM audit_log WHERE proposal_id = ? AND action = 'executed'"
      )
      .get(p.id);
    expect(entry?.action).toBe("executed");
  });
});

describe("full flow: create → approve → execute", () => {
  it("completes the entire lifecycle", async () => {
    // 1. Create
    const p = createProposal(commentProposal);
    expect(p.status).toBe("pending");

    // 2. Approve
    const approved = approveProposal(p.id);
    expect(approved.status).toBe("approved");

    // 3. Execute
    await executeProposal(p.id);
    const executed = getProposal(p.id);
    expect(executed?.status).toBe("executed");
    expect(executed?.executed_at).toBeTruthy();
    expect(executed?.execution_result).toBeTruthy();
  });
});
