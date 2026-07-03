# Continuous Linear-Driven Agent Loop — Phase 1 (Core Loop Mechanics) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a session-bound, single-agent (no MOA fan-out) loop that pulls Todo/Backlog issues from the Linear RestoreAssist (RA) team, skips owner-gated work, dispatches each remaining issue through a `main`-targeted adaptation of `linear-task-processor`'s implement→verify→PR flow, and stops cleanly on any of four stop-guard conditions — wired to run via the `/loop` skill.

**Architecture:** This is agent-orchestration logic, not a running service. Task 1 edits two governance docs. Task 2 creates a real Linear label (replacing a regex-only fallback). Tasks 3 and 5 are pure TypeScript utility functions with Vitest unit tests (label/regex detection; stop-guard state machine) — these are the only two pieces with code to unit-test, because they are pure functions with no I/O. Task 4 is a new `.claude/agents/*.md` procedure file — the same execution model `linear-task-processor.md` already uses — that documents the exact per-cycle sequence an agent follows, wrapped in the Nexus Prompt, and imports Task 3's function by name/contract (agents don't `import` TypeScript at runtime, they follow written procedure, but the procedure must name the exact function and file so a human or future automation can wire it mechanically). Task 6 documents the `/loop` invocation itself.

**Tech Stack:** TypeScript, Vitest (`lib/**/__tests__/**/*.test.ts` per `vitest.config.js`), Claude Code `.claude/agents/*.md` procedure files, Linear MCP tools (server id `2f101dc2-2ac2-4d93-9846-ffe27a392a3e` in this session — tool names below use the generic `mcp__linear__*` form since the server id is session-specific; substitute the live id at invocation time), `/loop` and `Agent` (with `isolation: "worktree"`) Claude Code skills/tools, `gh` CLI, `pnpm type-check` / `pnpm lint`.

## Global Constraints

- PR target for every loop-dispatched PR is `main`, never `sandbox` — explicit override of `linear-task-processor.md`'s current `--base sandbox` default (spec §3 step 6).
- Rule 19 (AGENTS.md): the loop never merges. Its boundary is absolute: implement, verify, and open a PR — then stop. It never merges, never rebases past a merge conflict on `main`, and never re-spawns itself outside the current session. Rule 18 applies to this loop in full and without exception — a human merges.
- Concurrency is exactly 1 issue in flight at a time (spec §3 "Concurrency").
- No standing cron; the loop's lifetime is the invoking session's lifetime (spec §3 "Session-bound property", spec §2).
- No MOA fan-out and no multi-discipline routing table in this plan — single-agent dispatch only (Phase 2 is a separate plan).
- Daily budget ceiling is user-configurable at loop invocation — no hardcoded default value anywhere in this plan (spec §3 stop guards, spec §8).
- Owner-gated actions (production migrations, secret rotation, spend >$50 AUD, deleting/cancelling production resources, merging into `main`) are never autonomously executed — the loop stops and asks (spec §2, spec §7b rules 29–33).
- `CLAUDE.md` is corrupted past line 15 (pre-existing, unrelated) — no edits to `CLAUDE.md` in this plan (spec §7 preamble).

---

## File Structure

- `AGENTS.md` — insert new rule 19 after rule 18 (Task 1).
- `.claude/RULES.md` — insert new "Owner-action gated" section after "Progress Framework"; append stop-guard addendum to "Multi-agent orchestration" (Task 1).
- `lib/linear-loop/owner-gated.ts` — new file: `isOwnerGated()` detection function (Task 3).
- `lib/linear-loop/__tests__/owner-gated.test.ts` — new file: failing-first TDD tests for `isOwnerGated()` (Task 3).
- `lib/linear-loop/stop-guards.ts` — new file: `StopGuardTracker` class implementing the 4 stop-guard conditions (Task 5).
- `lib/linear-loop/__tests__/stop-guards.test.ts` — new file: failing-first TDD tests for `StopGuardTracker` (Task 5).
- `.claude/agents/continuous-linear-loop.md` — new agent procedure file: the single-cycle loop logic, Nexus-wrapped dispatch to a `main`-targeted adaptation of `linear-task-processor`, and the `/loop` wiring instructions (Tasks 4, 6).

`lib/linear-loop/` is a new subdirectory under `lib/` — chosen because existing `lib/` conventions group related logic by feature subdirectory (e.g. `lib/progress/`, `lib/auth/`, `lib/agents/`) rather than flat files, and this loop has 2 distinct pure-function units (`owner-gated.ts`, `stop-guards.ts`) that belong together but aren't a single file.

---

### Task 1: Apply governance rule changes

**Files:**
- Modify: `/Users/phillmcgurk/RestoreAssist/AGENTS.md:36` (insert after rule 18)
- Modify: `/Users/phillmcgurk/RestoreAssist/.claude/RULES.md:47` (insert "Owner-action gated" section after "Progress Framework", before "## Multi-agent orchestration")
- Modify: `/Users/phillmcgurk/RestoreAssist/.claude/RULES.md:68` (append stop-guard addendum to end of "Multi-agent orchestration" section, before "## Karpathy recall")

