# Linear Brain

Manage your [Linear](https://linear.app) board with AI — without needing MCP.

Many organisations on Linear enterprise plans have MCP disabled due to security policies, making it impossible to use AI tools that rely on MCP servers for Linear integration. Linear Brain is a workaround: it connects to Linear via the official SDK, provides a human-approval queue for all write operations, and lets you use [Claude Code](https://claude.com/claude-code) (or any AI tool) as an interactive PM assistant.

## Why this exists

- Your Linear workspace has MCP disabled (enterprise policy)
- You want AI to help manage your board but need human oversight on every change
- You're a small team without a dedicated PM and want AI to fill that gap
- You want to batch-process tickets (rename, relabel, rewrite descriptions, estimate) safely

## How it works

```
AI reads Linear  →  AI creates proposals  →  Human reviews on dashboard  →  Approved actions execute
```

1. **Read freely** — AI queries your Linear workspace via the SDK (issues, labels, cycles, etc.)
2. **Propose changes** — AI submits proposals to the approval queue (`POST /api/proposals`)
3. **Human reviews** — Proposals appear on a web dashboard with summaries and reasoning
4. **Execute safely** — Approved proposals are executed against Linear. Rejected ones are logged.

Every write operation goes through the approval queue. No exceptions.

## What the AI can do

With Claude Code (or any AI) running interactively:

- **Standardise tickets** — rename titles, rewrite descriptions, fix labels across the board
- **Estimate work** — analyse tickets and propose story point estimates
- **Act as a PM** — analyse board state, identify bottlenecks, flag overloaded team members, spot stale tickets
- **DRAFT workflow** — tag messy tickets with DRAFT, and the AI cleans them up (title, description, labels)
- **Batch operations** — relabel, re-estimate, or rewrite descriptions across dozens of tickets at once

All proposed changes go through the approval queue — review them one by one or approve all at once.

## Tech stack

- **Runtime:** [Bun](https://bun.sh)
- **Language:** TypeScript (strict)
- **Linear:** [`@linear/sdk`](https://github.com/linear/linear/tree/master/packages/sdk) (official GraphQL SDK)
- **Web server:** [Hono](https://hono.dev)
- **Database:** SQLite via `bun:sqlite`
- **Validation:** Zod (external boundaries)
- **AI:** Not embedded — you run Claude Code (or any AI) interactively

## Setup

### Prerequisites

- [Bun](https://bun.sh) (latest stable)
- A [Linear](https://linear.app) account with an API key (read + write scopes)

### Install

```bash
bun install
```

### Configure

Copy the example env file and add your API key:

```bash
cp .env.example .env
```

```env
LINEAR_API_KEY=lin_api_xxxxx
PORT=3000
DATABASE_PATH=./data/brain.db
```

Optionally, for webhook signature verification:

```env
LINEAR_WEBHOOK_SECRET=whsec_xxxxx
```

### Run

```bash
# Development (auto-reload)
bun run dev

# Production
bun run start
```

The dashboard will be available at `http://localhost:3000`.

### Test

```bash
bun test
```

## Project structure

```
src/
├── index.ts              # Entry point
├── config.ts             # Env loading, typed config
├── linear/
│   ├── client.ts         # Singleton Linear SDK client
│   ├── reader.ts         # All read operations (unrestricted)
│   └── writer.ts         # All write operations (approval queue only)
├── queue/
│   ├── db.ts             # SQLite schema + migrations
│   ├── proposals.ts      # Proposal CRUD
│   └── executor.ts       # Executes approved proposals
└── server/
    ├── app.ts            # Hono app setup
    ├── routes/
    │   ├── dashboard.ts  # Approval UI
    │   ├── api.ts        # Proposal CRUD + approve/reject endpoints
    │   └── webhooks.ts   # Linear webhook receiver
    └── views/
        └── templates.ts  # HTML template functions

scripts/                  # Reusable dump, audit, and analysis scripts
tests/                    # Bun test runner tests
```

## Scripts

Reusable scripts for reading and analysing your Linear workspace:

| Script | Description |
|--------|-------------|
| `dump-status.ts` | Dump issues by status with comments (`bun run scripts/dump-status.ts "In Progress"`) |
| `dump-issues.ts` | Dump all issues with full detail (assignee, labels, dates, etc.) |
| `dump-labels.ts` | Dump all labels with group/team info |
| `dump-drafts.ts` | Dump issues with a specific label (`bun run scripts/dump-drafts.ts "DRAFT"`) |
| `dump-estimates.ts` | Show estimated vs unestimated issues |
| `board-analysis.ts` | Full board snapshot for PM-style AI analysis |
| `label-audit.ts` | Audit label coverage (find unlabelled or mis-labelled tickets) |
| `workspace-state.ts` | Overview of teams, cycles, members, and open issues |

### Getting started with AI

Before making any changes, **teach the AI your board first.** The AI needs to understand your workspace structure, conventions, and ticket style before it can help effectively.

#### Step 1: Let the AI learn your board

Start Claude Code (or your AI tool of choice) from the project root and run something like:

```
I want you to learn my Linear board before making any changes.

1. Run scripts/workspace-state.ts to understand the team structure
2. Run scripts/dump-labels.ts to learn my label taxonomy
3. Run scripts/dump-issues.ts to see all tickets
4. Run scripts/board-analysis.ts for the full board state

Study the patterns: how are titles formatted? What labels exist and how are
they grouped? What does a good description look like vs a bad one? What
estimation scale is used?

Summarise what you've learned and save it to your memory so you can
reference it in future sessions.
```

The AI will study your workspace and learn your conventions — title format, label groups, description style, estimation scale, team members, etc.

#### Step 2: Ask for insights

Once the AI knows your board, ask it for a PM-style analysis:

```
Give me an honest assessment of the board. Look at workload distribution,
stale tickets, WIP limits, blocked items, and anything that looks off.
```

#### Step 3: Make changes

When you're ready to make changes, the AI writes propose scripts tailored to your workspace:

```
Go through all tickets in the Backlog and rewrite their descriptions
to follow the format you've learned. Submit them as proposals.
```

The AI will:
1. Fetch the relevant tickets using the dump scripts
2. Generate a propose script with your issue IDs and improved content
3. Submit proposals to the approval queue
4. You review and approve on the dashboard

The propose scripts are workspace-specific (they contain your issue IDs and descriptions), so the AI generates new ones each time rather than reusing them.

#### Tips

- **Always let the AI read before it writes.** If it hasn't seen your board, it'll make generic suggestions. If it has, it'll match your style.
- **Use the DRAFT label workflow.** Quickly dump tickets in meetings, tag with DRAFT, and let the AI clean them up later.
- **Save conventions to CLAUDE.md.** Once you've established your ticket format, label rules, and estimation scale, document them in CLAUDE.md so the AI follows them in every session.
- **Review proposals individually at first.** Once you trust the pattern, use "Approve All" for batch operations.

## API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/` | Dashboard (pending proposals, recent activity) |
| `GET` | `/api/proposals` | List proposals (filter by `?status=`) |
| `GET` | `/api/proposals/:id` | Get a single proposal |
| `POST` | `/api/proposals` | Create a proposal |
| `POST` | `/api/proposals/approve-all` | Approve and execute all pending |
| `POST` | `/api/proposals/:id/approve` | Approve a proposal |
| `POST` | `/api/proposals/:id/reject` | Reject a proposal |
| `POST` | `/webhooks/linear` | Linear webhook receiver |

### Creating a proposal

```bash
curl -X POST http://localhost:3000/api/proposals \
  -H "Content-Type: application/json" \
  -d '{
    "type": "update_issue",
    "summary": "TEAM-1: Rewrite description",
    "reasoning": "Standardising ticket description format.",
    "payload": {
      "id": "issue-uuid-here",
      "description": "New description text"
    }
  }'
```

Supported types: `create_issue`, `update_issue`, `add_comment`

## Safety model

- **`reader.ts`** can query Linear freely — no restrictions on reads
- **`writer.ts`** is the only module that calls Linear mutation methods
- **`executor.ts`** is the only module that imports `writer.ts`
- The executor verifies `status === 'approved'` before executing any proposal
- All actions are logged to an audit table

## Licence

MIT
