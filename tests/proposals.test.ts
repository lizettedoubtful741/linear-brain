import { describe, it, expect, beforeEach } from "bun:test";
import { db } from "../src/queue/db.ts";
import {
  createProposal,
  getProposal,
  listProposals,
  approveProposal,
  rejectProposal,
  expireStaleProposals,
} from "../src/queue/proposals.ts";

// Reset tables before each test for isolation
beforeEach(() => {
  db.run("DELETE FROM audit_log");
  db.run("DELETE FROM proposals");
});

const base = {
  type: "add_comment" as const,
  summary: "Test proposal",
  reasoning: "Testing",
  payload: { issueId: "abc-123", body: "Hey, any blockers?" },
};

describe("createProposal", () => {
  it("creates a proposal with status pending", () => {
    const p = createProposal(base);
    expect(p.status).toBe("pending");
    expect(p.type).toBe("add_comment");
    expect(p.summary).toBe("Test proposal");
    expect(p.id).toBeTruthy();
  });

  it("stores payload as JSON string", () => {
    const p = createProposal(base);
    const parsed = JSON.parse(p.payload) as unknown;
    expect(parsed).toEqual(base.payload);
  });

  it("writes an audit log entry", () => {
    const p = createProposal(base);
    const entry = db
      .query<{ action: string; proposal_id: string }, string>(
        "SELECT action, proposal_id FROM audit_log WHERE proposal_id = ?"
      )
      .get(p.id);
    expect(entry?.action).toBe("proposal_created");
  });

  it("throws on invalid type", () => {
    expect(() =>
      createProposal({ ...base, type: "invalid_type" as never })
    ).toThrow("Invalid proposal type");
  });
});

describe("getProposal", () => {
  it("returns null for unknown id", () => {
    expect(getProposal("does-not-exist")).toBeNull();
  });

  it("returns the proposal by id", () => {
    const p = createProposal(base);
    const fetched = getProposal(p.id);
    expect(fetched?.id).toBe(p.id);
  });
});

describe("listProposals", () => {
  it("returns all proposals when no filter", () => {
    createProposal(base);
    createProposal({ ...base, type: "create_issue" });
    expect(listProposals().length).toBe(2);
  });

  it("filters by status", () => {
    const p1 = createProposal(base);
    createProposal({ ...base, type: "create_issue" });
    approveProposal(p1.id);

    expect(listProposals("pending").length).toBe(1);
    expect(listProposals("approved").length).toBe(1);
  });
});

describe("approveProposal", () => {
  it("changes status to approved", () => {
    const p = createProposal(base);
    const approved = approveProposal(p.id);
    expect(approved.status).toBe("approved");
    expect(approved.reviewed_by).toBe("user");
    expect(approved.reviewed_at).toBeTruthy();
  });

  it("throws when approving an already-approved proposal", () => {
    const p = createProposal(base);
    approveProposal(p.id);
    expect(() => approveProposal(p.id)).toThrow("status 'approved'");
  });

  it("throws when approving a rejected proposal", () => {
    const p = createProposal(base);
    rejectProposal(p.id, "not needed");
    expect(() => approveProposal(p.id)).toThrow("status 'rejected'");
  });

  it("throws for unknown proposal id", () => {
    expect(() => approveProposal("no-such-id")).toThrow("not found");
  });

  it("writes an audit log entry", () => {
    const p = createProposal(base);
    approveProposal(p.id);
    const entry = db
      .query<{ action: string }, string>(
        "SELECT action FROM audit_log WHERE proposal_id = ? AND action = 'approved'"
      )
      .get(p.id);
    expect(entry?.action).toBe("approved");
  });
});

describe("rejectProposal", () => {
  it("changes status to rejected with feedback", () => {
    const p = createProposal(base);
    const rejected = rejectProposal(p.id, "not needed right now");
    expect(rejected.status).toBe("rejected");
    expect(rejected.feedback).toBe("not needed right now");
  });

  it("throws when rejecting a non-pending proposal", () => {
    const p = createProposal(base);
    approveProposal(p.id);
    expect(() => rejectProposal(p.id, "too late")).toThrow("status 'approved'");
  });

  it("throws for unknown proposal id", () => {
    expect(() => rejectProposal("no-such-id", "reason")).toThrow("not found");
  });
});

describe("expireStaleProposals", () => {
  it("expires pending proposals older than the cutoff", () => {
    const id = "stale-test-id";
    const oldDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    db.run(
      "INSERT INTO proposals (id, created_at, type, summary, reasoning, payload, status) VALUES (?, ?, ?, ?, ?, ?, 'pending')",
      [id, oldDate, "add_comment", "Old proposal", "Reason", "{}"]
    );

    const count = expireStaleProposals(7 * 24 * 60 * 60 * 1000);
    expect(count).toBe(1);
    expect(getProposal(id)?.status).toBe("expired");
  });

  it("does not expire recent pending proposals", () => {
    createProposal(base);
    const count = expireStaleProposals(7 * 24 * 60 * 60 * 1000);
    expect(count).toBe(0);
  });

  it("does not expire already-approved proposals", () => {
    const id = "approved-old-id";
    const oldDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    db.run(
      "INSERT INTO proposals (id, created_at, type, summary, reasoning, payload, status) VALUES (?, ?, ?, ?, ?, ?, 'approved')",
      [id, oldDate, "add_comment", "Old approved", "Reason", "{}"]
    );
    const count = expireStaleProposals(7 * 24 * 60 * 60 * 1000);
    expect(count).toBe(0);
  });
});