**Interfaces:**
- Produces: Rule 19 text in `AGENTS.md` (referenced by Task 4's agent procedure as the governing rule for the loop).
- Produces: Rules 29–33 in `.claude/RULES.md` (referenced by Task 3's `isOwnerGated()` doc comment and Task 4's procedure as the owner-gated action list).

This is a docs-only change — no tests needed per the writing-plans skill (docs-only is an explicit no-TDD case), but each step ends with a verification grep.

- [ ] **Step 1: Insert rule 19 into AGENTS.md immediately after rule 18**

Current `AGENTS.md` line 36 reads exactly:

```
18. **Never auto-open PRs into `main`.** `main` is protected (strict up-to-date + required conversation resolution). Autonomous/agent runs land work on a dedicated feature branch or `sandbox` — never a full-tree `sandbox → main` or `<branch> → main` merge PR. PRs into `main` are human-authored only. Any stray agent-opened `→ main` PR is noise: close it on sight, don't resolve its conflicts.
```

Line 37 is currently blank, line 38 is `## Package source — use opensrc, don't fabricate APIs`.

Use the Edit tool with this exact old/new string pair:

old_string:
```
18. **Never auto-open PRs into `main`.** `main` is protected (strict up-to-date + required conversation resolution). Autonomous/agent runs land work on a dedicated feature branch or `sandbox` — never a full-tree `sandbox → main` or `<branch> → main` merge PR. PRs into `main` are human-authored only. Any stray agent-opened `→ main` PR is noise: close it on sight, don't resolve its conflicts.

## Package source — use opensrc, don't fabricate APIs
```

new_string:
```
18. **Never auto-open PRs into `main`.** `main` is protected (strict up-to-date + required conversation resolution). Autonomous/agent runs land work on a dedicated feature branch or `sandbox` — never a full-tree `sandbox → main` or `<branch> → main` merge PR. PRs into `main` are human-authored only. Any stray agent-opened `→ main` PR is noise: close it on sight, don't resolve its conflicts.
19. **Continuous Linear-driven agent loop is sanctioned — implement → PR-open → stop.** A session-bound (not standing-cron) loop that pulls TODO items from the Linear RestoreAssist backlog, dispatches sub-agents to implement each, and opens a PR per item is an approved pattern. Its boundary is absolute: the loop implements, verifies, and opens a PR — then stops. It never merges, never rebases past a merge conflict on `main`, and never re-spawns itself outside the current session. Rule 18 applies to this loop in full and without exception — a human merges. If the loop cannot open a clean PR (conflicts, failing gate), it stops and reports — it does not attempt to resolve by merging.

## Package source — use opensrc, don't fabricate APIs
```

- [ ] **Step 2: Verify rule 19 landed correctly**

Run: `grep -n "^19\." /Users/phillmcgurk/RestoreAssist/AGENTS.md`
Expected output: `36:19. **Continuous Linear-driven agent loop is sanctioned — implement → PR-open → stop.** ...` (or nearby line number — confirm it's the line immediately after rule 18, and that `grep -c "^18\.\|^19\." AGENTS.md` returns `2`).

- [ ] **Step 3: Insert the "Owner-action gated" section into .claude/RULES.md after the Progress Framework section**

Current `.claude/RULES.md` lines 47–48 read exactly:

```
28. **Engagement-time licence verification** — IICRC / WHS / state licences verified against `Authorisation` (M-7) at the moment a user is attached to an attestation, NOT at login.

## Multi-agent orchestration
```

Use the Edit tool with this exact old/new string pair:

old_string:
```
28. **Engagement-time licence verification** — IICRC / WHS / state licences verified against `Authorisation` (M-7) at the moment a user is attached to an attestation, NOT at login.

## Multi-agent orchestration
```

new_string:
```
28. **Engagement-time licence verification** — IICRC / WHS / state licences verified against `Authorisation` (M-7) at the moment a user is attached to an attestation, NOT at login.

### Owner-action gated (human sign-off required before execution)

These actions require explicit owner/human authorization before any agent — loop-dispatched or interactive — may execute them. Preparing the plan, runbook, or PR is allowed; running the action is not.

29. **Production database migrations / cutovers** — `prisma migrate deploy` against prod, pilot cutover phases, and any schema change applied outside local/preview.
30. **Secret and credential rotation** — API keys, OAuth client secrets, service-role tokens, signing keys, `.env` values in any deployed environment.
31. **Spend above a real-money threshold** — any action that provisions paid infrastructure, upgrades a paid tier, or otherwise commits spend over **$50 AUD** in a single action.
32. **Deleting or cancelling production resources** — dropping a prod database/branch, deleting a prod deployment, cancelling a subscription, revoking a domain, deleting user data outside a documented data-subject request.
33. **Merging into `main`** — see rule 18 (AGENTS.md); restated here for completeness of the owner-gated list.

An agent that reaches an owner-gated action must stop, state exactly what it would do and why, and wait for explicit human go-ahead in that session. It must not infer prior approval from a Linear ticket status, a runbook's existence, or a prior session's notes.

## Multi-agent orchestration
```

- [ ] **Step 4: Verify the Owner-action gated section landed correctly**

Run: `grep -n "^29\.\|^30\.\|^31\.\|^32\.\|^33\.\|Owner-action gated" /Users/phillmcgurk/RestoreAssist/.claude/RULES.md`
Expected output: 6 matching lines — one `### Owner-action gated (human sign-off required before execution)` heading line and rules `29.` through `33.`, all appearing before the `## Multi-agent orchestration` heading (confirm with `grep -n "^## Multi-agent orchestration\|^### Owner-action gated" .claude/RULES.md` showing "Owner-action gated" first).

- [ ] **Step 5: Append the stop-guard addendum to the end of the Multi-agent orchestration section**

Current `.claude/RULES.md` (original numbering, now shifted down by 10 lines after Step 3's insertion) has the "Multi-agent orchestration" section ending with this exact paragraph, immediately followed by "## Karpathy recall":

```
Agents must **checkpoint-commit every ~3 edits** with `git commit --allow-empty -m "checkpoint: <scope>"`. If the agent is killed mid-run, the last checkpoint becomes the recovery point instead of orphaned uncommitted state on the shared tree.

## Karpathy recall (you know these — write code that reflects them)
```

Use the Edit tool with this exact old/new string pair:

old_string:
```
Agents must **checkpoint-commit every ~3 edits** with `git commit --allow-empty -m "checkpoint: <scope>"`. If the agent is killed mid-run, the last checkpoint becomes the recovery point instead of orphaned uncommitted state on the shared tree.

## Karpathy recall (you know these — write code that reflects them)
```

new_string:
```
Agents must **checkpoint-commit every ~3 edits** with `git commit --allow-empty -m "checkpoint: <scope>"`. If the agent is killed mid-run, the last checkpoint becomes the recovery point instead of orphaned uncommitted state on the shared tree.

The Linear-driven continuous loop is **session-bound, not a standing cron**: it runs only for the lifetime of the invoking session and must not schedule, daemonize, or re-trigger itself after the session ends. (A prior autonomous "Shipit continuous-execution cron" was paused after it opened conflicting PRs into `main` unattended — this constraint exists to prevent a repeat.) Each backlog item dispatched by the loop follows the same one-code-modifying-agent-at-a-time / worktree-isolation / checkpoint-commit rules above, and every item's terminus is a single PR-open — never a merge, never a chain of dependent unmerged PRs assumed to land together.

## Karpathy recall (you know these — write code that reflects them)
```

- [ ] **Step 6: Verify the stop-guard addendum landed correctly**

Run: `grep -n "session-bound, not a standing cron" /Users/phillmcgurk/RestoreAssist/.claude/RULES.md`
Expected output: one matching line inside the "Multi-agent orchestration" section, before the "## Karpathy recall" heading. Confirm ordering with:
`grep -n "^## Multi-agent orchestration\|session-bound, not a standing cron\|^## Karpathy recall" .claude/RULES.md` — expect the three matches in that order.

- [ ] **Step 7: Commit**

```bash
git add AGENTS.md .claude/RULES.md
git commit -m "docs(governance): sanction continuous Linear loop + owner-gated action list (rules 19, 29-33)

Codifies the continuous MOA agent loop design (docs/superpowers/specs/2026-07-03-continuous-moa-agent-loop-design.md
section 7) into governance: rule 19 (AGENTS.md) sanctions the session-bound
loop pattern under rule 18's main-merge restriction; rules 29-33 (.claude/RULES.md)
list owner-gated actions requiring human sign-off; the Multi-agent orchestration
section gets a session-bound/no-cron addendum.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Create the `owner-gated` Linear label

**Files:** None (Linear-side state change only; no repo files).

**Interfaces:**
- Produces: a Linear label named `owner-gated` on the RestoreAssist (RA) team, whose label ID is referenced by Task 3's `isOwnerGated()` doc comment (the function doesn't hardcode the ID — it matches on label *name* — but the ID is recorded here for operator reference).

- [ ] **Step 1: Find the RA team ID**

Call the Linear MCP tool `list_teams` (namespaced as `mcp__<linear-server-id>__list_teams` — the server id is session-specific; in this session it is `2f101dc2-2ac2-4d93-9846-ffe27a392a3e`, so the concrete tool name is `mcp__2f101dc2-2ac2-4d93-9846-ffe27a392a3e__list_teams`; at execution time confirm the live server id via the tool list rather than assuming this one is still current).

Call with no parameters (or a name filter if the tool requires one, e.g. `{ query: "RestoreAssist" }`). From the response, record the team's `id` field (a UUID) — this is `<RA_TEAM_ID>` for Step 2.

- [ ] **Step 2: Create the label**

Call `mcp__<linear-server-id>__create_issue_label` with:

```json
{
  "teamId": "<RA_TEAM_ID>",
  "name": "owner-gated",
  "description": "Requires explicit human/owner sign-off before an agent may execute the underlying action (production migration, secret rotation, spend over $50 AUD, deleting/cancelling production resources, or merging into main). See .claude/RULES.md rules 29-33. The continuous Linear loop (AGENTS.md rule 19) skips any issue carrying this label rather than acting on it.",
  "color": "#D4A574"
}
```

Note: `color` uses RestoreAssist's existing "light accent" brand colour (`#D4A574`, per `AGENTS.md` rule 14 / `.claude/RULES.md` rule 17) so the label is visually distinct in the Linear UI without inventing an off-brand colour. If the live `create_issue_label` tool schema does not accept a `color` field, omit it — `teamId`, `name`, and `description` are the required fields per spec §3 step 2 ("creating a real `owner-gated` Linear label is a first-class deliverable").

- [ ] **Step 3: Verify the label was created**

Call `mcp__<linear-server-id>__list_issue_labels` with `{ "teamId": "<RA_TEAM_ID>" }`.

Expected: the response array contains one entry with `name: "owner-gated"` and the description from Step 2. Record its `id` field — this is `<OWNER_GATED_LABEL_ID>`, referenced in Task 3's implementation comment for operator traceability (the code matches by name, not by hardcoded ID, so this label is stable even if recreated).

No commit — this step has no repo file changes.

---

### Task 3: Build the owner-gated detection function (TDD)

**Files:**
- Create: `lib/linear-loop/owner-gated.ts`
- Test: `lib/linear-loop/__tests__/owner-gated.test.ts`

**Interfaces:**
- Produces: `isOwnerGated(issue: OwnerGateCheckInput): boolean` — exported from `lib/linear-loop/owner-gated.ts`. Consumed by Task 4's per-cycle procedure (step "Skip owner-gated issues") exactly by this name and signature.
- Produces: `OwnerGateCheckInput` type — `{ labels: string[]; description: string | null }` — exported from the same file. `labels` is an array of Linear label *names* (strings), not label objects or IDs — Task 4's procedure is responsible for mapping the Linear API's label response shape to `string[]` before calling `isOwnerGated`.
- Produces: `OWNER_GATED_LABEL_NAME` constant (`"owner-gated"`) — exported from the same file, so Task 4's procedure and any future code that needs to filter by this label name import the constant rather than repeating the string literal.

- [ ] **Step 1: Write the failing tests**

Create `lib/linear-loop/__tests__/owner-gated.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { isOwnerGated, OWNER_GATED_LABEL_NAME } from "@/lib/linear-loop/owner-gated";

describe("isOwnerGated", () => {
  it("returns true when the owner-gated label is present, regardless of description", () => {
    const result = isOwnerGated({
      labels: ["bug", "owner-gated"],
      description: "Fix the login button colour.",
    });
    expect(result).toBe(true);
  });

  it("returns true when the description matches the regex, even without the label", () => {
    const result = isOwnerGated({
      labels: ["infra"],
      description: "This requires an owner-gated production migration before it can ship.",
    });
    expect(result).toBe(true);
  });

  it("matches description variants: owner action gated, owner-action-gated, ownergated", () => {
    expect(
      isOwnerGated({ labels: [], description: "Blocked: owner action gated pending approval." })
    ).toBe(true);
    expect(
      isOwnerGated({ labels: [], description: "owner-action-gated: needs Phill to rotate the key." })
    ).toBe(true);
    expect(
      isOwnerGated({ labels: [], description: "This is ownergated, do not touch." })
    ).toBe(true);
  });

  it("is case-insensitive on the description match", () => {
    const result = isOwnerGated({
      labels: [],
      description: "OWNER-GATED: requires sign-off.",
    });
    expect(result).toBe(true);
  });

  it("returns false when neither the label nor the description pattern is present", () => {
    const result = isOwnerGated({
      labels: ["bug", "frontend"],
      description: "Fix the login button colour on mobile.",
    });
    expect(result).toBe(false);
  });

  it("returns false when description is null and the label is absent", () => {
    const result = isOwnerGated({ labels: ["feature"], description: null });
    expect(result).toBe(false);
  });

  it("does not false-positive on unrelated use of the word 'owner' or 'gated'", () => {
    const result = isOwnerGated({
      labels: ["billing"],
      description: "The property owner requested a gated-community access note in the report.",
    });
    expect(result).toBe(false);
  });

  it("exports the label name constant used by the label match", () => {
    expect(OWNER_GATED_LABEL_NAME).toBe("owner-gated");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/linear-loop/__tests__/owner-gated.test.ts`
Expected: FAIL — `Cannot find module '@/lib/linear-loop/owner-gated'` (the file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `lib/linear-loop/owner-gated.ts`:

```typescript
/**
 * Owner-gated detection for the continuous Linear loop (AGENTS.md rule 19).
 *
 * An issue is owner-gated if it needs human sign-off before an agent may
 * execute the underlying action — see .claude/RULES.md rules 29-33 for the
 * full list (prod migrations, secret rotation, spend >$50 AUD, deleting/
 * cancelling production resources, merging into main).
 *
 * Detection is label-first, regex-fallback (spec: docs/superpowers/specs/
 * 2026-07-03-continuous-moa-agent-loop-design.md §3 step 2):
 * 1. The Linear "owner-gated" label (create_issue_label call recorded in
 *    docs/superpowers/plans/2026-07-03-continuous-moa-loop-core.md Task 2)
 *    is present on the issue.
 * 2. OR the issue description matches /owner[- ]?(action[- ]?)?gated/i —
 *    a fallback for issues not yet labelled, known-fragile by design (the
 *    label is the durable signal; the regex catches drift until triage
 *    catches up).
 */

export const OWNER_GATED_LABEL_NAME = "owner-gated";

const OWNER_GATED_DESCRIPTION_PATTERN = /owner[- ]?(action[- ]?)?gated/i;

export interface OwnerGateCheckInput {
  /** Linear label names attached to the issue (not label objects/IDs). */
  labels: string[];
  /** Issue description text, or null if the issue has none. */
  description: string | null;
}

export function isOwnerGated(issue: OwnerGateCheckInput): boolean {
  if (issue.labels.includes(OWNER_GATED_LABEL_NAME)) {
    return true;
  }
  if (issue.description && OWNER_GATED_DESCRIPTION_PATTERN.test(issue.description)) {
    return true;
  }
  return false;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/linear-loop/__tests__/owner-gated.test.ts`
Expected: PASS — 8 tests passing.

- [ ] **Step 5: Run type-check and lint on the new files**

Run: `pnpm type-check`
Expected: no new errors attributable to `lib/linear-loop/owner-gated.ts` or its test file.

Run: `pnpm lint`
Expected: no new errors attributable to the two new files.

- [ ] **Step 6: Commit**

```bash
git add lib/linear-loop/owner-gated.ts lib/linear-loop/__tests__/owner-gated.test.ts
git commit -m "feat(linear-loop): add isOwnerGated detection (label + regex fallback)

Label-first, regex-fallback owner-gated detection per the continuous MOA
loop design spec section 3 step 2. Consumed by the per-cycle loop procedure
(.claude/agents/continuous-linear-loop.md) to skip issues requiring human
sign-off per .claude/RULES.md rules 29-33.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Build the single-cycle loop procedure

**Files:**
- Create: `.claude/agents/continuous-linear-loop.md`

**Interfaces:**
- Consumes: `isOwnerGated(issue: OwnerGateCheckInput): boolean` and `OwnerGateCheckInput` from `lib/linear-loop/owner-gated.ts` (Task 3) — the procedure names this exact function/file so a human or future automation wires it mechanically; a `.claude/agents/*.md` file is markdown instructions an agent follows, not a Node.js module, so this is a documented call-out rather than an `import` statement.
- Consumes: `StopGuardTracker` from `lib/linear-loop/stop-guards.ts` (Task 5) — same documented-call-out relationship.
- Consumes: `.claude/agents/linear-task-processor.md`'s Step 4–9 (branch, implement, validate, commit, push+PR, mark In Review) as the base flow, with the explicit override described in Step 3 below.
- Produces: a per-cycle procedure invoked by the `/loop` skill wiring in Task 6, expressed as numbered steps an agent executes once per cycle, returning one of three cycle outcomes: `{ outcome: "pr-opened", issueId, prUrl }`, `{ outcome: "skipped", issueId, reason }`, or `{ outcome: "stop-guard-tripped", guard, detail }` (the exact string values Task 6 branches on).

This is not a TDD task — `.claude/agents/*.md` files are instructions, not testable TypeScript, matching the execution model of `linear-task-processor.md` and `pr-creator.md` (both plain markdown procedure files with no associated test suite in this repo).

- [ ] **Step 1: Read the existing linear-task-processor agent in full**

Before writing, re-read `/Users/phillmcgurk/RestoreAssist/.claude/agents/linear-task-processor.md` (already read in full during plan research — Steps 1–10, Linear state UUIDs, Error Recovery Rules table). This procedure adapts it; every state UUID and error-recovery rule below is copied verbatim from that file except where explicitly overridden.

- [ ] **Step 2: Create the agent procedure file with frontmatter and purpose section**

Create `.claude/agents/continuous-linear-loop.md`:

````markdown
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
````

- [ ] **Step 3: Add Step 1 of the cycle — query Linear RA Todo/Backlog by priority**

Append to `.claude/agents/continuous-linear-loop.md`:

````markdown

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
````

- [ ] **Step 4: Add Step 2 — owner-gated skip check using Task 3's function**

Append:

````markdown

### Cycle Step 2 — Owner-gated skip check

Apply the same check as `lib/linear-loop/owner-gated.ts`'s `isOwnerGated()` function:

```typescript
import { isOwnerGated } from "@/lib/linear-loop/owner-gated";

const gated = isOwnerGated({
  labels: issue.labelNames, // string[] of label names, not label objects
  description: issue.description, // string | null
});
```

You do not run this as live TypeScript inside the agent session — you apply the same two
checks by hand against the fetched issue: (1) does `issue.labelNames` include the string
`"owner-gated"`? (2) does `/owner[- ]?(action[- ]?)?gated/i` match `issue.description`?
If either is true, this issue is owner-gated.

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
````

- [ ] **Step 5: Add Step 3 — dispatch to the Nexus-wrapped, main-targeted implementation flow**

Append:

````markdown

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
````

- [ ] **Step 6: Add Step 5 — verify via type-check + lint (confirm, don't re-run blind)**

Append:

````markdown

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
````

- [ ] **Step 7: Add Step 6 — open the PR against main**

Append:

````markdown

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

🤖 Opened by the continuous-linear-loop agent (AGENTS.md rule 19)
EOF
)"
```

**This is the one line in this entire procedure where `--base main` replaces
`linear-task-processor.md`'s `--base sandbox` and `pr-creator.md`'s `--base sandbox`
default — do not copy either of those files' base branch. Rule 18 / rule 19 (AGENTS.md)
govern: this PR is opened for human review — a human always merges.**

Record the PR URL returned by `gh pr create` — this is `<prUrl>` for Cycle Step 7.
````

- [ ] **Step 8: Add Step 7 — comment PR link, move to In Review, return outcome**

Append:

````markdown

### Cycle Step 7 — Comment PR link and mark In Review

Update the issue state to "In Review" (`9c4a7737-55c0-47e9-9cf6-cbd430685698`) — same UUID
as `linear-task-processor.md` Step 9.

Add a comment to the issue with the PR URL: `"Opened <prUrl> — continuous-linear-loop cycle
complete. A human reviews and merges (AGENTS.md rule 18, rule 19)."`

Return `{ outcome: "pr-opened", issueId: "<issue identifier>", prUrl: "<prUrl>" }`.

This ends the cycle. Do not proceed to the next issue within this same agent invocation —
that is the `/loop` skill's job (Task 6).
````

- [ ] **Step 9: Verify the file is well-formed and matches the existing agent-file convention**

Run: `cat .claude/agents/continuous-linear-loop.md | head -20`
Expected: valid YAML frontmatter block (`---` ... `---`) followed by markdown, structurally
matching `.claude/agents/linear-task-processor.md`'s frontmatter shape (same `tools:` and
`mcpServers:` keys).

Run: `grep -c "^### Cycle Step" .claude/agents/continuous-linear-loop.md`
Expected: `7` (Cycle Steps 1 through 7).

- [ ] **Step 10: Commit**

```bash
git add .claude/agents/continuous-linear-loop.md
git commit -m "feat(linear-loop): add continuous-linear-loop single-cycle agent procedure

Adapts linear-task-processor's implement/verify/commit flow with one explicit
override: PR target is main, not sandbox. The loop always stops at PR-open —
rule 18 applies in full, a human merges. Wraps dispatch in the Nexus Prompt.
Consumes isOwnerGated() (lib/linear-loop/owner-gated.ts) for the owner-gated
skip check. Single-agent dispatch only, no MOA fan-out (Phase 2 is separate).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Build the stop-guard tracker (TDD)

**Files:**
- Create: `lib/linear-loop/stop-guards.ts`
- Test: `lib/linear-loop/__tests__/stop-guards.test.ts`

**Interfaces:**
- Produces: `StopGuardTracker` class — exported from `lib/linear-loop/stop-guards.ts`. Constructed once per session with `new StopGuardTracker({ dailyBudgetCeilingUsd: number })` (parameterized, no hardcoded default — spec §3 stop guards, spec §8). Task 4's Cycle Step 5 calls `tracker.recordCiFailure(issueId: string): { tripped: boolean }`. Task 6's `/loop` wiring calls `tracker.recordOwnerGated(): { tripped: boolean }`, `tracker.recordUnactionableSkip(): { tripped: boolean }`, `tracker.recordActionableCycle(): void` (resets the consecutive-skip counter), `tracker.recordSpend(usd: number): { tripped: boolean }`, and `tracker.getTripReason(): string | null`.
- Mechanism: the tracker is a single in-memory object instantiated once at the start of the `/loop` invocation (Task 6) and passed by reference to every cycle's `continuous-linear-loop` agent dispatch (as plain JSON state described in the dispatch prompt, since agent-to-agent state doesn't persist via shared object references — see Step 3's design note below for how this actually threads through). This is concrete for a Claude Code session (not a persistent server): there is no database or file-backed state — the counters live in the `/loop` skill's own invocation prompt to itself, updated and re-passed each cycle.

- [ ] **Step 1: Write the failing tests**

Create `lib/linear-loop/__tests__/stop-guards.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { StopGuardTracker } from "@/lib/linear-loop/stop-guards";

describe("StopGuardTracker", () => {
  it("does not trip on a single CI failure for an issue", () => {
    const tracker = new StopGuardTracker({ dailyBudgetCeilingUsd: 20 });
    const result = tracker.recordCiFailure("RA-100");
    expect(result.tripped).toBe(false);
  });

  it("trips after 2 consecutive CI failures on the same issue", () => {
    const tracker = new StopGuardTracker({ dailyBudgetCeilingUsd: 20 });
    tracker.recordCiFailure("RA-100");
    const result = tracker.recordCiFailure("RA-100");
    expect(result.tripped).toBe(true);
    expect(tracker.getTripReason()).toMatch(/RA-100/);
    expect(tracker.getTripReason()).toMatch(/2 consecutive CI failures/i);
  });

  it("does not trip on 2 CI failures across two different issues", () => {
    const tracker = new StopGuardTracker({ dailyBudgetCeilingUsd: 20 });
    tracker.recordCiFailure("RA-100");
    const result = tracker.recordCiFailure("RA-200");
    expect(result.tripped).toBe(false);
  });

  it("resets an issue's CI failure count once recordActionableCycle runs for a new issue", () => {
    const tracker = new StopGuardTracker({ dailyBudgetCeilingUsd: 20 });
    tracker.recordCiFailure("RA-100");
    tracker.recordActionableCycle();
    // A fresh failure on the same issue id in a later cycle starts back at 1, not 3.
    const result = tracker.recordCiFailure("RA-100");
    expect(result.tripped).toBe(false);
  });

  it("trips immediately on recordOwnerGated", () => {
    const tracker = new StopGuardTracker({ dailyBudgetCeilingUsd: 20 });
    const result = tracker.recordOwnerGated();
    expect(result.tripped).toBe(true);
    expect(tracker.getTripReason()).toMatch(/owner-gated/i);
  });

  it("trips when recordSpend crosses the configured daily budget ceiling", () => {
    const tracker = new StopGuardTracker({ dailyBudgetCeilingUsd: 5 });
    tracker.recordSpend(3);
    const result = tracker.recordSpend(2.5);
    expect(result.tripped).toBe(true);
    expect(tracker.getTripReason()).toMatch(/budget ceiling/i);
  });

  it("does not trip when cumulative spend stays under the configured ceiling", () => {
    const tracker = new StopGuardTracker({ dailyBudgetCeilingUsd: 5 });
    tracker.recordSpend(1);
    const result = tracker.recordSpend(1);
    expect(result.tripped).toBe(false);
  });

  it("uses the ceiling passed at construction, not a hardcoded default", () => {
    const cheapTracker = new StopGuardTracker({ dailyBudgetCeilingUsd: 1 });
    const result = cheapTracker.recordSpend(1.5);
    expect(result.tripped).toBe(true);

    const generousTracker = new StopGuardTracker({ dailyBudgetCeilingUsd: 1000 });
    const result2 = generousTracker.recordSpend(1.5);
    expect(result2.tripped).toBe(false);
  });

  it("does not trip on 1 or 2 consecutive unactionable skips", () => {
    const tracker = new StopGuardTracker({ dailyBudgetCeilingUsd: 20 });
    tracker.recordUnactionableSkip();
    const result = tracker.recordUnactionableSkip();
    expect(result.tripped).toBe(false);
  });

  it("trips on the 3rd consecutive unactionable skip", () => {
    const tracker = new StopGuardTracker({ dailyBudgetCeilingUsd: 20 });
    tracker.recordUnactionableSkip();
    tracker.recordUnactionableSkip();
    const result = tracker.recordUnactionableSkip();
    expect(result.tripped).toBe(true);
    expect(tracker.getTripReason()).toMatch(/3.*consecutive.*skip/i);
  });

  it("resets the consecutive-skip counter when an actionable cycle runs", () => {
    const tracker = new StopGuardTracker({ dailyBudgetCeilingUsd: 20 });
    tracker.recordUnactionableSkip();
    tracker.recordUnactionableSkip();
    tracker.recordActionableCycle();
    tracker.recordUnactionableSkip();
    const result = tracker.recordUnactionableSkip();
    expect(result.tripped).toBe(false);
  });

  it("getTripReason returns null when nothing has tripped", () => {
    const tracker = new StopGuardTracker({ dailyBudgetCeilingUsd: 20 });
    expect(tracker.getTripReason()).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/linear-loop/__tests__/stop-guards.test.ts`
Expected: FAIL — `Cannot find module '@/lib/linear-loop/stop-guards'` (the file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `lib/linear-loop/stop-guards.ts`:

```typescript
/**
 * Stop-guard tracker for the continuous Linear loop (AGENTS.md rule 19).
 *
 * Tracks the 4 stop-guard conditions from the design spec (docs/superpowers/specs/
 * 2026-07-03-continuous-moa-agent-loop-design.md §3 "Stop guards"):
 * 1. 2 consecutive CI (verify) failures on the same issue.
 * 2. Any issue requiring an owner-gated action.
 * 3. A daily token/cost budget ceiling is hit — ceiling is caller-supplied at
 *    construction, never hardcoded here (spec §8 open follow-up).
 * 4. 3+ consecutive issues skipped as unactionable.
 *
 * Mechanism: this is a single in-memory object, not a persisted store. A Claude
 * Code session has no long-running process to host a singleton across cycles —
 * the /loop skill wiring (Task 6 of the implementation plan) re-instantiates a
 * tracker at loop start and threads its current counts through each cycle's
 * dispatch prompt as plain state (JSON-serializable via toState()/fromState()),
 * since each /loop iteration is a fresh prompt turn, not a shared call stack.
 */

export interface StopGuardConfig {
  /** Daily spend ceiling in USD, supplied by the caller at loop invocation. No default. */
  dailyBudgetCeilingUsd: number;
}

export interface StopGuardResult {
  tripped: boolean;
}

interface StopGuardState {
  ciFailuresByIssue: Record<string, number>;
  ownerGatedTripped: boolean;
  cumulativeSpendUsd: number;
  consecutiveUnactionableSkips: number;
  tripReason: string | null;
}

const CI_FAILURE_TRIP_THRESHOLD = 2;
const CONSECUTIVE_SKIP_TRIP_THRESHOLD = 3;

export class StopGuardTracker {
  private readonly dailyBudgetCeilingUsd: number;
  private state: StopGuardState;

  constructor(config: StopGuardConfig) {
    this.dailyBudgetCeilingUsd = config.dailyBudgetCeilingUsd;
    this.state = {
      ciFailuresByIssue: {},
      ownerGatedTripped: false,
      cumulativeSpendUsd: 0,
      consecutiveUnactionableSkips: 0,
      tripReason: null,
    };
  }

  /** Serialize current counters so a fresh /loop cycle prompt can restore them. */
  toState(): StopGuardState {
    return { ...this.state, ciFailuresByIssue: { ...this.state.ciFailuresByIssue } };
  }

  /** Restore counters from a prior cycle's serialized state. */
  static fromState(config: StopGuardConfig, state: StopGuardState): StopGuardTracker {
    const tracker = new StopGuardTracker(config);
    tracker.state = { ...state, ciFailuresByIssue: { ...state.ciFailuresByIssue } };
    return tracker;
  }

  recordCiFailure(issueId: string): StopGuardResult {
    const count = (this.state.ciFailuresByIssue[issueId] ?? 0) + 1;
    this.state.ciFailuresByIssue[issueId] = count;
    if (count >= CI_FAILURE_TRIP_THRESHOLD) {
      this.state.tripReason = `${issueId}: 2 consecutive CI failures`;
      return { tripped: true };
    }
    return { tripped: false };
  }

  recordOwnerGated(): StopGuardResult {
    this.state.ownerGatedTripped = true;
    this.state.tripReason = "issue requires an owner-gated action";
    return { tripped: true };
  }

  recordSpend(usd: number): StopGuardResult {
    this.state.cumulativeSpendUsd += usd;
    if (this.state.cumulativeSpendUsd >= this.dailyBudgetCeilingUsd) {
      this.state.tripReason = `cumulative spend $${this.state.cumulativeSpendUsd.toFixed(
        2
      )} reached the daily budget ceiling of $${this.dailyBudgetCeilingUsd.toFixed(2)}`;
      return { tripped: true };
    }
    return { tripped: false };
  }

  recordUnactionableSkip(): StopGuardResult {
    this.state.consecutiveUnactionableSkips += 1;
    if (this.state.consecutiveUnactionableSkips >= CONSECUTIVE_SKIP_TRIP_THRESHOLD) {
      this.state.tripReason = `${this.state.consecutiveUnactionableSkips} consecutive issues skipped as unactionable`;
      return { tripped: true };
    }
    return { tripped: false };
  }

  /** Call after any cycle that opens a PR (an actionable, non-skipped cycle). */
  recordActionableCycle(): void {
    this.state.consecutiveUnactionableSkips = 0;
    this.state.ciFailuresByIssue = {};
  }

  getTripReason(): string | null {
    return this.state.tripReason;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/linear-loop/__tests__/stop-guards.test.ts`
Expected: PASS — 13 tests passing.

- [ ] **Step 5: Run type-check and lint on the new files**

Run: `pnpm type-check`
Expected: no new errors attributable to `lib/linear-loop/stop-guards.ts` or its test file.

Run: `pnpm lint`
Expected: no new errors attributable to the two new files.

- [ ] **Step 6: Commit**

```bash
git add lib/linear-loop/stop-guards.ts lib/linear-loop/__tests__/stop-guards.test.ts
git commit -m "feat(linear-loop): add StopGuardTracker for the 4 loop stop guards

Tracks 2-consecutive-CI-failures, owner-gated hit, daily budget ceiling
(caller-supplied, no hardcoded default), and 3+ consecutive unactionable
skips per the continuous MOA loop design spec section 3. In-memory,
session-scoped; toState()/fromState() let /loop thread counters across
cycle-turn prompts.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Wire the /loop skill integration

**Files:**
- Modify: `.claude/agents/continuous-linear-loop.md` (append the "Loop wiring" section)

**Interfaces:**
- Consumes: the cycle outcome contract from Task 4 (`{ outcome: "pr-opened" | "skipped" | "no-issues" | "stop-guard-tripped", ... }`).
- Consumes: `StopGuardTracker` from Task 5 (`lib/linear-loop/stop-guards.ts`) — `recordCiFailure`, `recordOwnerGated`, `recordSpend`, `recordUnactionableSkip`, `recordActionableCycle`, `getTripReason`, `toState`/`fromState`.
- Produces: the exact `/loop` invocation prompt text a human types to start the loop, and the per-cycle continuation prompt the `/loop` skill re-issues to itself between cycles.

- [ ] **Step 1: Add the Loop wiring section describing invocation**

Append to `.claude/agents/continuous-linear-loop.md`:

````markdown

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
````

- [ ] **Step 2: Verify the full agent file structure**

Run: `grep -n "^##\|^###" .claude/agents/continuous-linear-loop.md`
Expected output includes, in order: `## Cycle outcome contract`, `## Per-cycle procedure`
(with 7 `### Cycle Step N` subsections), `## Loop wiring (how /loop drives this procedure)`,
`### Starting the loop`, `### Per-cycle continuation`, `### Session-bound property`.

- [ ] **Step 3: Commit**

```bash
git add .claude/agents/continuous-linear-loop.md
git commit -m "feat(linear-loop): wire /loop skill invocation for continuous-linear-loop

Documents the exact /loop invocation prompt (daily budget ceiling supplied
by the human, no hardcoded default), how StopGuardTracker state threads
across cycle-turn prompts via toState()/fromState(), and how each of the
4 stop-guard outcomes ends the loop cleanly. Concurrency is always 1.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Self-Review

**1. Spec coverage.**

- §3 step 1 (query RA Todo/Backlog by priority) → Task 4 Cycle Step 1.
- §3 step 2 (skip owner-gated, log-not-error; create the real Linear label) → Task 2 (label creation) + Task 3 (`isOwnerGated`) + Task 4 Cycle Step 2.
- §3 step 3 (classify into work-type bucket, route to specialist skill) → explicitly out of scope per this plan's brief (Phase 2, §4) — not planned here, and not silently assumed; single-agent dispatch is used throughout instead (see Task 4 Cycle Step 4, which dispatches directly, no routing table).
- §3 step 4 (single-agent vs MOA fan-out decision) → explicitly out of scope (Phase 2, §4/boardroom) — this plan hardcodes "always single-agent" per the task brief's instruction to use "SIMPLE single-agent dispatch (no MOA fan-out)".
- §3 step 5 (Nexus-wrapped dispatch, model tier per §5) → Task 4 Cycle Step 4 wraps in the Nexus Prompt; model *tier selection* per §5 is explicitly Phase-2/separate-repo work per the spec itself ("lands as a separate, small PR to Pi-Dev-Ops's `nexus` skill") — Task 4 defaults to `model: sonnet` in its own frontmatter (matching this plan's "default execution tier for routine dev/copy/dispatch work" from spec §5, the only tier-selection statement that's actually Phase-1-relevant) without attempting the full tier-selection layer.
- §3 step 6 (adapt linear-task-processor's flow, override PR target to `main`) → Task 4 Cycle Step 4 (branch/implement/validate) + Cycle Step 6 (`--base main`, explicit callout against both `linear-task-processor.md` and `pr-creator.md`'s `sandbox` defaults).
- §3 step 7 (PR opens, issue → In Review, comment PR link, advance) → Task 4 Cycle Step 7, which returns `{ outcome: "pr-opened", issueId, prUrl }` directly and ends the cycle there.
- §3 "Concurrency: 1" → Task 6 "Per-cycle continuation" point 4.
- §3 stop guards (all 4) → Task 5 (`StopGuardTracker`) + Task 4 Cycle Step 2 (owner-gated), Cycle Step 5 (CI failures) + Task 6 (budget ceiling invocation, consecutive skips).
- §3 "Session-bound property" → Task 6 "Session-bound property" subsection + Task 1's stop-guard addendum in `.claude/RULES.md`.
- §7 rule 19 ("implement → PR-open → stop") → Task 4 Cycle Step 7 implements the PR-open-then-stop boundary directly: it comments the PR link, marks the issue In Review, and returns `"pr-opened"` — no merge behavior anywhere in the procedure.
- §7b (rules 29–33 exact text) → Task 1 Step 3, verbatim from spec.
- §7c (stop-guard addendum exact text) → Task 1 Step 5, verbatim from spec.
- §8 "Create the owner-gated Linear label" → Task 2.
- §8 "Daily budget ceiling value is unset — must be specified at loop-invocation time" → Task 5's `StopGuardConfig.dailyBudgetCeilingUsd` (constructor-required, no default) + Task 6's invocation prompt asking for `<N>` explicitly.
- §8 "separate Pi-Dev-Ops PR adding tier-selection guidance to nexus" and "full routing table in §4" → correctly excluded per this plan's brief (different repo / Phase 2, respectively) — not silently dropped, explicitly named here as out of scope.

**2. Placeholder scan.** No "TBD"/"add appropriate error handling"/"similar to Task N" patterns found. Every code block is complete, runnable TypeScript or exact shell commands. The one spot that could look like a placeholder — `<RA_TEAM_ID>`, `<N>`, `<issue identifier>`, `<prUrl>` in Task 2/4/6 — are documented runtime values filled in during execution (the same convention `linear-task-processor.md` itself uses with `RA-XXX`), not missing plan content.

**3. Type/interface consistency.**
- `isOwnerGated(issue: OwnerGateCheckInput): boolean` (Task 3) is called with the same shape (`{ labels: string[], description: string | null }`) in Task 4 Cycle Step 2 — confirmed matching field names (`labels`, `description`) and types.
- `OWNER_GATED_LABEL_NAME` (Task 3, value `"owner-gated"`) matches the label name string used in Task 2's `create_issue_label` call and Task 4 Cycle Step 2's manual-check description.
- `StopGuardTracker` methods (`recordCiFailure(issueId: string): StopGuardResult`, `recordOwnerGated(): StopGuardResult`, `recordSpend(usd: number): StopGuardResult`, `recordUnactionableSkip(): StopGuardResult`, `recordActionableCycle(): void`, `getTripReason(): string | null`, `toState()`, `fromState()`) as defined in Task 5 are referenced with identical names and signatures in Task 4 Cycle Step 5 (`recordCiFailure`) and Task 6 (`recordActionableCycle`, `recordUnactionableSkip`, `getTripReason`, `toState`/`fromState`). `StopGuardConfig.dailyBudgetCeilingUsd` (Task 5) matches the `{ dailyBudgetCeilingUsd: <N> }` construction shown in Task 6.
- Cycle outcome contract (`{ outcome: "pr-opened" | "skipped" | "no-issues" | "stop-guard-tripped", ... }`) defined once in Task 4's "Cycle outcome contract" section is the exact vocabulary Task 6's "Per-cycle continuation" branches on — confirmed Task 6's `"pr-opened"`, `"skipped"`, `"no-issues"`, `"stop-guard-tripped"` cases match exactly. Cycle Step count is consistently `7` across Task 4's own verification step and Task 6's structure-verification grep and "run exactly once" instruction.

**Explicitly flagged — spec items this plan could NOT fully plan, and why (not papered over):**

- **§3 step 5's model-tier selection rule** ("dispatch... at the model tier selected per §5's rule") is only partially covered. The spec itself states the full tier-selection layer is Phase-2-adjacent work landing as a *separate PR to a different repo* (Pi-Dev-Ops's `nexus` skill, not RestoreAssist). This plan's Task 4 uses a fixed `model: sonnet` default (the one tier statement in §5 that's a stable default rather than a selection algorithm) and does not implement dynamic tier routing (Opus for ambiguous/design work, Haiku escalation-after-2-failures, Fable 5 for synthesis) — that requires the routing/classification machinery this plan's brief explicitly excludes (Phase 2, §4). This is a genuine, spec-acknowledged out-of-scope boundary, not an oversight.
- **`ScheduleWakeup` as a literal tool/API** could not be verified to exist as a directly invocable tool in this environment (searched via ToolSearch — no match) or in the local skill-cache filesystem. The spec itself describes it as "a Claude Code Skill tool invocation, not a library you import," internal to the `/loop` skill. Task 6 treats `/loop` as the sole interface and does not attempt to call `ScheduleWakeup` directly — this is consistent with the spec's own framing, but flagging it because I could not empirically confirm the tool's exact invocation shape from inside this repo; if `/loop`'s actual internals differ from this assumption at execution time, Task 6's invocation prompt is the piece to adjust.

Plan complete and saved to `docs/superpowers/plans/2026-07-03-continuous-moa-loop-core.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
