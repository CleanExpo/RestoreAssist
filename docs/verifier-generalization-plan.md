# Verifier Generalization Plan

**Origin:** review of `CleanExpo/Fabel-Prompt-Engineer` (The Fable System) against RA's
existing verification machinery, 2026-06-15.

**One-line thesis:** RA already has a machine-enforced, evidence-cited verifier — but it
only checks ONE domain (iOS App Review billing). The high-leverage move is to generalize
the existing hook to multiple claim-domains, not to bolt on anything from Fable.

---

## What RA already has (do NOT rebuild)

The Stop hook `.claude/hooks/stop-verifier.sh` already implements, in production:

- **Two-stage gate**: deterministic static grep (`lib/ios-static-check.sh`, $0) → LLM
  verifier (DeepSeek via `lib/openrouter-call.sh`) only if static passes.
- **Atomic-claims, evidence-cited verdicts**: `lib/verifier-system-prompt.md:86-103` returns
  `status: verified|failed|partial`, `confidence`, `claims_total/verified/failed/unverified`,
  and `verified[].evidence` quoting the offending line. This _is_ Fable's Evidence Standard,
  already machine-enforced (Fable's equivalent is a manual UI approval click).
- **Persisted audit trail**: every run is written to `.claude/verifier-reports/<session>-*.json`
  (`stop-verifier.sh:88-89,165`) — the queryable findings ledger Fable persists to Supabase.
- **Loop guard + escape hatch** (`VERIFIER_LOOP_CAP`, `CLAUDE_VERIFIER_SKIP`).

RA's broader review layer also already **exceeds** Fable's critic step:
`.claude/rules/review-dimensions.md` (18 dimensions, activation-by-path, confidence ≥75%
with boosters/reducers) + the `opus-adversary` skill = a multi-lens adversarial panel,
versus Fable's single critic model. **Fable's critic-gate / approval-gate / confidence
ideas add nothing here — RA is ahead.**

## The actual gap

Of the five files under `.claude/hooks/lib/`, only **two** are domain-specific:
`ios-static-check.sh` and `verifier-system-prompt.md`. The other three
(`gather-context.sh`, `openrouter-call.sh`, `parse-report.sh`) and the whole report trail
are already domain-agnostic plumbing.

Consequence: when an agent edits a Prisma migration, an RLS policy, or claims "tests pass"
(e.g. the RA-4956 RLS work on 2026-06-15), the Stop hook runs **zero** machine verification —
it only knows how to check iOS billing. Every non-iOS claim is governed by prose rules
(`verification-gate.md`) enforced only by the model's goodwill. That prose-only path is
exactly where the 2026-06-10 Plaud mandate's "built but doesn't work / board ≠ reality"
failures live.

## What Fable actually contributes

Proof that the same machinery generalizes: the Evidence Standard is **domain-agnostic
claim-tagging** (`Fabel-Prompt-Engineer` `lib/evidence.ts`, `skills/fable-engine/SKILL.md:39-49`).
That validates widening RA's verifier rather than keeping it iOS-only.

## Plan (smallest phase first; each phase has a DoD)

**Phase 1 — Make the verifier domain-pluggable.** Refactor `stop-verifier.sh` to route
edited paths to a domain via a small table (path glob → domain), then load
`lib/verifier-<domain>.md` + optional `lib/<domain>-static-check.sh`. iOS becomes the first
registered domain, behaviour-identical. _DoD: existing iOS verifier tests/reports unchanged;
a non-matching edit is a no-op._

**Phase 2 — Add the two domains this codebase most needs**, grounded in real 2026 incidents:

- `migration-safety`: globs `prisma/migrations/**`, `supabase/migrations/**`. Static check =
  grep for `DROP TABLE|DROP COLUMN|ALTER COLUMN .* TYPE|ENABLE ROW LEVEL SECURITY` without an
  accompanying guard/`IF EXISTS`. LLM check = the migration-safety rubric from
  `review-dimensions.md` #16. (Would have machine-checked the RA-4956 RLS PR.)
- `claim-truthfulness`: when a turn asserts "tests pass / CI green / deployed", require a
  matching tool result in-transcript or downgrade to `failed`. Directly attacks "board ≠ reality".

**Phase 3 — Aggregate ledger.** [PASS] SHIPPED. `npm run verifier:ledger`
(`scripts/verifier-ledger.mjs`) reads `.claude/verifier-reports/*.json` into an
all-time + last-N-days roll-up: per-domain `failed` blocks, partials, and
`claims_unverified` totals (`--json` for machine output). Legacy pre-router reports are
attributed to `ios-app-review`. (Fable's `summarizeEvidence` equivalent, longitudinal.)

---

**Status:** Phases 1, 2 (migration-safety + claim-truthfulness), and 3 are all shipped to
`main`. The verifier covers 3 domains and is now measurable via the ledger.

## Measurable success criteria (counts, not invented percentages)

- **Domain coverage**: verifier domains in the registry. Today **1** (iOS). Phase 2 target: **3**.
- **Machine-verified Stop events**: today, an edit touching only `prisma/**` triggers **0**
  LLM verifications (provable from `.claude/verifier-reports/` — no migration reports exist).
  Phase 2: every migration/CI-claim edit produces a persisted report.
- **Block rate by domain** (`status:"failed"` per week from the report trail) — newly visible
  per domain, currently unmeasurable outside iOS.
- **Shipped-unverified claims**: `claims_unverified` summed across merged-branch reports per
  week → a real number to drive down, replacing the current "we think it's fine."

## Explicit non-goals

- No new app, no Supabase tables, no UI — reuse the existing hook + JSON report files.
- Do not import Fable's critic/approval/confidence layers — RA already exceeds them.
- No change to CI; this is the local Stop-time gate, complementary to CI.
