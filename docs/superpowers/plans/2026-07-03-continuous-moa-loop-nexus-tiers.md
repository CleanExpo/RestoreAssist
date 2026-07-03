# Nexus Tier-Selection Subsection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Tier selection" subsection to Pi-Dev-Ops's `nexus` skill documenting which model tier (Fable 5 / Opus 4.8 / Sonnet 5 / Haiku 4.5) a dispatching agent should pick *before* calling Nexus, as a small standalone PR to Pi-Dev-Ops.

**Architecture:** `nexus`'s existing "Model calibration" section (in `NEXUS_PROMPT.md`) tells a model *how to behave once dispatched* at its tier — that content is read by the receiving model itself, as part of the prompt body. Tier *selection* is a different concern: it's a decision the dispatching agent makes beforehand, about which tier to call in the first place, and is never sent to the receiving model. This plan adds it as a new "Tier selection" subsection under `SKILL.md`'s `## Procedure`, between step 2 (fill `{TASK}`) and step 3 (dispatch) — the exact point where the dispatcher currently has to decide "pick the model tier per the prompt's own calibration section" with no guidance on *how*.

**Tech Stack:** Markdown only. No code, no tests, no CI beyond Pi-Dev-Ops's existing PR gates (Python pytest+ruff, Frontend tsc+eslint+build, Pi CEO API smoke test) which do not exercise skill `.md` files but still run as required status checks on every PR into `main`.

## Global Constraints

- Source content is spec §5 verbatim (4 tiers: Fable 5, Opus 4.8, Sonnet 5, Haiku 4.5) — `/Users/phillmcgurk/RestoreAssist/docs/superpowers/specs/2026-07-03-continuous-moa-agent-loop-design.md` lines 68–71.
- Lands as "a separate, small PR to Pi-Dev-Ops's nexus skill" (spec §5, line 73) — scope is this subsection only; no other spec sections (§3, §4, §6) are touched.
- `SKILL.md` must stay ≤ 200 lines (`skill-authoring-standard` Structure gate, `skills/skill-authoring-standard/SKILL.md` line 43).
- `NEXUS_PROMPT.md` has its own ≤120-line body cap and is recalibrated only monthly per its Autonomy contract (`skills/nexus/SKILL.md` lines 43–45) — this plan does not touch that file, so that cap is not at risk from this change, but is noted because it ruled out the alternative placement.
- Pi-Dev-Ops's `main` branch has protection: required PR review flow, linear history required, 3 required status checks (`Python (pytest + ruff)`, `Frontend (tsc + eslint + build)`, `Pi CEO API smoke test (28 checks)`), no force-push, no direct-to-main pushes.
- Commit/PR title convention observed in `git log --oneline` on `origin/main`: Conventional Commits style, e.g. `feat(skills): add nexus + boardroom, tighten judge/spm/skill-authoring-standard`.

---

## Pre-flight findings (read before starting Task 1)

Verified directly against the Pi-Dev-Ops repo and GitHub before writing this plan:

- **PR #485** (`feat(skills): add nexus + boardroom, tighten judge/spm/skill-authoring-standard`, branch `pidev/nexus-moa-skill-updates`) is **already MERGED** into `main` — `gh pr view 485 --json state,mergedAt` returned `"state":"MERGED"`, `"mergedAt":"2026-07-02T23:51:02Z"`. It landed as commit `0d25d54b` on `origin/main`.
- `origin/main`'s current tip is `012a5f4c` (`docs(wiki): refresh per-directory WIKI.md [skip ci]`, one commit after the #485 merge — an automated wiki-refresh commit, not something this plan needs to account for beyond branching from it).
- The local working copy (on stray branch `feature/remotion-local-progress-workspace`) shows `skills/nexus/SKILL.md` as a staged "new file" in `git status`. This is **stale local staging from an earlier, now-superseded branch state** — `diff`-ing the local file against `origin/main:skills/nexus/SKILL.md` shows they are **byte-identical**. There is no real drift and no unmerged competing content to reconcile.
- Conclusion: **branch from `origin/main` directly** (not from `pidev/nexus-moa-skill-updates`, which no longer exists as an open PR target — it's already folded into `main`). No rebase-avoidance or conflict-dodging is needed.
- `skills/nexus/SKILL.md` is 45 lines today; `skills/nexus/references/NEXUS_PROMPT.md` is 80 lines. Both have large headroom under their respective caps (200 and 120).

---

### Task 1: Branch setup, add the Tier-selection subsection, verify the line-count gate, commit, and push

This is one task, not five, per the writing-plans skill's Task Right-Sizing guidance: it is a single-file, single-section markdown addition with no code, no tests to write, and no meaningful reviewer boundary between "create the branch" and "make the edit" — splitting further would pad the plan without adding a real checkpoint.

**Files:**
- Modify: `/Users/phillmcgurk/Pi-Dev-Ops/skills/nexus/SKILL.md` (insert new subsection after the existing step 2 of `## Procedure`, before step 3)

**Interfaces:**
- Consumes: nothing from other tasks (this is the only task).
- Produces: a `## Procedure` section in `SKILL.md` with a new "**Tier selection**" block inserted between step 2 and step 3, renumbering the old steps 3 and 4 to 4 and 5.

- [ ] **Step 1: Create the working directory / branch from the correct base**

Confirm the local checkout is not sitting on stale staged state before creating the new branch (the pre-flight findings above already established the staged `skills/nexus/SKILL.md` is identical to `origin/main`'s — this step just re-confirms immediately before branching, in case anything changed since planning):

```bash
cd /Users/phillmcgurk/Pi-Dev-Ops
git fetch origin main
diff <(git show origin/main:skills/nexus/SKILL.md) skills/nexus/SKILL.md
```

Expected: no output (files identical), confirming it is safe to branch from `origin/main` with no reconciliation needed.

Create the new branch from `origin/main` (not from the working tree's current branch, and not from `pidev/nexus-moa-skill-updates`, which is already merged):

```bash
git checkout -b pidev/nexus-tier-selection origin/main
```

Expected: `Switched to a new branch 'pidev/nexus-tier-selection'`, and `git log --oneline -1` shows `012a5f4c docs(wiki): refresh per-directory WIKI.md [skip ci]` as HEAD.

- [ ] **Step 2: Insert the Tier-selection subsection into SKILL.md**

Current `## Procedure` section (lines 19–37 of `skills/nexus/SKILL.md` today) reads:

```markdown
## Procedure

1. Read [`references/NEXUS_PROMPT.md`](references/NEXUS_PROMPT.md).
2. Replace `{TASK}` with the complete task — include the why ("I'm working on X for Y;
   they need Z. With that in mind: …") and any hard constraints (hands-off surfaces,
   ff-only mandates, output contracts). The wrapper does not carry task context for you.
   - **Completion criterion:** no `{TASK}` placeholder remains; the task states its why
     and constraints.
3. Dispatch: pass the filled prompt verbatim as the subagent prompt (pick the model tier
   per the prompt's own calibration section), the SDK `system`+user pair, or another CLI —
   non-Claude-Code harness instructions are in [`references/cross-cli.md`](references/cross-cli.md);
   look them up there.
   - **Completion criterion:** the receiving model got the body verbatim — no partial
     paste, no appended show-your-reasoning instructions (`reasoning_extraction` trap).
4. On return, verify the report against the prompt's own contract before trusting it:
   claims grounded in tool results, mandate compliance (e.g. reflog for git mandates),
   scope untouched. Independent spot-check ≥1 claim.
   - **Completion criterion:** at least one claim independently re-verified, or the
     discrepancy reported.
```

Replace it with (new "Tier selection" block inserted between step 2 and the dispatch step; old step 3 becomes step 4, old step 4 becomes step 5; step 3's back-reference "pick the model tier per the prompt's own calibration section" is replaced with a pointer to the new subsection since that decision now has a home):

```markdown
## Procedure

1. Read [`references/NEXUS_PROMPT.md`](references/NEXUS_PROMPT.md).
2. Replace `{TASK}` with the complete task — include the why ("I'm working on X for Y;
   they need Z. With that in mind: …") and any hard constraints (hands-off surfaces,
   ff-only mandates, output contracts). The wrapper does not carry task context for you.
   - **Completion criterion:** no `{TASK}` placeholder remains; the task states its why
     and constraints.
3. **Tier selection** — decide *before* dispatch, as the dispatching agent, which model
   tier receives the filled prompt. This is a caller-side decision the receiving model
   never sees; it is separate from the prompt body's own "Model calibration" section
   (`references/NEXUS_PROMPT.md`), which tells a model how to behave *once* it is running
   at a given tier, not which tier to pick.
   - **Fable 5:** reserve for `boardroom`'s synthesizer/escalation-arbiter role,
     `judge`/spec-gate decisions, and cross-skill synthesis after an MOA fan-out. Not for
     routine dispatch — this tier is for the moments where the task *is* the judgment
     call, not a task that merely benefits from more care.
   - **Opus 4.8:** single-specialist dispatches carrying real ambiguity — design work,
     architecture-adjacent decisions, security-sensitive changes. Use when the task has
     more than one defensible approach and picking wrong is costly to unwind.
   - **Sonnet 5:** the default execution tier. Routine dev, copy, and dispatch work with
     a clear spec and a known pattern to follow lands here unless one of the other three
     tiers is explicitly warranted.
   - **Haiku 4.5:** mechanical, routine sub-tasks only — lint-fix-style changes,
     single-increment scope, nothing requiring judgment. Escalate to a higher tier after
     2 failed verify-fix cycles, matching this skill's own Haiku calibration in
     `references/NEXUS_PROMPT.md` verbatim.
   - **Completion criterion:** a tier is chosen and named before dispatch (step 4), with
     the reason traceable to one of the four bullets above — not left to the receiving
     model to infer from its own calibration section.
4. Dispatch: pass the filled prompt verbatim as the subagent prompt at the tier chosen in
   step 3, the SDK `system`+user pair, or another CLI — non-Claude-Code harness
   instructions are in [`references/cross-cli.md`](references/cross-cli.md); look them up
   there.
   - **Completion criterion:** the receiving model got the body verbatim — no partial
     paste, no appended show-your-reasoning instructions (`reasoning_extraction` trap).
5. On return, verify the report against the prompt's own contract before trusting it:
   claims grounded in tool results, mandate compliance (e.g. reflog for git mandates),
   scope untouched. Independent spot-check ≥1 claim.
   - **Completion criterion:** at least one claim independently re-verified, or the
     discrepancy reported.
```

Apply this edit to `/Users/phillmcgurk/Pi-Dev-Ops/skills/nexus/SKILL.md` using a str-replace tool (match the current step 3/4 block shown above and replace with the 5-step block).

- [ ] **Step 3: Verify the line-count gate**

```bash
wc -l /Users/phillmcgurk/Pi-Dev-Ops/skills/nexus/SKILL.md
```

Expected: a number ≤ 200. The addition is 26 new lines (one heading + four tier bullets with sub-explanations + one completion criterion, replacing the old single-line back-reference) on top of the existing 45-line file — expected result is approximately 70 lines, comfortably under the `skill-authoring-standard` ≤200-line cap (`skills/skill-authoring-standard/SKILL.md` line 43: "`SKILL.md` ≤ 200 lines"). No content needs to move to `references/` — if the actual count comes back over 200, stop and move the four tier bullets into a new `references/tier-selection.md` file reached by a context pointer (per the Structure gate's own escape hatch: "push branch-only or large (>~150-line) reference into `references/`"), but at ~70 lines this is not expected to trigger.

Also re-check `NEXUS_PROMPT.md` was not touched (this task only modifies `SKILL.md`):

```bash
git -C /Users/phillmcgurk/Pi-Dev-Ops diff --stat
```

Expected: only `skills/nexus/SKILL.md` listed.

- [ ] **Step 4: Review the rendered diff**

```bash
git -C /Users/phillmcgurk/Pi-Dev-Ops diff skills/nexus/SKILL.md
```

Expected: a diff showing the old 4-line step-3 (dispatch) block's calibration back-reference removed, a new "3. **Tier selection**" block inserted, and the old steps 3–4 renumbered to 4–5. No changes outside `## Procedure`.

- [ ] **Step 5: Commit**

```bash
cd /Users/phillmcgurk/Pi-Dev-Ops
git add skills/nexus/SKILL.md
git commit -m "$(cat <<'EOF'
feat(skills): add Tier selection subsection to nexus procedure

Dispatching agents currently have no guidance on which model tier
(Fable 5 / Opus 4.8 / Sonnet 5 / Haiku 4.5) to pick before calling
nexus -- only the prompt body's own Model calibration section, which
tells a model how to behave once it is already running at a tier.
Adds tier-selection criteria as SKILL.md Procedure step 3, sourced
from the continuous-moa-agent-loop design spec section 5.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

Expected: commit created on `pidev/nexus-tier-selection` with no other files staged.

- [ ] **Step 6: Push**

```bash
git push -u origin pidev/nexus-tier-selection
```

Expected: branch pushed to `origin/pidev/nexus-tier-selection`; no force-push (branch is new, first push).

---

### Task 2: Open the PR

**Files:** none (GitHub operation only).

**Interfaces:**
- Consumes: the pushed branch `pidev/nexus-tier-selection` from Task 1.
- Produces: an open PR against `main` for human review and the 3 required status checks.

- [ ] **Step 1: Open the PR**

```bash
cd /Users/phillmcgurk/Pi-Dev-Ops
gh pr create \
  --base main \
  --head pidev/nexus-tier-selection \
  --title "feat(skills): add Tier selection subsection to nexus procedure" \
  --body "$(cat <<'EOF'
## Summary
- Adds a "Tier selection" subsection to `skills/nexus/SKILL.md`'s `## Procedure`, giving dispatching agents explicit criteria for which model tier (Fable 5 / Opus 4.8 / Sonnet 5 / Haiku 4.5) to pick *before* calling nexus.
- Separates tier *selection* (a caller-side decision, new) from tier *calibration* (how a model behaves once dispatched, already covered in `references/NEXUS_PROMPT.md`'s Model calibration section) — selection lives in `SKILL.md` because the receiving model never reads it; calibration stays in the prompt body because the receiving model does.
- Sourced verbatim from `docs/superpowers/specs/2026-07-03-continuous-moa-agent-loop-design.md` §5 (RestoreAssist repo) — this is the small, standalone PR that spec calls for, split out from the larger continuous-MOA-loop design because it's useful to any consumer of nexus, not just that loop.

## Test plan
- [x] `skills/nexus/SKILL.md` line count confirmed ≤ 200 (skill-authoring-standard Structure gate)
- [x] `skills/nexus/references/NEXUS_PROMPT.md` untouched (diff --stat shows only SKILL.md changed)
- [ ] Required status checks pass: Python (pytest + ruff), Frontend (tsc + eslint + build), Pi CEO API smoke test (28 checks)

Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR created against `main` from `pidev/nexus-tier-selection`; command returns the PR URL. Do not merge — Pi-Dev-Ops's branch protection requires the 3 status checks plus review, and per this org's own rules a human merges, not the agent.

---

## Self-review

**1. Spec coverage.** Spec §5 requires exactly 4 tiers with specific content (lines 68–71):
- Fable 5 → boardroom synthesizer/arbiter, judge/spec-gate decisions, cross-skill synthesis after MOA fan-out — present verbatim in the Tier selection block's first bullet.
- Opus 4.8 → single-specialist dispatches with real ambiguity (design, architecture-adjacent, security) — present verbatim in the second bullet.
- Sonnet 5 → default execution tier for routine dev/copy/dispatch work — present verbatim in the third bullet.
- Haiku 4.5 → mechanical/routine only, escalate after 2 failed verify-fix cycles, matches Nexus's own Haiku calibration verbatim — present in the fourth bullet, and it explicitly cross-references `NEXUS_PROMPT.md`'s existing Haiku calibration line rather than restating it with drift risk.
- "Separate, small PR to Pi-Dev-Ops's nexus skill" (line 73) — Task 2 opens exactly that, scoped to this one file.
- "Adding a Tier selection subsection to NEXUS_PROMPT.md or SKILL.md" (line 73) — the file choice is made explicitly in the plan's Architecture section and justified: SKILL.md, because tier selection is a pre-dispatch, caller-side decision the receiving model never reads, whereas NEXUS_PROMPT.md's existing Model calibration section is prompt body dispatched to and read by the receiving model itself.
No gaps found against §5; §3, §4, §6 are correctly out of scope per the task instructions.

**2. Placeholder scan.** No "TBD", "TODO", "implement later", "add appropriate error handling", or "similar to Task N" patterns present. The markdown to insert is the actual final text, not a description of it. The only conditional branch (line-count gate step) states a concrete fallback (`references/tier-selection.md` via context pointer) rather than a vague "handle if needed."

**3. Type/interface consistency.** N/A — no code, no function signatures. The only cross-task interface is the branch name (`pidev/nexus-tier-selection`), used identically in Task 1 Step 6 (push) and Task 2 Step 1 (`--head`).

**4. Branch-base correctness (explicit check requested in task instructions).** PR #485 was confirmed MERGED via `gh pr view 485 --json state,mergedAt` (`"state":"MERGED"`). `origin/main` already contains the merged nexus skill at commit `0d25d54b`, one commit behind current tip `012a5f4c`. The plan branches from `origin/main` directly, not from `pidev/nexus-moa-skill-updates` (which is a closed/merged branch ref, not a live integration target). This avoids the two wrong outcomes: branching from a stale pre-merge base (would conflict) or branching from the now-dead PR-485 branch (adds a needless, already-subsumed ancestor).

No issues found requiring inline fixes.

---

Plan complete and saved to `docs/superpowers/plans/2026-07-03-continuous-moa-loop-nexus-tiers.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
