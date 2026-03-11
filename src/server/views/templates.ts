import type { Proposal, ProposalStatus } from "../../queue/proposals.ts";

// --- Helpers ---

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusBadge(status: ProposalStatus): string {
  const colours: Record<ProposalStatus, string> = {
    pending: "badge-pending",
    approved: "badge-approved",
    rejected: "badge-rejected",
    executed: "badge-executed",
    expired: "badge-expired",
  };
  return `<span class="badge ${colours[status]}">${escapeHtml(status)}</span>`;
}

function formatType(type: string): string {
  return type.replace(/_/g, " ");
}

// --- Layout ---

export function layout(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)} — Linear Brain</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 14px;
      color: #1a1a1a;
      background: #f5f5f5;
      padding: 24px;
    }
    a { color: #0066cc; text-decoration: none; }
    a:hover { text-decoration: underline; }

    .container { max-width: 900px; margin: 0 auto; }

    header { margin-bottom: 24px; display: flex; align-items: baseline; gap: 16px; }
    header h1 { font-size: 20px; font-weight: 600; }
    header nav a { font-size: 13px; color: #666; }
    header nav a:hover { color: #0066cc; }

    .card {
      background: #fff;
      border: 1px solid #e0e0e0;
      border-radius: 6px;
      padding: 20px;
      margin-bottom: 16px;
    }
    .card h2 { font-size: 15px; font-weight: 600; margin-bottom: 12px; }

    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; font-size: 12px; font-weight: 600; color: #666;
         padding: 8px 12px; border-bottom: 1px solid #e0e0e0; }
    td { padding: 10px 12px; border-bottom: 1px solid #f0f0f0; vertical-align: top; }
    tr:last-child td { border-bottom: none; }
    tr:hover td { background: #fafafa; }

    .badge {
      display: inline-block; font-size: 11px; font-weight: 600;
      padding: 2px 7px; border-radius: 10px; text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    .badge-pending  { background: #fff3cd; color: #856404; }
    .badge-approved { background: #d4edda; color: #155724; }
    .badge-rejected { background: #f8d7da; color: #721c24; }
    .badge-executed { background: #d1ecf1; color: #0c5460; }
    .badge-expired  { background: #e2e3e5; color: #383d41; }

    .type-label { font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: 0.3px; }
    .summary    { font-weight: 500; }
    .meta       { font-size: 12px; color: #888; margin-top: 2px; }

    .btn {
      display: inline-block; padding: 6px 14px; border-radius: 4px;
      font-size: 13px; font-weight: 500; cursor: pointer;
      border: 1px solid transparent;
    }
    .btn-approve { background: #28a745; color: #fff; border-color: #28a745; }
    .btn-approve:hover { background: #218838; }
    .btn-reject  { background: #fff; color: #dc3545; border-color: #dc3545; }
    .btn-reject:hover { background: #dc3545; color: #fff; }

    form { display: inline; }

    .detail-section { margin-bottom: 20px; }
    .detail-section h3 { font-size: 13px; font-weight: 600; color: #666;
                         text-transform: uppercase; letter-spacing: 0.5px;
                         margin-bottom: 8px; }
    .detail-section p  { line-height: 1.6; }
    pre {
      background: #f8f8f8; border: 1px solid #e0e0e0; border-radius: 4px;
      padding: 12px; font-size: 12px; overflow-x: auto; white-space: pre-wrap;
      word-break: break-all;
    }
    .feedback-input {
      width: 100%; padding: 8px; border: 1px solid #e0e0e0; border-radius: 4px;
      font-size: 13px; margin-bottom: 8px; resize: vertical;
    }
    .actions { display: flex; gap: 8px; align-items: flex-start; flex-wrap: wrap; }
    .reject-form { display: flex; flex-direction: column; gap: 6px; }

    .empty { color: #888; font-style: italic; padding: 16px 0; text-align: center; }
    .back-link { margin-bottom: 16px; display: block; font-size: 13px; }

    .audit-table .action-col { font-family: monospace; font-size: 12px; }
    .audit-table .details-col { font-size: 11px; color: #666; word-break: break-all; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1><a href="/" style="color:inherit">Linear Brain</a></h1>
      <nav>
        <a href="/">Proposals</a>
      </nav>
    </header>
    ${body}
  </div>
</body>
</html>`;
}

// --- Proposal list ---

export function proposalList(proposals: Proposal[]): string {
  const pendingCount = proposals.filter((p) => p.status === "pending").length;

  const rows = proposals.length === 0
    ? `<tr><td colspan="5" class="empty">No proposals yet.</td></tr>`
    : proposals.map((p) => `
      <tr>
        <td class="meta">${escapeHtml(formatDate(p.created_at))}</td>
        <td>
          <div class="type-label">${escapeHtml(formatType(p.type))}</div>
          <div class="summary"><a href="/proposals/${escapeHtml(p.id)}">${escapeHtml(p.summary)}</a></div>
        </td>
        <td>${statusBadge(p.status)}</td>
        <td>
          ${p.status === "pending" ? `
            <form method="POST" action="/api/proposals/${escapeHtml(p.id)}/approve">
              <button class="btn btn-approve" type="submit">Approve</button>
            </form>
          ` : ""}
        </td>
      </tr>`).join("");

  return layout("Proposals", `
    <div class="card">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
        <h2>Proposals ${pendingCount > 0 ? `<span style="color:#856404">(${pendingCount} pending)</span>` : ""}</h2>
        ${pendingCount > 1 ? `
          <form method="POST" action="/api/proposals/approve-all" onsubmit="return confirm('Approve and execute all ${pendingCount} pending proposals?')">
            <button class="btn btn-approve" type="submit">Approve All (${pendingCount})</button>
          </form>
        ` : ""}
      </div>
      <table>
        <thead>
          <tr>
            <th style="width:140px">Time</th>
            <th>Summary</th>
            <th style="width:100px">Status</th>
            <th style="width:90px">Action</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `);
}

// --- Proposal detail ---

export function proposalDetail(proposal: Proposal): string {
  let parsedPayload = "";
  try {
    parsedPayload = JSON.stringify(JSON.parse(proposal.payload), null, 2);
  } catch {
    parsedPayload = proposal.payload;
  }

  const approveRejectForms = proposal.status === "pending" ? `
    <div class="actions">
      <form method="POST" action="/api/proposals/${escapeHtml(proposal.id)}/approve">
        <button class="btn btn-approve" type="submit">Approve</button>
      </form>
      <div class="reject-form">
        <form method="POST" action="/api/proposals/${escapeHtml(proposal.id)}/reject">
          <textarea name="feedback" class="feedback-input" rows="2"
            placeholder="Reason for rejection (optional)"></textarea>
          <button class="btn btn-reject" type="submit">Reject</button>
        </form>
      </div>
    </div>
  ` : `<p class="meta">This proposal has been <strong>${escapeHtml(proposal.status)}</strong>${
    proposal.reviewed_at ? ` on ${escapeHtml(formatDate(proposal.reviewed_at))}` : ""
  }${proposal.reviewed_by ? ` by ${escapeHtml(proposal.reviewed_by)}` : ""}.</p>`;

  const feedbackSection = proposal.feedback ? `
    <div class="detail-section">
      <h3>Rejection Feedback</h3>
      <p>${escapeHtml(proposal.feedback)}</p>
    </div>
  ` : "";

  const executionSection = proposal.execution_result ? `
    <div class="detail-section">
      <h3>Execution Result</h3>
      <pre>${escapeHtml(proposal.execution_result)}</pre>
    </div>
  ` : "";

  return layout(proposal.summary, `
    <a href="/" class="back-link">← Back to proposals</a>
    <div class="card">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px;">
        <div>
          <div class="type-label">${escapeHtml(formatType(proposal.type))}</div>
          <h2 style="margin-top:4px">${escapeHtml(proposal.summary)}</h2>
          <div class="meta">Created ${escapeHtml(formatDate(proposal.created_at))}</div>
        </div>
        ${statusBadge(proposal.status)}
      </div>

      <div class="detail-section">
        <h3>Reasoning</h3>
        <p>${escapeHtml(proposal.reasoning)}</p>
      </div>

      <div class="detail-section">
        <h3>Payload</h3>
        <pre>${escapeHtml(parsedPayload)}</pre>
      </div>

      ${feedbackSection}
      ${executionSection}

      <div class="detail-section">
        <h3>Action</h3>
        ${approveRejectForms}
      </div>
    </div>
  `);
}

// --- Audit log ---

interface AuditEntry {
  id: string;
  created_at: string;
  action: string;
  proposal_id: string | null;
  details: string | null;
}

export function auditLog(entries: AuditEntry[]): string {
  const rows = entries.length === 0
    ? `<tr><td colspan="4" class="empty">No audit entries yet.</td></tr>`
    : entries.map((e) => `
      <tr>
        <td class="meta">${escapeHtml(formatDate(e.created_at))}</td>
        <td class="action-col audit-table">${escapeHtml(e.action)}</td>
        <td>${e.proposal_id
          ? `<a href="/proposals/${escapeHtml(e.proposal_id)}">${escapeHtml(e.proposal_id)}</a>`
          : "—"
        }</td>
        <td class="details-col audit-table">${e.details ? escapeHtml(e.details) : "—"}</td>
      </tr>`).join("");

  return layout("Audit Log", `
    <div class="card">
      <h2>Audit Log</h2>
      <table class="audit-table">
        <thead>
          <tr>
            <th style="width:140px">Time</th>
            <th style="width:130px">Action</th>
            <th style="width:200px">Proposal</th>
            <th>Details</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `);
}
