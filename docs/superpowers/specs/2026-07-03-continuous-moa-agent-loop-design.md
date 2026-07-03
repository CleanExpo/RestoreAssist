# Continuous MOA Agent Loop — Design

**Status:** Design, pending user approval before implementation.
**Owner:** Phill McGurk.
**Author:** Claude (Nexus), 2026-07-03.

## 1. Purpose

Keep RestoreAssist continuously improving — development, design, engineering, copywriting, and more — via a session-bound loop that pulls work from the Linear RestoreAssist backlog, dispatches it to the right specialist skill(s), uses a Mixture-of-Agents (MOA) pattern for high-stakes decisions, and stops at PR-open for every item. No standing cron; the loop runs only while a Claude Code session stays open.

This is a redesign of a pattern that was already tried once in this org: an autonomous "Shipit continuous-execution cron" was paused (see `AGENTS.md` rule 18, added in commit `8f739e53`) after it opened conflicting full-tree PRs into `main` and created review noise. This design exists specifically to get the value of continuous operation without repeating that failure — the PR-open boundary and session-bound scope are the two properties that make the difference.

## 2. Non-goals

- No standing cron / no re-spawning outside the invoking session.
- No autonomous merging into `main` — a human always merges (rule 18, unchanged).
- No autonomous execution of owner-gated actions (production migrations, secret rotation, spend over $50 AUD, deleting/cancelling production resources) — the loop stops and asks.
- Not a rewrite of `linear-task-processor`'s existing single-task capability — it wraps and redirects it, doesn't replace it.
- Silent self-editing of skill files is explicitly out — Phase 3 always lands as a PR for human review.

## 3. Phase 1 — Core loop mechanics

**Trigger:** the `/loop` skill self-paces cycles within a session, using `ScheduleWakeup` between checks. The loop's lifetime is the session's lifetime.

**Per-cycle sequence:**
1. Query the Linear RestoreAssist (RA) team's Todo/Backlog issues, highest priority first.
2. Skip (log, don't error) any issue matching an owner-gated signal. Today this is regex-only (`/owner[- ]?(action[- ]?)?gated/i` against title/description/comments) because no formal Linear label exists yet — **creating a real `owner-gated` Linear label is a first-class deliverable of this build**, not a follow-up, since the regex fallback is known-fragile.
3. Classify the issue into a work-type bucket (§4) and route to the matching specialist skill(s).
4. Decide single-agent vs MOA fan-out (§4 trigger criteria).
5. Dispatch implementation, wrapped in the Nexus Prompt (§5), at the model tier selected per §5's rule.
6. The dispatched agent adapts `linear-task-processor`'s existing single-task implementation flow (branch, implement, `pnpm type-check && pnpm lint`, commit) but with **one explicit override: PR target is `main`, not `sandbox`** (linear-task-processor's current default). Small, scoped PRs — the same pattern used for RA-6921 batches 1–3 today, not a full-tree merge.
7. PR opens. Issue moves to "In Review" in Linear, comment with the PR link. Loop stops for that item, advances to the next.

**Concurrency:** 1 issue in flight at a time. `linear-task-processor` has no cross-issue locking or worktree isolation today; running issues in parallel risks two agents touching overlapping files with no coordination layer, and PR review is human-paced downstream regardless — parallelism doesn't buy real throughput yet. Revisit only if PR-review throughput becomes the bottleneck with pre-verified non-overlapping issues (e.g. via the `Agent` tool's `isolation: "worktree"`).

**Stop guards** — any of these pauses the whole loop and surfaces a notification, rather than silently continuing:
- 2 consecutive CI failures on the same PR.
- An issue requires an owner-gated action.
- A daily token/cost budget ceiling is hit (ceiling value: user-configurable at loop start; no default assumed here — ask at invocation time).
- 3+ consecutive issues skipped as unactionable (signals the board is mostly blocked/owner-gated work; continuing to poll wastes cycles).

**Session-bound property (hard constraint):** the loop must not schedule, daemonize, or re-trigger itself after the session ends. This is the property that directly prevents a repeat of the Shipit-cron incident.

## 4. Phase 2 — Multi-discipline routing + Mixture of Agents

