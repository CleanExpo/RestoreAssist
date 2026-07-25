# Night-run pipeline — Define → Plan → Build → Verify → Review → Ship

Controller spec for the 25-item programme uncovered 2026-07-25/26. Every iteration of
the loop reads this file, picks the next actionable task from `NIGHT_RUN_LEDGER.md`,
advances it exactly one stage, writes the outcome back to the ledger, and stops.

**Non-negotiable:** a task may not skip a stage. A stage that cannot complete marks the
task `BLOCKED` with a reason and the loop moves to the next task — it never fakes a pass.

---

## Stage 1 — DEFINE

**Purpose:** turn a backlog line into a falsifiable outcome before anyone writes code.

| Step | Instrument |
|---|---|
| Ground in prior estate context | `nexus-recall` (brain.js over vault + MEMORY + skills index) |
| Produce a decision-grade spec | `/spm` |
| Resolve open decisions in an unshaped ask | `grill-me` (one question at a time to resolution) |
| Establish domain vocabulary for a new area | `grill-with-docs` |

**Exit gate.** `spec.md` exists with acceptance criteria a machine can fail. "Works well"
is not an acceptance criterion; "a homeowner opens one link and sees stage, next step,
documents and contact" is. No spec, no plan.

## Stage 2 — PLAN

| Step | Instrument |
|---|---|
| Files, order, effort, risk, test stub | `technical-plan` → `plan.md` |
| Challenge the approach BEFORE building | `/judge` (devil's-advocate gate) |
| Architecture-class change | `design-pressure-test` (Opus subagent challenges the design) |
| Commercial or strategic weight | `/ceo-board` (nine-persona deliberation → decision memo) |
| External-fact dependency | `/storm` or `deep-loop` (citation-grounded, tiered sources) |

**Exit gate.** The judge returns approve-or-revise. A revise verdict loops back to Stage 1
or 2 — it never proceeds to build. Board items wait for the founder; they do not
auto-proceed.

## Stage 3 — BUILD

| Step | Instrument |
|---|---|
| Pick the minimal skill set | `skill-selector` (never load the whole library) |
| Isolate the work | git worktree per task, standalone `pnpm install --ignore-workspace` |
| Any UI at all | `mobbin-ui-patterns` brief FIRST, then `frontend-design` |
| Any client- or public-facing words | `nexus-copywriter` |
| Test-first | `superpowers:test-driven-development` — red, then green |
| Independent parallel sub-tasks | `Agent` fan-out; one worktree each if they mutate files |

**Exit gate.** Every new behaviour has a test that failed before the implementation existed.
A test written after the fact is marked as such in the ledger.

## Stage 4 — VERIFY

Run the repository's complete definition of done, not a subset:

- `pnpm type-check` (authoritative — never `npx tsc` on a single path)
- `pnpm lint` (0 errors; the ~727 warnings are pre-existing)
- `pnpm exec vitest run --config config/vitest.config.js <paths>` — **the config flag is
  mandatory**, without it the `@/` alias silently fails to resolve
- Full `test:unit` when the change is broad; classify any failure against a pristine
  `origin/main` worktree before blaming the branch (4 failures are pre-existing:
  `lib/setup/checks` ×3, `lib/queue/storage-mirror.model` ×1)
- The `ios-app-review` static verifier — it catches App Review 3.1.1 billing-route
  violations that no unit test will
- `brain.js bench --root docs` must stay 5/5 after any docs index edit

**Exit gate — positive control.** A null result is not evidence until the check is proven
able to return non-null. Every "no violations found" must cite the control that proves the
check fires. (Today: the drift-gate probe field breaking `type-check`; the web-path test
finding the billing button the iOS test asserts is absent.)

## Stage 5 — REVIEW

**Dual independent, always.** Same-family agreement is provisional; the two families
disagreed on 4 of 6 PRs in a prior wave and both sets of findings were real.

| Reviewer | Family | Role |
|---|---|---|
| `opus-adversary` | Claude | architecture, race conditions, state bugs, test honesty |
| `codex exec` | OpenAI | independent correctness, security, conventions |
| `hermes -z` | gpt-5.6-sol via Hermes | third-family tiebreak + AU-compliance read (IICRC edition/section, GST, ABN) |

**Dispatch discipline for the overnight run.** Claude and Codex are the standing pair.
Hermes runs as the tiebreak when the two disagree, and as the compliance lane on anything
touching citations, tax or ABN. Verified available this session:
`hermes -z '<prompt>'` answered on `gpt-5.6-sol` (OpenAI Codex provider). Every dispatch is
time-boxed — a reviewer that has not written its report inside its box is killed and
re-dispatched with a narrower brief, never waited on indefinitely (a round-1 Codex review
stalled ~1h this session and had to be killed).

Both must bind their verdict to the **exact HEAD SHA**. Any P0–P2 finding blocks: fix,
re-run every affected gate, create a new commit, re-review the new SHA. A PASS for an
older SHA is void. If a reviewer stalls, kill it and re-dispatch with a time-boxed brief —
never self-certify, never let silence read as approval.

## Stage 6 — SHIP

1. `pr-release-gate` receipt — re-executes the test commands and binds exit codes plus the
   review report to the exact HEAD and base. `PR_RELEASE_GATE_PASS` or stop.
2. Push the branch. Never force-push, never `--no-verify`, never push to main.
3. Open **one** draft PR with the SHA, the exact commands and results, and reviewer
   identity in the body. Related work updates the existing branch — a stream of
   replacement PRs for one scope is a failure.
4. Human merge by default. The `UG-AUTONOMY-001` exception covers RestoreAssist only
   when every hash-bound condition holds; head drift or missing evidence fails closed.

---

## Stop conditions (the loop halts and reports)

- A **founder-gated** blocker is the only remaining work (credentials, DNS, spend, App Store).
- A reviewer returns a finding the loop cannot fix without a product decision.
- A gate fails twice on the same cause — three fix-attempt cycles maximum, then report blocked.
- Anything irreversible without a tested rollback, any new or increased cost, any production
  mutation outside an approved migration path.

## Escalation, not silence

A blocked task writes its blocker to the ledger in one plain sentence a non-technical reader
can act on. The morning report leads with what is blocked and who must unblock it.
