# CLAUDE.md — Instructions for Claude Code

## Project Overview

This is **Linear Brain** — a project management tool for a small team (2 devs, 2-3 designers, no PM). It reads from Linear freely and provides a human-approval queue for write operations, managed through a web dashboard. The intelligence layer is Claude Code (CC), operated interactively — there is no automated AI in the app.

## Critical Safety Rule

**Every write operation to Linear MUST go through the approval queue.** The AI must NEVER directly mutate Linear data. All mutations flow through `src/queue/executor.ts` which requires an approved proposal. No exceptions.

The only module that imports Linear SDK write methods is `src/linear/writer.ts`. No other file should ever call `linearClient.createIssue()`, `linearClient.updateIssue()`, or any mutation method directly.

## Tech Stack

- **Runtime:** Bun (latest stable)
- **Language:** TypeScript (strict mode)
- **Linear:** `@linear/sdk` — their official SDK wraps the GraphQL API
- **Web Server:** Hono (lightweight, runs on Bun natively)
- **Database:** SQLite via `bun:sqlite` — used for the approval queue and audit log
- **AI:** Claude Code (CC) — run interactively by the developer, no in-app AI SDK
- **Validation:** Zod for external data boundaries (webhook payloads, user input)
- **No other frameworks.** No React, no ORMs, no build tools. Bun handles everything.

## Project Structure

```
linear-brain/
├── src/
│   ├── index.ts              # entry: starts server
│   ├── config.ts             # env loading, typed config
│   ├── linear/
│   │   ├── client.ts         # singleton Linear SDK client
│   │   ├── reader.ts         # ALL read operations (free to call anytime)
│   │   └── writer.ts         # ALL write operations (ONLY via approved proposals)
│   ├── queue/
│   │   ├── db.ts             # SQLite schema + migrations
│   │   ├── proposals.ts      # proposal CRUD
│   │   └── executor.ts       # executes APPROVED proposals only
│   └── server/
│       ├── app.ts            # Hono app setup
│       ├── routes/
│       │   ├── dashboard.ts  # approval UI
│       │   ├── api.ts        # proposal CRUD + approve/reject endpoints
│       │   └── webhooks.ts   # Linear webhook receiver (future)
│       └── views/
│           └── templates.ts  # HTML template functions (no framework)
├── tests/
│   ├── queue.test.ts
│   ├── reader.test.ts
│   └── proposals.test.ts
├── CLAUDE.md                  # this file
├── ARCHITECTURE.md
├── PROGRESS.md
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

- **There is no Anthropic API integration in this app.** All AI analysis and proposal generation is done interactively via Claude Code (CC) by the developer.
- `@anthropic-ai/sdk` is NOT used. Do not add it back.
- No `ANTHROPIC_API_KEY` in config. No scheduler. No automated analyzers.
- The AI workflow is: CC reads Linear data via reader.ts → CC reasons about it → CC creates proposals in the queue via the API → human reviews proposals on the dashboard → executor runs approved ones.
- Phases 3 and 4 from the original plan (automated analyzers and proposers) are replaced by this CC-driven workflow.

## Dashboard Notes

- Server-side rendered HTML. No client-side framework.
- Hono serves HTML from template functions in `src/server/views/templates.ts`.
- Use `<form>` posts for approve/reject actions. No JavaScript required on the frontend for core functionality.
- Minimal CSS — use system fonts, a simple grid, and keep it functional over pretty.
- The dashboard shows: pending proposals, recent approvals/rejections, and an audit log.

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
