# PROGRESS.md — Build Plan & Progress Tracker

## How This Gets Built

This project is built entirely using **Claude Code** (CC). Each phase below includes which Claude Code model to use. The general rule:

- **Sonnet** → most tasks. Fast, cheap, great at scaffolding, CRUD, tests, templates, and straightforward logic. Use this 90% of the time.
- **Opus** → complex architectural decisions, tricky prompt engineering, subtle bug diagnosis, and any task where you need the AI to hold a lot of context and reason carefully about trade-offs. Use sparingly on the hard stuff.

> **Tip:** Start every CC session by pointing it at CLAUDE.md so it understands the project context. Run: `claude` from the project root and it will pick up CLAUDE.md automatically.

---

## Phase 1 — Foundation & Linear Reader
**Goal:** Project scaffolds, Linear SDK connected, can read and display workspace data.
**Timeline:** ~1 day

### Tasks

- [x] **1.1 — Project scaffold**
  - Model: **Sonnet**
  - Init Bun project, install deps (`@linear/sdk`, `@anthropic-ai/sdk`, `hono`, `zod`)
  - Create tsconfig.json (strict mode), bunfig.toml, .env.example, .gitignore
  - Create the full directory structure (empty files are fine)
  - Prompt: *"Initialize a Bun TypeScript project with these deps: @linear/sdk, @anthropic-ai/sdk, hono, zod. Create the directory structure from CLAUDE.md. Strict TS. Add .env.example with the vars listed in CLAUDE.md."*

- [x] **1.2 — Config module**
  - Model: **Sonnet**
  - `src/config.ts` — load and validate env vars with Zod
  - Should export a typed `config` object, fail fast on missing vars
  - Prompt: *"Create src/config.ts. Use Zod to validate env vars: LINEAR_API_KEY (string), ANTHROPIC_API_KEY (string), PORT (number, default 3000), DATABASE_PATH (string, default ./data/brain.db). Export a typed config object. Throw on invalid config at startup."*

- [x] **1.3 — Linear client + reader**
  - Model: **Sonnet**
  - `src/linear/client.ts` — create and export the Linear SDK client instance
  - `src/linear/reader.ts` — functions to read: teams, cycles, issues (with filters), users, labels, project states
  - Handle pagination properly
  - Prompt: *"Create src/linear/client.ts that exports a LinearClient instance using the API key from config. Then create src/linear/reader.ts with functions: getTeams(), getCurrentCycle(teamId), getIssues(filter), getIssue(id), getUsers(), getLabels(teamId). All must handle cursor-based pagination. Return typed results. Add logging with [linear-reader] prefix."*

- [x] **1.4 — Basic Hono server + health check**
  - Model: **Sonnet**
  - `src/server/app.ts` — Hono app with a `/health` route
  - `src/index.ts` — starts the server
  - Prompt: *"Create src/server/app.ts with a Hono app. Add a GET /health route that returns { status: 'ok', timestamp }. Create src/index.ts that imports the app and starts it on the configured port using Bun.serve. Log startup message."*

- [x] **1.5 — Verify Linear connection**
  - Model: **Sonnet**
  - Add a `/debug/linear` route that calls reader functions and shows raw data
  - This is a temp route for development, can be removed later
  - Prompt: *"Add a GET /debug/linear route to the Hono app that calls getTeams() and getCurrentCycle() from reader.ts and returns the results as JSON. This is for dev verification."*

### Phase 1 Definition of Done
- `bun run src/index.ts` starts the server
- `/health` returns OK
- `/debug/linear` returns real data from your Linear workspace

---

## Phase 2 — SQLite Queue & Approval Dashboard
**Goal:** Working approval queue with a web UI to review, approve, and reject proposals.
**Timeline:** ~1-2 days

### Tasks

- [x] **2.1 — SQLite database setup**
  - Model: **Sonnet**
  - `src/queue/db.ts` — initialize SQLite DB, create tables (proposals, audit_log)
  - Auto-create the data directory if it doesn't exist
  - Run migrations on startup
  - Prompt: *"Create src/queue/db.ts using bun:sqlite. On init, create the data directory if needed, open the DB at DATABASE_PATH, and create the two tables from ARCHITECTURE.md (proposals, audit_log) if they don't exist. Use WAL mode. Export the db instance."*

- [x] **2.2 — Proposal CRUD**
  - Model: **Sonnet**
  - `src/queue/proposals.ts` — createProposal(), getProposal(), listProposals(filter), approveProposal(id), rejectProposal(id, feedback), expireStaleProposals()
  - All functions log to audit_log
  - Prompt: *"Create src/queue/proposals.ts with functions for proposal CRUD. createProposal takes type, summary, reasoning, payload and inserts with status 'pending'. approveProposal/rejectProposal update status and log to audit_log. listProposals accepts optional status filter. Use Zod to validate proposal types. Generate ULIDs for IDs (implement a simple ULID generator or use Date.now + random)."*

- [x] **2.3 — Executor**
  - Model: **Sonnet** (but review the safety logic carefully yourself)
  - `src/queue/executor.ts` — takes a proposal ID, verifies it's approved, calls writer.ts, logs result
  - `src/linear/writer.ts` — thin wrapper around Linear SDK mutations, ONLY called by executor
  - Prompt: *"Create src/queue/executor.ts and src/linear/writer.ts. The executor function takes a proposal ID, loads it from DB, throws if status is not 'approved', then calls the appropriate writer function based on proposal.type. writer.ts exports functions: createIssue(payload), updateIssue(id, payload), addComment(issueId, body). Each calls the Linear SDK. Executor logs success/failure to audit_log and updates proposal status to 'executed'. Add very clear comments that writer.ts must ONLY be imported by executor.ts."*

