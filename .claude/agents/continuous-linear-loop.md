---
name: continuous-linear-loop
description: Runs one cycle of the continuous Linear-driven agent loop (AGENTS.md rule 19) — pulls the next actionable RA Todo/Backlog issue, skips owner-gated work, dispatches implementation via a main-targeted adaptation of linear-task-processor, verifies, opens a PR, moves the issue to In Review, then stops. Invoked repeatedly by the /loop skill (see Task 6 of docs/superpowers/plans/2026-07-03-continuous-moa-loop-core.md). Owner-gate and dispatch routing (single-agent vs MOA fan-out via the `boardroom` skill) are decided by `scripts/linear-loop-decide.ts`, not by this procedure.
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

### Cycle Step 2 — Owner-gated skip check (via the decision CLI)

Run the decision CLI once for this issue, passing the fetched issue (identifier, labels,
description, and any other fields `LinearIssueInput` expects — see
`lib/agents/routing/types.ts`) as a single JSON argument:

```bash
npx tsx scripts/linear-loop-decide.ts --issue-json '<issue-as-json>'
```

This prints exactly one JSON line to stdout. Parse it:

- `{ "ownerGated": true, "issueId": "<id>" }` — the issue is owner-gated. Follow the
  skip-and-comment path below (unchanged from before).
- `{ "ownerGated": false, "mode": "single-agent" | "moa", "skill": "<skillname>", "tier":
  "<fable-5|opus-4.8|sonnet-5|haiku-4.5>", "prompt": "<nexus-wrapped prompt>" }` — not
  owner-gated. Keep this full decision object — Cycle Step 4 consumes it directly and
  must not re-run the CLI or re-derive routing itself.

The CLI internally applies the same check as `lib/linear-loop/owner-gated.ts`'s
`isOwnerGated()` function — you do not need to apply the label/description checks by hand
any more; the CLI is the single source of truth for this decision.

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

### Cycle Step 4 — Dispatch implementation (via the decision CLI's output, main-targeted)

Using Cycle Step 2's parsed decision object (`mode`, `skill`, `tier`, `prompt`) — do not
re-derive routing, MOA fan-out, or tier selection here; the CLI already computed all of
that via `dispatchWorkItem`. `prompt` is already a complete Nexus-wrapped task body (see
`scripts/linear-loop-decide.ts`), so it is dispatched verbatim, not re-wrapped.

Branch setup happens first and is identical regardless of `mode`:

```bash
git fetch origin
git checkout main
git pull origin main
git checkout -b feat/ra-XXX-short-description
```

(If the branch already exists, append `-v2`, `-v3`, etc. — same rule as
`linear-task-processor.md`.)

**Validate step is unchanged**: `pnpm type-check` then `pnpm lint`, zero tolerance, same
3-attempt/2-attempt fix-and-retry rule as `linear-task-processor.md` Step 6 — this
expectation is already embedded in `prompt`.

**If `mode` is `"single-agent"`:** dispatch a fresh `Agent` call (general-purpose or a
code-capable agent type) with `prompt` as the task body verbatim, at model tier `tier`.
This is the same single-dispatch shape this procedure always used — only the
routing/tier decision has moved into the CLI.

**If `mode` is `"moa"`:** invoke the `boardroom` skill (multi-model triangulation for
high-stakes decisions) with `prompt` as the base task for the synthesis/arbiter role, run
at model tier `tier`. Boardroom fans out its own panellists per its own configuration and
produces one synthesized answer; treat that synthesized answer the same way a
single-agent dispatch's report would be treated when carrying results into Cycle Step 5.

In both branches, `prompt` already embeds the hard constraints this procedure has always
required of dispatched work:

- Do not open a PR yourself — the calling procedure (Cycle Step 6) does that.
- Do not merge anything.
- If you hit an owner-gated action (`.claude/RULES.md` rules 29-33) or discover the issue
  is broader/more ambiguous than a single scoped PR should be, stop and report that
  instead of proceeding.
- Commit with specific files only (never `git add -A`), following
  `linear-task-processor.md` Step 7's commit message format.

Report back: the branch name, the list of files changed, and confirmation that
`pnpm type-check` and `pnpm lint` both passed.

