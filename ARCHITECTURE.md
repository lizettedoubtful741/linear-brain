# ARCHITECTURE.md

## System Design

Linear Brain is a web service that exposes your Linear workspace through a typed API and gated approval queue. It reads from Linear freely, and executes write operations only after human approval through a React SPA dashboard (built with Ant Design, served by the Hono API server).

The "intelligence" layer is **Claude Code (CC)**, operated interactively by the developer. CC reads Linear data via the app's reader module, reasons about it, and creates proposals through the API. There is no automated AI — no Anthropic API calls, no scheduled analysis, no prompt templates. CC is the brain.

## Core Principle: Read Freely, Write Never (Without Approval)

The system has two permission tiers:

### Tier 1 — Readers (unrestricted)
Modules that call Linear's read APIs freely. They can query issues, projects, cycles, users, teams, labels — anything.

Files: `src/linear/reader.ts`

### Tier 2 — Executor (write, post-approval only)
One single module that can mutate Linear. It takes an approved proposal ID, verifies the approval status in the database, executes the call, and logs the result.

Files: `src/queue/executor.ts`, `src/linear/writer.ts`

```
                                    CC (Claude Code)
                                         │
                                    reads Linear data
                                    reasons about it
                                    creates proposals
                                         │
                                         ▼
READS (free)                     PROPOSALS (queued)        WRITES (approved only)
───────────                      ──────────────────        ─────────────────────
Linear API ◄── reader.ts         POST /api/proposals
                                     │
                                     ▼
                                 SQLite Queue ──► Dashboard ──► Executor ──► Linear API
                                     │                             │
                                     ▼                             ▼
                                 Audit Log                    Audit Log
```

## Data Flow

### 1. CC-Driven Analysis (interactive or headless)

```
Interactive: Developer runs CC from the project root
  → CC reads Linear data → reasons about it → creates proposals via POST /api/proposals

Headless: User clicks "Tidy Drafts" / "Audit Board" on the dashboard
  → Server gathers board state (issues, labels, states, comments) from Linear
  → Spawns headless `claude -p --model opus` with structured prompt
  → CC returns JSON proposals → server creates them in the queue
```

### 2. Human Review

```
Developer opens the Proposals page
  → See list of pending proposals with summaries and reasoning
  → Click into a proposal to see structured "Changes" view
  → Approve (executes immediately) or Reject
  → Approve All / Reject All for batch operations
```

### 3. Execution

```
Executor reads approved proposal
  → Verifies status === 'approved' (double-check)
  → Resolves issue IDs (supports both UUIDs and identifiers like F2-123)
  → Resolves label names to IDs for add/remove operations
  → Calls writer.ts with the exact payload
  → writer.ts calls Linear SDK mutation
  → Result logged to audit table
  → Proposal status updated to 'executed'
```

### 4. Insights (read-only, no proposals)

```
User clicks "Generate Insight" on the Insights page
  → Server gathers full board state + pre-computes stats
  → Spawns headless Opus with a structured PM-briefing prompt
  → CC returns markdown report → stored in insights table
  → Displayed on Insights page (latest + history)
```

## Database Schema (SQLite)

### proposals

| Column           | Type    | Description                                           |
| ---------------- | ------- | ----------------------------------------------------- |
| id               | TEXT PK | ULID or UUID                                          |
| created_at       | TEXT    | ISO timestamp                                         |
| type             | TEXT    | create_issue, update_issue, add_comment, move_issue   |
| summary          | TEXT    | Human-readable: "Create bug ticket: Login fails on…"  |
| reasoning        | TEXT    | Explanation for why this action is proposed            |
| payload          | TEXT    | JSON string of the exact Linear API call              |
| status           | TEXT    | pending, approved, rejected, executed, expired        |
| reviewed_by      | TEXT    | nullable, who approved/rejected                       |
| reviewed_at      | TEXT    | nullable, ISO timestamp                               |
| feedback         | TEXT    | nullable, rejection reason or notes                   |
| executed_at      | TEXT    | nullable, when the action was performed               |
| execution_result | TEXT    | nullable, JSON response from Linear                   |

### audit_log

| Column      | Type    | Description                                           |
| ----------- | ------- | ----------------------------------------------------- |
| id          | TEXT PK | ULID                                                  |
| created_at  | TEXT    | ISO timestamp                                         |
| action      | TEXT    | proposal_created, approved, rejected, executed, error |
| proposal_id | TEXT FK | Reference to proposals table                          |
| details     | TEXT    | JSON with any relevant context                        |

### dashboard_snapshots

| Column      | Type    | Description                                           |
| ----------- | ------- | ----------------------------------------------------- |
| id          | TEXT PK | ULID                                                  |
| created_at  | TEXT    | ISO timestamp                                         |
| team_id     | TEXT    | Linear team ID                                        |
| data        | TEXT    | JSON blob (DashboardSnapshot)                         |
| issue_count | INTEGER | Denormalized issue count                              |

Auto-pruned after 30 days.

### insights

| Column      | Type    | Description                                           |
| ----------- | ------- | ----------------------------------------------------- |
| id          | TEXT PK | ULID                                                  |
| created_at  | TEXT    | ISO timestamp                                         |
| team_id     | TEXT    | Linear team ID                                        |
| content     | TEXT    | Markdown insight report from Opus                     |
| issue_count | INTEGER | Number of issues analysed                             |

Auto-pruned after 90 days.

## Linear Webhook Integration (Future)

Linear can send webhooks when issues change. We can use these to:

- Detect manual changes that conflict with pending proposals (auto-expire stale proposals)
- Surface real-time changes on the dashboard for CC to review

Webhook endpoint: `POST /webhooks/linear`

## Scaling Considerations

This is designed for a small team and will handle it easily. But if needs grow:

- SQLite can handle thousands of proposals without issue
- If you need multi-user auth on the dashboard, add a simple API key or basic auth middleware

## Security Notes

- LINEAR_API_KEY gives full access to your workspace. Keep it in `.env`, never commit it.
- The dashboard has no auth by default — it's assumed to run locally or behind a VPN/tunnel. Add basic auth before exposing to the internet.
- Linear webhooks should be validated using the signing secret.
- Never log full API keys. Mask them in any output.
