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

// GET /api/proposals — list proposals as JSON (used by CC)
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

    const accept = c.req.header("accept") ?? "";
    if (accept.includes("application/json")) {
      return c.json({ succeeded, failed, errors });
    }
    return c.redirect("/", 303);
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
    // Redirect back to dashboard (form post)
    return c.redirect("/", 303);
  } catch (err) {
    console.error(`[api] POST /api/proposals/${id}/approve`, err);
    // For form posts, redirect back with an error; for JSON requests, return error
    const accept = c.req.header("accept") ?? "";
    if (accept.includes("application/json")) {
      return c.json({ error: String(err) }, 400);
    }
    return c.redirect(`/proposals/${id}?error=${encodeURIComponent(String(err))}`, 303);
  }
});

// POST /api/proposals/:id/reject — reject with feedback
api.post("/api/proposals/:id/reject", async (c) => {
  const id = c.req.param("id");
  try {
    const contentType = c.req.header("content-type") ?? "";
    let feedback = "";

    if (contentType.includes("application/json")) {
      const body = await c.req.json<{ feedback?: string }>();
      feedback = body.feedback ?? "";
    } else {
      const form = await c.req.formData();
      feedback = (form.get("feedback") as string | null) ?? "";
    }

    rejectProposal(id, feedback);
    return c.redirect("/", 303);
  } catch (err) {
    console.error(`[api] POST /api/proposals/${id}/reject`, err);
    const accept = c.req.header("accept") ?? "";
    if (accept.includes("application/json")) {
      return c.json({ error: String(err) }, 400);
    }
    return c.redirect(`/proposals/${id}?error=${encodeURIComponent(String(err))}`, 303);
  }
});

export default api;
