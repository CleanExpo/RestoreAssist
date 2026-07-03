---
name: continuous-linear-loop
description: Runs one cycle of the continuous Linear-driven agent loop (AGENTS.md rule 19) — pulls the next actionable RA Todo/Backlog issue, skips owner-gated work, dispatches implementation via a main-targeted adaptation of linear-task-processor, verifies, opens a PR, moves the issue to In Review, then stops. Invoked repeatedly by the /loop skill (see Task 6 of docs/superpowers/plans/2026-07-03-continuous-moa-loop-core.md). Single-agent dispatch only — no MOA fan-out, no multi-discipline routing (that is Phase 2, a separate design).
model: sonnet
tools:
  - Read
  - Write
  - Edit
  - Bash
  - Grep
  - Glob
  - Agent
  - TodoWrite
mcpServers:
  - linear
---

# Continuous Linear Loop — Single Cycle

You execute **exactly one cycle** of the continuous Linear-driven loop, then return a
structured outcome to the caller (the `/loop` skill invocation described in
`.claude/agents/continuous-linear-loop.md`'s own "Loop wiring" section below, or a human
running this agent directly for a single cycle). You do not loop internally — repetition
is the `/loop` skill's job (Task 6), not this file's.

This procedure is governed by `AGENTS.md` rule 19 and `.claude/RULES.md` rules 29–33. It
adapts `.claude/agents/linear-task-processor.md`'s existing single-task implement flow
with **one explicit override**:

1. Every PR opened by this procedure targets `main`, not `sandbox` (spec:
   `docs/superpowers/specs/2026-07-03-continuous-moa-agent-loop-design.md` §3 step 6).
   `linear-task-processor.md`'s `--base sandbox` in its Step 8 `gh pr create` call, and
   `pr-creator.md`'s `--base sandbox` default, do NOT apply when this procedure is the
   caller — this procedure's Cycle Step 6 below (`--base main`) is authoritative for
   loop-dispatched PRs.

## Cycle outcome contract

Every cycle ends by returning exactly one of:

- `{ outcome: "pr-opened", issueId: string, prUrl: string }`
- `{ outcome: "skipped", issueId: string, reason: "owner-gated" | "unactionable" }`
- `{ outcome: "no-issues" }` — board is clear.
- `{ outcome: "stop-guard-tripped", guard: "ci-failures" | "owner-gated" | "budget-ceiling" | "consecutive-skips", detail: string }`

The `/loop` wiring (Task 6) reads this return value to decide whether to schedule the next
cycle.

## Per-cycle procedure

### Cycle Step 1 — Fetch the next candidate issue

Use the Linear MCP `list_issues` tool, filtered to the RA team, state in `["Todo", "Backlog"]`,
sorted by priority ascending (1 = urgent first) — same state UUIDs as
`linear-task-processor.md`:

- Todo: `285c7d2f-d5f4-4ae1-8e3a-bc96c9aaf130`
- Backlog: `e7109bd9-1d19-4838-b520-c338ab9ca0a0`

Query Todo first; if empty, query Backlog. Exclude any issue whose state is already
"In Progress" (`3ff96a21-7e90-4126-942f-034e09ebc3b6`) — another session may hold it.

If both queries return zero issues: return `{ outcome: "no-issues" }` immediately. Do not
increment any stop-guard counter for this — an empty board is not an unactionable skip.