- [x] **2.4 — Dashboard HTML templates**
  - Model: **Sonnet**
  - `src/server/views/templates.ts` — functions that return HTML strings
  - Layout, proposal list, proposal detail, audit log views
  - Keep it simple: system fonts, minimal CSS, functional
  - Prompt: *"Create src/server/views/templates.ts with functions: layout(title, body) wrapping content in a full HTML page with minimal CSS (system fonts, max-width 800px, basic table styles, status badges). proposalList(proposals) renders a table with columns: time, type, summary, status, actions. proposalDetail(proposal) shows full reasoning, JSON payload, and approve/reject forms."*

- [x] **2.5 — Dashboard routes + proposal API**
  - Model: **Sonnet**
  - `src/server/routes/dashboard.ts` — GET / (proposal list), GET /proposal/:id (detail)
  - `src/server/routes/api.ts` — POST /api/proposals (create, used by CC), POST /api/proposals/:id/approve, POST /api/proposals/:id/reject, GET /api/proposals (list as JSON)
  - Wire approve/reject to the executor
  - Prompt: *"Create dashboard routes in Hono. GET / shows pending proposals using proposalList template. GET /proposals/:id shows detail with approve/reject forms. POST /api/proposals creates a new proposal (JSON body: type, summary, reasoning, payload) — this is how CC submits proposals. POST /api/proposals/:id/approve calls approveProposal then executor then redirects. POST /api/proposals/:id/reject accepts feedback, calls rejectProposal, redirects. GET /api/proposals returns proposals as JSON (for CC to query). Wire routes into the main app."*

- [x] **2.6 — Tests for queue safety**
  - Model: **Sonnet**
  - Test that executor rejects unapproved proposals
  - Test proposal state transitions
  - Test that approval + execution flow works end to end (mocked Linear client)
  - Prompt: *"Write tests using bun:test for the proposal queue. Test: creating a proposal sets status to pending. Approving changes status to approved. Rejecting changes status to rejected. Executor throws on pending/rejected proposals. Executor succeeds on approved proposals (mock writer.ts). Test the full flow: create → approve → execute."*

### Phase 2 Definition of Done
- You can manually insert a test proposal and see it on the dashboard
- Approve/reject buttons work and update status
- Executor runs approved proposals (test with a mock or a real comment on a test ticket)
- Tests pass: `bun test`

---

## ~~Phase 3 — AI Brain (Analyzers)~~ REMOVED
**Superseded.** All analysis is done interactively via Claude Code (CC). No Anthropic API, no automated analyzers, no scheduler, no prompt templates. The `src/ai/`, `src/scheduler/`, and `prompts/` directories have been deleted. `@anthropic-ai/sdk` has been uninstalled.

---

## ~~Phase 4 — AI Proposers (Write Actions)~~ REMOVED
**Superseded.** CC generates proposals interactively and submits them via `POST /api/proposals`. The executor and writer (built in Phase 2) handle execution of approved proposals.

---

## Phase 3 (new) — Webhooks & Conflict Detection
**Goal:** Receive real-time changes from Linear and auto-expire conflicting proposals.
**Timeline:** ~1 day

### Tasks

- [x] **3.1 — Linear webhook handler**
  - Model: **Sonnet**
  - `src/server/routes/webhooks.ts` — receive and validate Linear webhooks
  - Validate the webhook signature. Parse payload with Zod. Handle: Issue created, Issue updated, Comment created. Log all events.

- [ ] **3.2 — Conflict detection for pending proposals**
  - Model: **Opus**
  - When a webhook reports an issue update, check for pending proposals on that issue. Auto-expire proposals that conflict with the manual change.

### Phase 3 Definition of Done
- Webhooks flow in from Linear and are logged
- Pending proposals auto-expire when they'd conflict with manual changes

---

## Phase 4 (new) — Polish & Operational Maturity
**Goal:** Make it reliable for daily use.
**Timeline:** ongoing

### Tasks

- [ ] **4.1 — Error recovery & resilience**
  - Model: **Sonnet**
  - Graceful handling of Linear API downtime and SQLite issues
  - Automatic retry with backoff for transient failures

- [ ] **4.2 — Dashboard improvements**
  - Model: **Sonnet**
  - Filtering, search, pagination on proposal list
  - Bulk approve/reject
  - Quick stats (proposals this week, approval rate, etc.)

- [ ] **4.3 — Notification system**
  - Model: **Sonnet**
  - Optional Slack/email notifications when proposals need review
  - Daily digest summary

---

## Model Selection Quick Reference

| Task Type                        | Model      | Why                                          |
| -------------------------------- | ---------- | -------------------------------------------- |
| Scaffolding / boilerplate        | Sonnet     | Fast, handles structure well                 |
| CRUD / database operations       | Sonnet     | Straightforward logic                        |
| API integration                  | Sonnet     | Well-documented SDK, Sonnet handles it fine   |
| HTML templates / dashboard       | Sonnet     | Template generation is Sonnet's sweet spot   |
| Tests                            | Sonnet     | Test logic is usually straightforward        |
| Conflict detection / edge cases  | **Opus**   | Subtle state machine logic                   |
| Architectural review / cleanup   | **Opus**   | Needs to hold a lot of context               |
| Bug diagnosis                    | **Opus**   | When Sonnet can't figure it out              |

**Default to Sonnet.** Switch to Opus when you're stuck or when the task requires holding a lot of context and reasoning about trade-offs.
