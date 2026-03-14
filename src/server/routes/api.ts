import { Hono } from "hono";
import {
  createProposal,
  approveProposal,
  rejectProposal,
  listProposals,
  getProposal,
  type ProposalType,
  type ProposalStatus,
} from "../../queue/proposals.ts";
import { executeProposal } from "../../queue/executor.ts";
import { db } from "../../queue/db.ts";
import { generateSnapshot } from "../../dashboard/snapshot.ts";
import { saveSnapshot, getLatestSnapshot, getLastSnapshotTime } from "../../dashboard/store.ts";
import { runCleanDrafts } from "../../actions/clean-drafts.ts";
import { runAuditBoard } from "../../actions/audit-board.ts";
import { runGenerateInsight, getInsights } from "../../actions/generate-insight.ts";

const api = new Hono();

const VALID_TYPES: ProposalType[] = ["create_issue", "update_issue", "add_comment", "move_issue"];

// POST /api/proposals — create a new proposal (used by CC)
api.post("/api/proposals", async (c) => {
  try {
    const body = await c.req.json<unknown>();
    if (!body || typeof body !== "object" || body === null) {
      return c.json({ error: "Request body must be a JSON object" }, 400);
    }

    const b = body as Record<string, unknown>;
    const { type, summary, reasoning, payload } = b;

    if (typeof type !== "string" || !VALID_TYPES.includes(type as ProposalType)) {
      return c.json({ error: `'type' must be one of: ${VALID_TYPES.join(", ")}` }, 400);
    }
    if (typeof summary !== "string" || !summary.trim()) {
      return c.json({ error: "'summary' must be a non-empty string" }, 400);
    }
    if (typeof reasoning !== "string" || !reasoning.trim()) {
      return c.json({ error: "'reasoning' must be a non-empty string" }, 400);
    }
    if (payload === undefined) {
      return c.json({ error: "'payload' is required" }, 400);
    }

    const proposal = createProposal({
      type: type as ProposalType,
      summary: summary.trim(),
      reasoning: reasoning.trim(),
      payload,
    });

    return c.json(proposal, 201);
  } catch (err) {
    console.error("[api] POST /api/proposals", err);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// GET /api/proposals — list proposals as JSON
api.get("/api/proposals", (c) => {
  try {
    const statusParam = c.req.query("status");
    const proposals = statusParam
      ? listProposals(statusParam as ProposalStatus)
      : listProposals();
    return c.json(proposals);
  } catch (err) {
    console.error("[api] GET /api/proposals", err);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// GET /api/proposals/:id — get single proposal as JSON
api.get("/api/proposals/:id", (c) => {
  try {
    const proposal = getProposal(c.req.param("id"));
    if (!proposal) return c.json({ error: "Not found" }, 404);
    return c.json(proposal);
  } catch (err) {
    console.error("[api] GET /api/proposals/:id", err);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// POST /api/proposals/reject-all — reject all pending proposals
// NOTE: must be defined BEFORE :id routes so Hono doesn't match as an :id
api.post("/api/proposals/reject-all", (c) => {
  try {
    const pending = listProposals("pending" as ProposalStatus);
    let count = 0;
    for (const proposal of pending) {
      try {
        rejectProposal(proposal.id, "");
        count++;
      } catch (err) {
        console.error(`[api] reject-all failed for ${proposal.id}:`, err);
      }
    }
    return c.json({ rejected: count });
  } catch (err) {
    console.error("[api] POST /api/proposals/reject-all", err);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// POST /api/proposals/approve-all — approve and execute all pending proposals
// NOTE: must be defined BEFORE :id routes so Hono doesn't match "approve-all" as an :id
api.post("/api/proposals/approve-all", async (c) => {
  try {
    const pending = listProposals("pending" as ProposalStatus);
    let succeeded = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const proposal of pending) {
      try {
        approveProposal(proposal.id);
        await executeProposal(proposal.id);
        succeeded++;
      } catch (err) {
        failed++;
        errors.push(`${proposal.id}: ${String(err)}`);
        console.error(`[api] approve-all failed for ${proposal.id}:`, err);
      }
    }

    return c.json({ succeeded, failed, errors });
  } catch (err) {
    console.error("[api] POST /api/proposals/approve-all", err);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// POST /api/proposals/:id/approve — approve and execute
api.post("/api/proposals/:id/approve", async (c) => {
  const id = c.req.param("id");
  try {
    approveProposal(id);
    await executeProposal(id);
    const proposal = getProposal(id);
    return c.json({ ok: true, proposal });
  } catch (err) {
    console.error(`[api] POST /api/proposals/${id}/approve`, err);
    return c.json({ error: String(err) }, 400);
  }
});

// POST /api/proposals/:id/reject — reject with feedback
api.post("/api/proposals/:id/reject", async (c) => {
  const id = c.req.param("id");
  try {
    const body = await c.req.json<{ feedback?: string }>();
    const feedback = body.feedback ?? "";
    rejectProposal(id, feedback);
    const proposal = getProposal(id);
    return c.json({ ok: true, proposal });
  } catch (err) {
    console.error(`[api] POST /api/proposals/${id}/reject`, err);
    return c.json({ error: String(err) }, 400);
  }
});

// GET /api/audit — audit log entries
api.get("/api/audit", (c) => {
  try {
    const entries = db
      .query<
        { id: string; created_at: string; action: string; proposal_id: string | null; details: string | null },
        []
      >("SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 200")
      .all();
    return c.json(entries);
  } catch (err) {
    console.error("[api] GET /api/audit", err);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// GET /api/dashboard — latest snapshot
api.get("/api/dashboard", (c) => {
  try {
    const teamId = c.req.query("team_id");
    // If no team_id provided, get the most recent snapshot regardless of team
    if (!teamId) {
      const row = db
        .query<{ id: string; created_at: string; team_id: string; data: string }, []>(
          "SELECT * FROM dashboard_snapshots ORDER BY created_at DESC LIMIT 1"
        )
        .get();
      if (!row) return c.json({ error: "No snapshots yet. POST /api/dashboard/snapshot to create one." }, 404);
      return c.json({ id: row.id, created_at: row.created_at, snapshot: JSON.parse(row.data) });
    }
    const result = getLatestSnapshot(teamId);
    if (!result) return c.json({ error: "No snapshots yet. POST /api/dashboard/snapshot to create one." }, 404);
    return c.json({ id: result.id, created_at: result.created_at, snapshot: result.data });
  } catch (err) {
    console.error("[api] GET /api/dashboard", err);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// POST /api/dashboard/snapshot — generate and store a new snapshot
api.post("/api/dashboard/snapshot", async (c) => {
  try {
    const body = await c.req.json<{ team_id?: string }>().catch(() => ({}));
    const teamId = (body as { team_id?: string }).team_id;

    // Cooldown: 60 seconds between snapshots
    if (teamId) {
      const lastTime = getLastSnapshotTime(teamId);
      if (lastTime && Date.now() - lastTime.getTime() < 60_000) {
        const wait = Math.ceil((60_000 - (Date.now() - lastTime.getTime())) / 1000);
        return c.json({ error: `Snapshot taken too recently. Try again in ${wait} seconds.` }, 429);
      }
    }

    const snapshot = await generateSnapshot(teamId);
    const result = saveSnapshot(snapshot.team_id, snapshot);
    return c.json({ id: result.id, created_at: result.created_at, team_id: snapshot.team_id, issue_count: snapshot.summary.total_issues }, 201);
  } catch (err) {
    console.error("[api] POST /api/dashboard/snapshot", err);
    return c.json({ error: String(err) }, 500);
  }
});

// POST /api/actions/clean-drafts — trigger headless Claude to clean up DRAFT tickets
api.post("/api/actions/clean-drafts", async (c) => {
  try {
    const result = await runCleanDrafts();
    return c.json(result);
  } catch (err) {
    console.error("[api] POST /api/actions/clean-drafts", err);
    return c.json({ error: String(err) }, 500);
  }
});

// POST /api/actions/audit-board — trigger headless Claude to audit the whole board
api.post("/api/actions/audit-board", async (c) => {
  try {
    const result = await runAuditBoard();
    return c.json(result);
  } catch (err) {
    console.error("[api] POST /api/actions/audit-board", err);
    return c.json({ error: String(err) }, 500);
  }
});

// GET /api/insights — list all insights
api.get("/api/insights", (c) => {
  try {
    const insights = getInsights();
    return c.json(insights);
  } catch (err) {
    console.error("[api] GET /api/insights", err);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// POST /api/insights/generate — generate a new board insight
api.post("/api/insights/generate", async (c) => {
  try {
    const result = await runGenerateInsight();
    return c.json(result, 201);
  } catch (err) {
    console.error("[api] POST /api/insights/generate", err);
    return c.json({ error: String(err) }, 500);
  }
});

export default api;