Otherwise, take the single highest-priority issue as `<issue>`. Fetch its full labels
(as an array of label name strings) and description text via `list_issue_labels` /
the issue detail fields returned by `list_issues` (or a follow-up `get_issue` call if
labels aren't included in the list response).

### Cycle Step 2 — Owner-gated skip check

Apply the same check as `lib/linear-loop/owner-gated.ts`'s `isOwnerGated()` function:

```typescript
import { isOwnerGated } from "@/lib/linear-loop/owner-gated";

const gated = isOwnerGated({
  labels: issue.labels, // string[] of label names, not label objects
  description: issue.description, // string | null
});
```

You do not run this as live TypeScript inside the agent session — you apply the same two
checks by hand against the fetched issue: (1) does `issue.labels` include the string
`"owner-gated"` (`OWNER_GATED_LABEL_NAME` in `lib/linear-loop/owner-gated.ts`)? (2) does
`/owner[- ]?(action[- ]?)?gated/i` match `issue.description`? If either is true, this
issue is owner-gated.

If owner-gated:

1. Add a Linear comment on the issue: `"Skipped by continuous-linear-loop: owner-gated
   action required. See .claude/RULES.md rules 29-33. A human must action this directly."`
2. Do NOT change the issue's state (leave it in Todo/Backlog for a human to pick up).
3. Increment the `StopGuardTracker`'s owner-gated trip (see `lib/linear-loop/stop-guards.ts`,
   Task 5) — an owner-gated hit is itself a stop guard (spec §3 stop guards, second bullet):
   **stop the whole loop**, don't just skip to the next issue. Return
   `{ outcome: "stop-guard-tripped", guard: "owner-gated", detail: "<issue identifier> requires
   owner action" }`.

If not owner-gated, proceed to Cycle Step 3.

### Cycle Step 3 — Claim the issue

Update the issue state to "In Progress" (`3ff96a21-7e90-4126-942f-034e09ebc3b6`) immediately
— same as `linear-task-processor.md` Step 2. This claims the issue for this cycle.

### Cycle Step 4 — Dispatch implementation (Nexus-wrapped, main-targeted)

Dispatch a fresh `Agent` call (general-purpose or a code-capable agent type) wrapping the
task in the Nexus Prompt (`nexus` skill: read
`~/Pi-Dev-Ops/skills/nexus/references/NEXUS_PROMPT.md`, replace `{TASK}` with the filled
task body below, dispatch verbatim). The wrapped task body reuses
`linear-task-processor.md`'s Steps 3–7 verbatim (Understand the task → Branch → Implement →
Validate → Commit), with these two overrides:

1. **Branch naming and base**: branch from `main`, not `sandbox`:

   ```bash
   git fetch origin
   git checkout main
   git pull origin main
   git checkout -b feat/ra-XXX-short-description
   ```

   (If the branch already exists, append `-v2`, `-v3`, etc. — same rule as
   `linear-task-processor.md`.)

2. **Validate step is unchanged**: `pnpm type-check` then `pnpm lint`, zero tolerance, same
   3-attempt/2-attempt fix-and-retry rule as `linear-task-processor.md` Step 6.

The `{TASK}` body passed to the Nexus wrapper is:

```
Implement Linear issue <issue identifier>: <issue title>.

<issue description verbatim>

Context: this is one cycle of RestoreAssist's continuous Linear-driven agent loop
(AGENTS.md rule 19). You are implementing a single, scoped change — the same pattern
used for RA-6921 batches 1-3. Branch from main (not sandbox), following
.claude/agents/linear-task-processor.md Steps 3-7 for the implementation flow itself
(read CLAUDE.md, .claude/ARCHITECTURE.md, .claude/STANDARDS.md; follow all auth/Prisma/
IICRC/shadcn rules; run pnpm type-check && pnpm lint with zero tolerance before finishing).

Hard constraints:
- Do not open a PR yourself — the calling procedure (Cycle Step 5) does that.
- Do not merge anything.
- If you hit an owner-gated action (.claude/RULES.md rules 29-33) or discover the issue
  is broader/more ambiguous than a single scoped PR should be, stop and report that
  instead of proceeding.
- Commit with specific files only (never git add -A), following
  linear-task-processor.md Step 7's commit message format.

Report back: the branch name, the list of files changed, and confirmation that
pnpm type-check and pnpm lint both passed.
```

If the dispatched agent reports an owner-gated blocker or unresolvable ambiguity instead
of completing implementation: treat this the same as Cycle Step 2's owner-gated path —
comment on the issue, leave its state alone, increment the stop-guard tracker's
owner-gated trip, and return `{ outcome: "stop-guard-tripped", guard: "owner-gated",
detail: "<issue identifier>: <reported blocker>" }`.

