# Board Rules

This file defines how Claude Code (CC) manages your Linear board. It is team-specific — each installation should have its own `BOARD_RULES.md` customized for their workspace.

## Setup

```bash
cp BOARD_RULES.example.md BOARD_RULES.md
# Then edit BOARD_RULES.md to match your team's conventions
```

CC will read `BOARD_RULES.md` at the start of every interaction and follow these rules when creating or updating tickets. CC will also update this file as it learns your preferences — see the Self-Improvement Rule in CLAUDE.md.

---

## Ticket Naming

<!-- Define your ticket title format. Example below uses "Subject: Action". -->

- Format: `Subject: Action` (colon separator)
- Subject = the thing (component name, system area, or deliverable)
- Action = what's being done (verb phrase or clear noun phrase)
- Max ~60 characters, spell check everything
- Examples: `Button: Rename props`, `Auth: Fix session timeout`, `Docs: Write API guide`

## Label Groups

<!-- Define your label groups. CC will enforce one label from each mandatory group per ticket. -->
<!-- Label IDs are fetched at runtime — just list the names here. -->

### Group: Discipline (mandatory, pick one)
Who does the work.
- `Design`
- `Dev`
- `Ops`

### Group: Area (mandatory, pick one)
What part of the product it touches.
- `Bug`
- `Feature`
- `Documentation`
- `Infrastructure`

<!-- Add more groups as needed. Mark each as mandatory or optional. -->

## Ticket Descriptions

<!-- Define the structure CC should use when writing or rewriting ticket descriptions. -->

- **Intro paragraph**: 1-2 sentences explaining WHAT and WHY
- **Requirements list**: Bullet points of specific deliverables/tasks
- **Links section**: Any relevant Figma, docs, or reference URLs
- Always preserve existing attachments (images, screenshots, file links) from the original description — never drop content
- When context is unclear, flag it with `[TBC]` rather than guessing
- Human comments are left untouched — only the description field is rewritten

## DRAFT Workflow

<!-- If your team uses a "DRAFT" label for quick-capture tickets that need cleanup, define the workflow here. Remove this section if not applicable. -->

- `DRAFT` is a standalone label (not in any group) used as a temporary flag
- Applied to tickets created quickly (e.g. during meetings) that need AI cleanup
- When user asks to "audit", "fix", "clean up drafts", or "clean up the board":
  1. Find all tickets tagged `DRAFT`
  2. Fix title to match the naming format above
  3. Ensure mandatory label groups are satisfied
  4. Rewrite description to standard format
  5. Remove the `DRAFT` label in the same proposal
  6. Submit as proposals for user approval

## Readiness Checklist

<!-- Define what must be true before a ticket can move to "In Progress". -->

- Properly formatted description (intro + requirements + links)
- All mandatory label groups satisfied
- Assignee set

## Additional Rules

<!-- Add any other team-specific rules CC should follow. Examples: -->
<!-- - "Never close tickets automatically — only move them to Done" -->
<!-- - "Priority 1 tickets must have a due date" -->
<!-- - "Design tickets need a Figma link in the description" -->
