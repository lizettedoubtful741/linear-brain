import { Hono } from "hono";
import { listProposals, getProposal } from "../../queue/proposals.ts";
import { proposalList, proposalDetail, auditLog } from "../views/templates.ts";
import { db } from "../../queue/db.ts";

const dashboard = new Hono();

// GET / — proposal list
dashboard.get("/", (c) => {
  try {
    const proposals = listProposals();
    return c.html(proposalList(proposals));
  } catch (err) {
    console.error("[dashboard] GET /", err);
    return c.text("Internal server error", 500);
  }
});

// GET /proposals/:id — proposal detail
dashboard.get("/proposals/:id", (c) => {
  try {
    const proposal = getProposal(c.req.param("id"));
    if (!proposal) return c.text("Proposal not found", 404);
    return c.html(proposalDetail(proposal));
  } catch (err) {
    console.error("[dashboard] GET /proposals/:id", err);
    return c.text("Internal server error", 500);
  }
});

// GET /audit — audit log
dashboard.get("/audit", (c) => {
  try {
    const entries = db
      .query<
        { id: string; created_at: string; action: string; proposal_id: string | null; details: string | null },
        []
      >("SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 200")
      .all();
    return c.html(auditLog(entries));
  } catch (err) {
    console.error("[dashboard] GET /audit", err);
    return c.text("Internal server error", 500);
  }
});

export default dashboard;
