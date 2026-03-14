# CLAUDE.md — Instructions for Claude Code

## Project Overview

This is **Linear Brain** — a project management tool for a small team (2 devs, 2-3 designers, no PM). It reads from Linear freely and provides a human-approval queue for write operations, managed through a web dashboard. The intelligence layer is Claude Code (CC), operated interactively — there is no automated AI in the app.

## Self-Improvement Rule

**This product learns per-team.** Whenever the user requests a change to general CC behaviour, update the appropriate local file immediately:

- **Board conventions** (ticket naming, labels, descriptions, workflows) → `BOARD_RULES.md`
- **Product behaviour** (coding conventions, safety rules, architecture) → `CLAUDE.md` or `ARCHITECTURE.md`

This ensures the repo is self-contained — anyone who clones it gets the same behaviour without needing private memory or context.

**Do NOT update these files for one-off requests** (e.g. "fix this specific ticket", "create a proposal for X"). Only persist rules that should apply to all future interactions.

## Critical Safety Rule

**Every write operation to Linear MUST go through the approval queue.** The AI must NEVER directly mutate Linear data. All mutations flow through `src/queue/executor.ts` which requires an approved proposal. No exceptions.

The only module that imports Linear SDK write methods is `src/linear/writer.ts`. No other file should ever call `linearClient.createIssue()`, `linearClient.updateIssue()`, or any mutation method directly.

## Tech Stack

- **Runtime:** Bun (latest stable)
- **Language:** TypeScript (strict mode)
- **Linear:** `@linear/sdk` — their official SDK wraps the GraphQL API
- **API Server:** Hono (lightweight, runs on Bun natively) — JSON API only
- **Frontend:** React SPA with Ant Design, built by Vite, served as static files by Hono in production
- **Database:** SQLite via `bun:sqlite` — used for the approval queue, audit log, dashboard snapshots, and insights
- **AI:** Claude Code (CC) — interactive + headless (`claude -p` via Opus) for automated actions
- **Validation:** Zod for external data boundaries (webhook payloads, user input)

## Project Structure

```
linear-brain/
├── src/
│   ├── index.ts              # entry: starts Hono server
│   ├── config.ts             # env loading, typed config
│   ├── linear/
│   │   ├── client.ts         # singleton Linear SDK client
│   │   ├── reader.ts         # ALL read operations (free to call anytime)
│   │   └── writer.ts         # ALL write operations (ONLY via approved proposals)
│   ├── queue/
│   │   ├── db.ts             # SQLite schema + migrations
│   │   ├── proposals.ts      # proposal CRUD
│   │   └── executor.ts       # executes APPROVED proposals only
│   ├── dashboard/
│   │   ├── types.ts          # DashboardSnapshot, MemberStats, etc.
│   │   ├── snapshot.ts       # Fetches Linear data and computes dashboard stats
│   │   └── store.ts          # SQLite CRUD for dashboard_snapshots table
│   ├── actions/
│   │   ├── gather-board.ts   # Shared: gathers full board state from Linear
│   │   ├── clean-drafts.ts   # Headless CC action: clean up DRAFT tickets
│   │   ├── audit-board.ts    # Headless CC action: audit board for issues
│   │   └── generate-insight.ts # Headless CC action: generate PM-style insight
│   └── server/
│       ├── app.ts            # Hono app setup + static file serving
│       └── routes/
│           ├── api.ts        # JSON API: proposals, dashboard, actions, insights
│           └── webhooks.ts   # Linear webhook receiver (future)
├── web/                       # React SPA (built by Vite)
│   ├── index.html            # Vite entry
│   ├── vite.config.ts        # Vite config (proxy, build output)
│   ├── tsconfig.json         # Separate TS config for React (DOM libs, JSX)
│   └── src/
│       ├── main.tsx          # React mount point
│       ├── App.tsx           # Root component with router + Ant Design
│       ├── api.ts            # Fetch wrapper for /api/* endpoints
│       ├── types.ts          # Shared types (Proposal, AuditEntry, DashboardSnapshot, Insight)
│       └── pages/
│           ├── Dashboard.tsx      # Project overview with stats, members, blockers
│           ├── ProposalList.tsx   # Proposal queue + Tidy Drafts / Audit Board buttons
│           ├── ProposalDetail.tsx # Single proposal with structured payload view
│           ├── Insights.tsx       # AI-generated board insights (PM briefing)
│           └── AuditLog.tsx       # Dev-only audit log
├── dist/web/                  # Built frontend (gitignored)
├── tests/
│   ├── queue.test.ts
│   ├── reader.test.ts
│   └── proposals.test.ts
├── CLAUDE.md                  # this file
├── ARCHITECTURE.md
├── PROGRESS.md
├── BOARD_RULES.md             # team-specific board conventions (gitignored)
├── BOARD_RULES.example.md     # template for new installations
├── package.json
├── tsconfig.json
├── bunfig.toml
└── .env
```

