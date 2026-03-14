# Linear Brain

Your AI project manager for [Linear](https://linear.app). No MCP required.

Linear Brain gives small teams (2-5 people, no dedicated PM) an AI-powered command centre for their Linear board. It reads your workspace freely, proposes changes through a human-approval queue, and generates daily PM-style insights — all through a dark-themed dashboard.

## Why this exists

- Your Linear workspace has **MCP disabled** (common on enterprise plans) — AI tools that rely on MCP can't connect
- You're a **small team without a PM** and want AI to fill the gap — board hygiene, workload analysis, ticket cleanup
- You want AI to **make changes to Linear** but need human oversight on every single write operation
- You want a **daily briefing** on project health without manually crunching numbers

## What it does

### Dashboard
Real-time project overview: story points completed this week, cycle progress, per-person workload breakdown, blockers, and stale issues. One click to refresh from Linear.

### Proposals (Approval Queue)
Every write operation goes through a proposal queue. Review what the AI wants to change, see the reasoning, then approve or reject. Batch approve/reject for speed.

Two AI-powered actions built in:

- **Tidy Drafts** — finds all tickets tagged `DRAFT`, rewrites titles/descriptions to your conventions, fixes labels, suggests estimates. One button.
- **Audit Board** — scans the entire board for convention violations, missing info, related tickets worth linking, and label/priority mismatches. Reads comments too, so it won't flag things already clarified in discussion.

### Insights (AI PM Briefing)
Hit "Generate Insight" and Opus analyses your entire board — every ticket, every comment, every person's workload. It produces a structured daily briefing:

- **Summary** — the single most important thing to know today
- **Cycle Progress** — are you on track?
- **Focus Areas** — top 3 things that need attention right now
- **Team Performance** — per-person breakdown with candid assessments (who's overloaded, who's blocked, who's underutilised)
- **Risks & Blockers** — specific tickets that could derail the week
- **Recommendations** — concrete actions to take today

Designed to run every morning. Brutally honest, data-driven, repeatable. Previous insights are kept so you can track how things evolve.

### Audit Log
Dev-only view of every action taken through the system.

## How it works

```
Linear API ←── reader.ts (free reads)
                    ↓
         Dashboard snapshots / Board data
                    ↓
    ┌───────────────┼───────────────┐
    ↓               ↓               ↓
Tidy Drafts    Audit Board    Generate Insight
(headless CC)  (headless CC)  (headless CC)
    ↓               ↓               ↓
 Proposals       Proposals      Insight report
    ↓               ↓           (stored, displayed)
    └───────┬───────┘
            ↓
    Human reviews on dashboard
    Approve → Executor → writer.ts → Linear API
    Reject  → Logged
```

Headless actions use `claude -p --model opus` — the server gathers all board data (issues, labels, states, comments), sends it to Claude with a structured prompt, and processes the output. No Anthropic API SDK needed — just the Claude CLI.

## Tech stack

| Layer | Technology |
|-------|-----------|
| Runtime | [Bun](https://bun.sh) |
| Language | TypeScript (strict) |
| Linear | [`@linear/sdk`](https://github.com/linear/linear) (official GraphQL SDK) |
| API server | [Hono](https://hono.dev) (JSON API) |
| Frontend | React + [Ant Design](https://ant.design) (dark theme), built by [Vite](https://vite.dev) |
| Database | SQLite via `bun:sqlite` |
| AI | [Claude Code](https://claude.com/claude-code) CLI (headless Opus for actions/insights) |

## Setup

### Prerequisites

- [Bun](https://bun.sh) (latest stable)
- [Claude Code](https://claude.com/claude-code) CLI installed and on PATH (for Tidy Drafts, Audit Board, and Insights)
- A [Linear](https://linear.app) API key (Settings > API > Personal API keys)

### Install

```bash
bun install
```

### Configure

```bash
cp .env.example .env
```

```env
LINEAR_API_KEY=lin_api_xxxxx
PORT=3000
DATABASE_PATH=./data/brain.db
```

Set up your board conventions:

```bash
cp BOARD_RULES.example.md BOARD_RULES.md
# Edit BOARD_RULES.md to match your team's naming, labels, and description format
```

### Run

```bash
# Development (Vite HMR + API server with auto-reload)
bun run dev

# Production (builds frontend, then starts server)
bun run start
```

- **Dev mode:** Frontend on `http://localhost:5173` (Vite, with HMR), API on `http://localhost:3000`
- **Production:** Everything on `http://localhost:3000`

### Test

```bash
bun test
```

## API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/proposals` | List proposals (filter by `?status=`) |
| `GET` | `/api/proposals/:id` | Get a single proposal |
| `POST` | `/api/proposals` | Create a proposal |
| `POST` | `/api/proposals/approve-all` | Approve and execute all pending |
| `POST` | `/api/proposals/reject-all` | Reject all pending |
| `POST` | `/api/proposals/:id/approve` | Approve and execute a proposal |
| `POST` | `/api/proposals/:id/reject` | Reject a proposal |
| `GET` | `/api/dashboard` | Latest dashboard snapshot |
| `POST` | `/api/dashboard/snapshot` | Refresh dashboard data from Linear |
| `GET` | `/api/insights` | List all insights |
| `POST` | `/api/insights/generate` | Generate a new AI insight |
| `POST` | `/api/actions/clean-drafts` | Tidy all DRAFT tickets |
| `POST` | `/api/actions/audit-board` | Audit the board for issues |
| `GET` | `/api/audit` | Audit log entries |
| `POST` | `/webhooks/linear` | Linear webhook receiver |

## Safety model

- **`reader.ts`** can query Linear freely — no restrictions on reads
- **`writer.ts`** is the only module that calls Linear mutation methods
- **`executor.ts`** is the only module that imports `writer.ts`
- The executor verifies `status === 'approved'` before executing any proposal
- Headless AI actions create proposals — they never write to Linear directly
- All actions are logged to an audit table

## Licence

MIT