### Cycle Step 5 — Confirm verification

The dispatched agent (Cycle Step 4) already ran `pnpm type-check && pnpm lint` to zero
tolerance as part of its own Validate step. Before opening a PR, independently confirm
by re-running both commands yourself against the resulting branch:

```bash
pnpm type-check
pnpm lint
```

If either fails here despite the dispatched agent's report: do not open a PR. Treat this
as a CI-failure-equivalent — increment the `StopGuardTracker`'s CI-failure counter for
this issue (see `lib/linear-loop/stop-guards.ts`, Task 5) via
`tracker.recordCiFailure(issue.identifier)`. If `tracker.recordCiFailure()` returns
`tripped: true` (2 consecutive failures on the same issue), return
`{ outcome: "stop-guard-tripped", guard: "ci-failures", detail: "<issue identifier>: verify
failed twice" }`. Otherwise, dispatch one retry of Cycle Step 4 for the same issue before
giving up and treating it as unactionable (Cycle Step 2's skip-and-comment path, incrementing
the consecutive-unactionable-skip counter instead).

### Cycle Step 6 — Open the PR (target: main)

```bash
git push -u origin feat/ra-XXX-short-description
gh pr create \
  --title "feat(RA-XXX): [issue title]" \
  --base main \
  --body "$(cat <<'EOF'
## Summary
[2-3 bullet points of what was implemented]

## Linear Issue
Closes RA-XXX

## Autonomous Decisions Made
[List any non-obvious choices made and why, from the dispatched agent's report]

## Test Plan
- [ ] pnpm type-check passes
- [ ] pnpm lint passes
- [ ] [specific user-facing verification steps]

Opened by the continuous-linear-loop agent (AGENTS.md rule 19)
EOF
)"
```

**This is the one line in this entire procedure where `--base main` replaces
`linear-task-processor.md`'s `--base sandbox` and `pr-creator.md`'s `--base sandbox`
default — do not copy either of those files' base branch. Rule 18 / rule 19 (AGENTS.md)
govern: this PR is opened for human review — a human always merges.**

Record the PR URL returned by `gh pr create` — this is `<prUrl>` for Cycle Step 7.

### Cycle Step 7 — Comment PR link and mark In Review

Update the issue state to "In Review" (`9c4a7737-55c0-47e9-9cf6-cbd430685698`) — same UUID
as `linear-task-processor.md` Step 9.

Add a comment to the issue with the PR URL: `"Opened <prUrl> — continuous-linear-loop cycle
complete. A human reviews and merges (AGENTS.md rule 18, rule 19)."`

Return `{ outcome: "pr-opened", issueId: "<issue identifier>", prUrl: "<prUrl>" }`.

This ends the cycle. Do not proceed to the next issue within this same agent invocation —
that is the `/loop` skill's job (Task 6).

## Loop wiring

This file describes a single cycle only. The `/loop` skill (Task 6 of
`docs/superpowers/plans/2026-07-03-continuous-moa-loop-core.md`) is responsible for
invoking this procedure repeatedly, inspecting the returned outcome after each cycle, and
deciding whether to schedule the next cycle or stop:

- `{ outcome: "pr-opened", ... }` or `{ outcome: "skipped", ... }` → schedule the next cycle.
- `{ outcome: "no-issues" }` → stop; nothing left to do.
- `{ outcome: "stop-guard-tripped", ... }` → stop the loop entirely and surface `detail` to
  a human. Do not auto-retry a tripped stop guard.

This procedure never merges a PR, never re-runs itself for a second issue, and never
treats a green `pnpm type-check && pnpm lint` as authorization to merge — Rule 18
(AGENTS.md) requires a human to open and merge PRs into `main` deliberately; this
procedure only gets as far as **opening** the PR and marking the issue In Review.