**Routing table (new — no existing mapping covers this).** `review-dimensions.md`'s Dimension Activation Matrix is post-hoc on changed file paths for a fixed 18-dimension set; this is pre-hoc on Linear issue content for an open-ended (~60, growing) skill fleet. Two-stage router:
1. Classify the issue's title + description + labels into a work-type bucket: bug, feature, design, copy, security, infra, video, marketing. Linear labels/team/project are a first-class signal alongside free text — cheaper and more reliable than pure NLP classification.
2. Route to matching specialist skill(s) via a table shaped like the activation matrix, e.g.:
   - `design | UI | visual` → `design-audit`, `design-intelligence`, `ui-component-builder`
   - `copy | content | landing page` → `marketing-copywriter`, `eeat`
   - `security | auth | vuln` → `security-audit`
   - `architecture | "which approach" | migration` → `spm` + `judge` + `boardroom`
   - (full table to be built out during implementation — this is the shape, not the complete enumeration)

**MOA fan-out (via the `boardroom` skill, Pi-Dev-Ops PR #485) fires when ANY of:**
- The decision is architecture-level, or picks between ≥2 viable approaches with materially different long-term cost.
- The action is hard-to-reverse (schema/migration, public API contract, security posture, production infra).
- A judge/go-no-go gate is in the loop.
- The work item is ambiguous — under-specified acceptance criteria, or `spm`/spec-writing flags open questions.
- The work is cross-cutting — spans 3+ routing buckets from the table above simultaneously.

Otherwise: single specialist skill, Nexus-wrapped, no fan-out. This matches `boardroom`'s own scoping ("not routine single-model tasks") and its hard 4-panellist ceiling.

## 5. Model-tier routing — "Fable 5 only when required"

`nexus`'s existing Model Calibration section (Pi-Dev-Ops PR #485) already defines *behavior* per tier (Opus = full loop at full scope; Sonnet = same loop, smaller increments; Haiku = routine-only, escalate after 2 failed cycles) but not tier *selection*. This design adds the selection layer on top:

- **Fable 5:** `boardroom`'s synthesizer/escalation-arbiter role; `judge`/spec-gate decisions; cross-skill synthesis after an MOA fan-out.
- **Opus 4.8:** single-specialist dispatches with real ambiguity (design, architecture-adjacent, security).
- **Sonnet 5:** default execution tier for routine dev/copy/dispatch work.
- **Haiku 4.5:** mechanical/routine sub-tasks only (lint-fix-style, single-increment), escalate after 2 failed verify-fix cycles — matches Nexus's own Haiku calibration verbatim.

Because this is useful to any consumer of `nexus`, not just this loop, it should land as a **separate, small PR to Pi-Dev-Ops's `nexus` skill** (adding a "Tier selection" subsection to `NEXUS_PROMPT.md` or `SKILL.md`), not as RestoreAssist-local documentation. This PR is a Phase-1 deliverable of this design (needed before the loop can route models correctly) but targets a different repo than the rest of the work.

## 6. Phase 3 — Self-improving skills (propose-via-PR only)

Composes three existing pieces rather than inventing a fourth:

1. `agent-expert`'s existing Act→Learn→Reuse loop already writes lessons to `.harness/lessons.jsonl` after each task. Add one field: `applies_to_skill: "<skill-name>"`, set when a lesson is about the skill's own process/instructions rather than the task's domain content. No other change to this mechanism.
2. A new lightweight threshold-scan job — mirroring `analyzing-customer-patterns`' monthly-cron shape (frequency/severity pattern-object, not a new skill) — watches `lessons.jsonl` for `applies_to_skill` entries reaching a frequency/severity threshold.
3. When the threshold is hit, it drafts a **single, scoped diff** to that skill's `SKILL.md` — one section only (e.g. append a bullet under an existing gate), never a rewrite.
4. The diff runs through `skill-authoring-standard`'s `references/review-checklist.md` gate (line-count cap, no duplication, leading-word check) before a human ever sees it — rejects bloated/off-standard proposals automatically.
5. If it passes, the existing `pr-creator` agent opens a PR (title convention: `skill-learn(<skill-name>): <one-line lesson>`, label `skill-self-update`) containing only that SKILL.md diff plus the triggering lesson excerpt in the PR body.

**Hard constraint, non-negotiable per explicit prior instruction:** this never self-merges and never edits a SKILL.md file directly on disk outside of a PR branch. A skill's own instructions changing requires the same human checkpoint as any other change in this design.

## 7. Governance rule changes (RestoreAssist repo only — Pi-Dev-Ops governance is a separate, later conversation)

`CLAUDE.md` is corrupted (binary garble past line 15, pre-existing, unrelated to this design) — no edits proposed there until that's fixed separately.

**(a) New rule 19 — `AGENTS.md`, immediately after rule 18:**

```markdown
19. **Continuous Linear-driven agent loop is sanctioned — implement → PR-open → verify-to-100%-green → merge.** A session-bound (not standing-cron) loop that pulls TODO items from the Linear RestoreAssist backlog, dispatches sub-agents to implement each, and opens a PR per item is an approved pattern. **Revised 2026-07-03, owner-approved:** the loop may merge its own PR into `main` — a narrow, conditional exception to rule 18's "human-authored only" posture, scoped to this loop's own PRs only — but only when ALL of the following hold, checked fresh at merge time (never inferred from a prior cycle or session):
    - Every required CI status check reports success — none pending, none skipped, none red.
    - The full test suite passes with zero failures (not "mostly passing" — zero).
    - Type-check and lint are clean.
    - No unresolved review conversations and no merge conflicts against current `main`.
    If any single item is red, pending, skipped, or unresolved, the loop does not merge — it stops and reports, exactly as before. It never retries a merge blind, never force-merges, and never re-spawns itself outside the current session. A PR that fails this bar sits open for human review, same as any other PR in this repo.
```

**(b) New "Owner-action gated" section — `.claude/RULES.md`, after the "Progress Framework" section:**

```markdown
### Owner-action gated (human sign-off required before execution)

These actions require explicit owner/human authorization before any agent — loop-dispatched or interactive — may execute them. Preparing the plan, runbook, or PR is allowed; running the action is not.

29. **Production database migrations / cutovers** — `prisma migrate deploy` against prod, pilot cutover phases, and any schema change applied outside local/preview.
30. **Secret and credential rotation** — API keys, OAuth client secrets, service-role tokens, signing keys, `.env` values in any deployed environment.
31. **Spend above a real-money threshold** — any action that provisions paid infrastructure, upgrades a paid tier, or otherwise commits spend over **$50 AUD** in a single action.
32. **Deleting or cancelling production resources** — dropping a prod database/branch, deleting a prod deployment, cancelling a subscription, revoking a domain, deleting user data outside a documented data-subject request.
33. **Merging into `main`** — see rule 18 (AGENTS.md). Owner-gated by default, **except** the continuous loop's own PRs when they meet the 100%-green bar defined in rule 19 — that specific, narrow case may merge without a per-item human go-ahead. Any PR not meeting that bar remains owner-gated as normal.

An agent that reaches an owner-gated action must stop, state exactly what it would do and why, and wait for explicit human go-ahead in that session. It must not infer prior approval from a Linear ticket status, a runbook's existence, or a prior session's notes.
```

**(c) Stop-guard / scope-limitation addendum — `.claude/RULES.md`, appended to the existing "Multi-agent orchestration" section:**

```markdown
The Linear-driven continuous loop is **session-bound, not a standing cron**: it runs only for the lifetime of the invoking session and must not schedule, daemonize, or re-trigger itself after the session ends. (A prior autonomous "Shipit continuous-execution cron" was paused after it opened conflicting PRs into `main` unattended — this constraint exists to prevent a repeat.) Each backlog item dispatched by the loop follows the same one-code-modifying-agent-at-a-time / worktree-isolation / checkpoint-commit rules above, and every item's terminus is a single PR-open — never a merge, never a chain of dependent unmerged PRs assumed to land together.
```

## 8. Open follow-ups (not blocking this spec, but not yet done)

- Create the actual `owner-gated` Linear label (§3, step 2) — replaces the regex fallback.
- The separate Pi-Dev-Ops PR adding tier-selection guidance to `nexus` (§5) — different repo, different review cycle.
- The full routing table in §4 needs to be built out during implementation; this spec defines its shape, not its complete contents.
- Daily token/cost budget ceiling value is unset — must be specified at loop-invocation time, not hardcoded here.