## Coding Conventions

- **No classes** unless wrapping an SDK. Use plain functions and modules.
- **Explicit imports.** No barrel files (`index.ts` re-exports). Import from the actual file.
- **Zod at boundaries.** Validate all: webhook payloads and user input from the dashboard.
- **Error handling:** Use try/catch at the top of each route handler. Never let errors crash the process silently. Log them clearly.
- **Naming:** Files are `kebab-case.ts`. Functions are `camelCase`. Types/interfaces are `PascalCase`. Database columns are `snake_case`.
- **No `any` type.** Ever. Use `unknown` and narrow.
- **Logging:** Plain `console.log` / `console.error` with prefixes like `[linear-reader]`, `[proposal-queue]`, `[executor]`. No logging library needed yet.

## Linear API Notes

- We use the `@linear/sdk` package which provides a typed GraphQL client.
- If your organisation has MCP disabled (common on enterprise plans), this project is a good alternative — everything goes through the SDK/API.
- The SDK uses a personal API key (stored in `LINEAR_API_KEY` env var).
- Rate limits: Linear allows 1,500 requests per hour. The reader should cache aggressively and avoid polling more than once per minute for any given resource.
- Pagination: Linear uses cursor-based pagination. Always handle it — don't assume a single page returns everything.

## AI / Claude Notes

- **No Anthropic API SDK.** `@anthropic-ai/sdk` is NOT used. No `ANTHROPIC_API_KEY` in config.
- The primary AI workflow is: CC reads Linear data via reader.ts → CC reasons about it → CC creates proposals in the queue via the API → human reviews proposals on the dashboard → executor runs approved ones.
- **Headless actions** (`src/actions/`): The dashboard triggers headless Claude Code CLI (`claude -p --model opus`) for automated tasks. The server gathers Linear data (issues, labels, states, comments), sends it to CC with a structured prompt, and processes the output. Three actions exist:
  - **Tidy Drafts** — finds DRAFT-labeled tickets, cleans up titles/descriptions/labels per BOARD_RULES, suggests estimates. Results go through the approval queue.
  - **Audit Board** — reviews the entire board for convention violations, missing info, related tickets, and suggests fixes. Results go through the approval queue.
  - **Generate Insight** — produces a structured PM-style daily briefing (summary, cycle progress, focus areas, team performance, risks, recommendations). Stored in the `insights` table, not proposals — it's a read-only report.
- All headless actions include issue comments in their context so CC can see clarifications and discussions.
- Requires `claude` CLI to be installed and on PATH for headless actions.
- `Bun.serve` uses `idleTimeout: 255` to accommodate long-running headless CC calls.

## Board Rules

Team-specific board conventions (ticket naming, label groups, description format, DRAFT workflow) live in `BOARD_RULES.md`. This file is gitignored — each installation maintains their own.

- **New users:** `cp BOARD_RULES.example.md BOARD_RULES.md` and edit to match your board.
- **CC reads `BOARD_RULES.md` at the start of every interaction** and follows those rules when creating, updating, or auditing tickets.
- **CC updates `BOARD_RULES.md`** when it learns new general conventions from the user (see Self-Improvement Rule above). One-off requests are not persisted.
- If `BOARD_RULES.md` is missing, prompt the user to create one from the example.

## Frontend Notes

- React SPA with Ant Design (dark theme, shadcn-inspired palette), built by Vite, served as static files by Hono in production.
- Frontend source lives in `web/`, built output goes to `dist/web/` (gitignored).
- `web/tsconfig.json` is a separate TS config (DOM libs, react-jsx). Root tsconfig excludes `web/` and `dist/`.
- In dev: Vite runs on port 5173 with HMR, proxies `/api` and `/webhooks` to Hono on port 3000.
- In prod: `bun run start` builds the frontend then starts Hono which serves both the API and static files on port 3000.
- Custom styling uses inline styles (no Tailwind, no CSS files). Ant Design handles component styling.

### Pages

- **Dashboard** (`/`) — project overview with summary stats, cycle progress, issue breakdown, team member table, blockers, and stale issues. Data comes from dashboard snapshots (refreshable via button or `POST /api/dashboard/snapshot`).
- **Proposals** (`/proposals`) — approval queue for Linear write operations. Pending proposals at top, history in a collapsible accordion with pagination. Includes "Tidy Drafts" and "Audit Board" buttons that trigger headless CC actions. Approve All / Reject All for batch operations.
- **Proposal Detail** (`/proposals/:id`) — structured view of a single proposal with human-readable payload ("Changes" section), reasoning, and approve/reject buttons.
- **Insights** (`/insights`) — AI-generated PM briefings. Latest insight displayed in full, previous insights in collapsible accordions. "Generate Insight" button triggers Opus analysis.
- **Audit Log** (`/audit`) — dev-only page, icon-only button in the header far right. Shows raw audit trail.