If the dispatched agent (or boardroom's synthesized result) reports an owner-gated
blocker or unresolvable ambiguity instead of completing implementation: treat this the
same as Cycle Step 2's owner-gated path —
comment on the issue, leave its state alone, increment the stop-guard tracker's
owner-gated trip, and return `{ outcome: "stop-guard-tripped", guard: "owner-gated",
detail: "<issue identifier>: <reported blocker>" }`.

### Cycle Step 5 — Confirm verification

The dispatched work (Cycle Step 4 — either the single-agent dispatch or boardroom's
synthesized result) already ran `pnpm type-check && pnpm lint` to zero tolerance as part
of its own Validate step. Before opening a PR, independently confirm by re-running both
commands yourself against the resulting branch:

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

## Loop wiring (how /loop drives this procedure)

This agent procedure runs **one cycle**. Repetition, pacing, and the between-cycle wait are
the `/loop` skill's job — it self-paces using `ScheduleWakeup` internally (a Claude Code
Skill-tool mechanism, not something this procedure calls directly).

### Starting the loop

A human starts the loop by invoking, in a RestoreAssist session:

```
/loop Run the continuous-linear-loop agent procedure for one cycle
(.claude/agents/continuous-linear-loop.md). Daily budget ceiling: $<N> USD
— construct the StopGuardTracker (lib/linear-loop/stop-guards.ts) with
{ dailyBudgetCeilingUsd: <N> } on the first cycle only; on every subsequent
cycle, restore it via StopGuardTracker.fromState() using the state JSON
carried over from the previous cycle's report. After each cycle: if the
outcome is "stop-guard-tripped" or "no-issues", stop the loop and report
why. Otherwise carry the tracker's toState() JSON forward and continue.
Concurrency is 1 — never start a new cycle before the previous one's
outcome is known.
```

`<N>` is supplied by the human at invocation time — there is no default ceiling value
baked into this procedure or into `StopGuardTracker` (spec §3 stop guards, spec §8: "Daily
token/cost budget ceiling value is unset — must be specified at loop-invocation time, not
hardcoded here"). If the human omits `<N>`, ask for it before starting — do not assume a
number.

### Per-cycle continuation

Between cycles, `/loop`'s self-paced wakeup re-invokes the same instruction with the prior
cycle's carried-forward `StopGuardTracker` state substituted in. Each cycle:

1. Restore (or construct, on cycle 1) the `StopGuardTracker`.
2. Run Cycle Steps 1–7 (this file's "Per-cycle procedure" section) exactly once.
3. Based on the returned outcome:
   - `"pr-opened"`: call `tracker.recordActionableCycle()`, report the PR URL (open,
     awaiting human review — a human always merges), continue the loop.
   - `"skipped"` with `reason: "owner-gated"`: this path already returned
     `"stop-guard-tripped"` at Cycle Step 2/4 per this file's own procedure — a plain
     `"skipped"`/`"owner-gated"` combination should not occur; if it does, treat it as
     `"stop-guard-tripped"` defensively and stop.
   - `"skipped"` with `reason: "unactionable"`: call `tracker.recordUnactionableSkip()`; if
     `tripped: true`, stop the loop and report. Otherwise continue.
   - `"no-issues"`: stop the loop and report "board is clear" — do not treat this as a
     stop-guard trip (it isn't one), just a natural end.
   - `"stop-guard-tripped"`: stop the loop immediately, surface a notification with
     `tracker.getTripReason()` (or the `detail` field from the outcome) to the human. Do not
     start another cycle.
4. Concurrency is always 1: the next cycle's Cycle Step 1 only runs after the current
   cycle's outcome (and any tracker update) is fully resolved — never dispatch Cycle Step 4
   for a second issue while a first issue's cycle is still in flight.

### Session-bound property

`/loop`'s pacing lives entirely inside the invoking session. When the session ends, the
loop ends with it — there is no cron, no re-spawn, no persisted schedule outside this
session (`AGENTS.md` rule 19; `.claude/RULES.md` "Multi-agent orchestration" stop-guard
addendum). This is the property that distinguishes this design from the paused Shipit
continuous-execution cron (commit `8f739e53`).

This procedure never merges a PR, never re-runs itself for a second issue, and never
treats a green `pnpm type-check && pnpm lint` as authorization to merge — Rule 18
(AGENTS.md) requires a human to open and merge PRs into `main` deliberately; this
procedure only gets as far as **opening** the PR and marking the issue In Review.