### Shared Types
- Proposal/AuditEntry/DashboardSnapshot/Insight types are duplicated between `src/` and `web/src/types.ts` — keep in sync manually.

## Testing

- Use Bun's built-in test runner (`bun test`).
- Test the approval queue logic thoroughly — this is the safety layer.
- Mock the Linear SDK client in tests. Never hit the real API in tests.
- Test that `writer.ts` refuses to execute unapproved proposals.

## Environment Variables

```
LINEAR_API_KEY=lin_api_xxxxx
LINEAR_WEBHOOK_SECRET=whsec_xxxxx   # optional; if set, webhook signatures are verified
PORT=3000
DATABASE_PATH=./data/brain.db
```

## Git Conventions

- Conventional commits: `feat:`, `fix:`, `chore:`, `docs:`
- Branch from `main`, PR back to `main`
- No force pushes to `main`

---

## User Preferences

- **Self-verify after every task.** Run all checks yourself (type-check, tests, server start, etc.). Never ask the user to verify — fix any failures before marking a task done.

---

## Learned — Task 3.1

- Linear SDK ships a `@linear/sdk/webhooks` sub-package with `LinearWebhookClient`. Use `webhookClient.verify(Buffer.from(rawBody), signature, timestamp)` — note the first arg must be `Buffer`, not `string`.
- `LINEAR_WEBHOOK_SECRET` is optional in config (null when absent). When absent, accept without verification but log a warning (dev convenience). When present, reject missing/invalid signatures.
- `webhookClient.verify()` can throw (e.g. on malformed signatures) — wrap in try/catch and treat exceptions as invalid.

## Learned — Task 2.6

- Bun 1.3.10 does NOT support `[test.env]` in bunfig.toml. Use `.env.test` instead — Bun automatically loads it when running `bun test`.
- `mock.module()` must be called before any import that transitively loads the module being mocked. Place it at the top of the test file before other imports.
- Use `DATABASE_PATH=:memory:` in `.env.test` to keep tests fully in-memory — no files created, no cleanup needed.
- Use `beforeEach(() => { db.run("DELETE FROM ...") })` for test isolation within a test file that shares the singleton DB.

## Learned — Task 2.5

- `listProposals()` takes `ProposalStatus`, not `ProposalType` — easy to mix up when casting query params. Always import the right type explicitly.
- Hono's `c.redirect()` with status 303 is correct for post-then-redirect pattern (form submits).
- For routes used by both forms (HTML) and CC (JSON), check `Accept` header to decide response format on errors.

## Learned — Task 2.3

- Linear SDK mutation input types (`IssueCreateInput`, `IssueUpdateInput`, `CommentCreateInput`) are also not exported. Use `Parameters<typeof linearClient.createIssue>[0]` etc. to extract them.
- `linearClient.createIssue()` returns a payload with a `success` flag and an `.issue` getter that itself returns a `LinearFetch` (another async call needed to resolve the issue object).

## Learned — Task 1.5

- On macOS, chaining `bun run src/index.ts & sleep 3 && curl ...` doesn't work — the shell treats extra tokens as sleep arguments. Run server in background separately (`run_in_background: true`), then issue curl in a follow-up command.
- `/debug/linear` route confirmed real Linear workspace data returns correctly with the API key.

## Learned — Task 1.3

- `IssuesQueryVariables` is not exported from `@linear/sdk`. Use `Parameters<typeof linearClient.issues>[0]` to get the type from the SDK directly.
- `bunx tsc --noEmit` must be run without individual file args to pick up tsconfig.json (which enables `allowImportingTsExtensions`). Running it with file args ignores tsconfig and gives false errors.
- The Linear SDK `LinearFetch<T>` resolves to `T | undefined`, so callers of `getIssue()` should handle `undefined`.
- Pagination pattern: loop with `collectAll()` helper, pass `after` cursor, stop when `pageInfo.hasNextPage` is false.

## Learned — Task 1.2

- User prefers plain TS over Zod for config/env validation. Use `requireEnv()` helper pattern instead of Zod schemas for env vars.
- `bun --check` executes the file rather than just type-checking; use `bunx tsc --noEmit` for type-checking individual files.

## Learned — Task 1.1

- `bun init` auto-creates a `.cursor/` folder with IDE rules — delete it immediately, we use Claude Code only.
- `bun init` places `index.ts` at the project root; move it to `src/index.ts` to match the project structure.
- Package name should be `linear-brain` (matches the project name in the docs), not `linear-bot` (the directory name).
- Installed versions: `@linear/sdk@77.0.0`, `hono@4.12.6`, `zod@4.3.6`. (`@anthropic-ai/sdk` was removed — CC-driven, no in-app AI.)
- Note: zod 4.x is installed (not 3.x). Be aware of any API differences if tasks assume zod v3 patterns.
