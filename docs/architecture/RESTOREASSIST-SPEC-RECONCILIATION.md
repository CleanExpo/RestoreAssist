# RestoreAssist — Spec Reconciliation Report

How the master `spec.md` was assembled from prior evidence: sources used, contradictions resolved, content retained vs superseded, unresolved questions, implementation drift, and draft-PR implications.

## Source documents used
- Prior repo `spec.md` (NIR production-readiness gates, 227 lines) — retained as Appendix A.
- `RA-AUDIT-SPEC.md` (six-phase audit spec + founder target-architecture block).
- `RA-INVENTORY.md` (493 routes / 179 pages / 208 models / 22 crons baseline).
- `RA-V1-READINESS.md` (55/100 end-to-end score, must-fix / quick-win / go-forward).
- Dry-run reports A–D (intake→inspection, drying+contents, reporting→closure, Margot map).
- `RA-ARCH-01-SECURITY.md`, `-02-CONCURRENCY.md`, `-03-SOURCE-OF-TRUTH.md`, `-04-MARGOT-PLACEMENT.md`, `-05-V1-READINESS.md`, `-06-DIFFERENTIATION.md`, `-07-FINAL-SPEC-REVIEW.md`.
- Live repo evidence: Prisma schema, routes, tests, PR #1967.

## Contradictions resolved
1. **Scheduling in V1 vs deferred** (differentiation "deal-loser" vs readiness "V1.x"). → Resolved by founder directive 2.8: minimum scheduling **in V1** (spec §11, D-005).
2. **"No more audits, just execution" vs a 14-migration + 9-step program.** → Resolved by phasing: only SoT Phases 0–2 + Margot steps 1–4 are V1; the rest is V1.x (spec §41, §5).
3. **"Margot is an operations assistant, not a trainer" vs reviving "Live Teacher."** → Resolved: Live Teacher reframed as an operations coach, capture mount deferred to V1.x; CARSI owns training (spec §24, §27, D-007).
4. **"AI is BYOK" vs house-key call sites.** → Resolved by the four-plane boundary (spec §26, D-006).
5. **Two "completeness" notions** (post-hoc PDF gap-analysis vs dynamic per-claim). → Resolved: one deterministic stage-specific engine unifies them (spec §25, D-004).
6. **Retire Room vs prior RA mapping spec.** → Resolved: twin canonical, Room retired after prod row-count check (spec §13, §40, D-009).
7. **Overloaded `ReportStatus.COMPLETED`.** → Resolved: six-fact report state; closure binds to real delivery (spec §9, §23, D-008).

## Content retained
- The prior consequential-output distribution gates, multiple-eyes review layer, and final sign-off checklist — retained as release-level gates (Appendix A; referenced by §42).
- The ±10%-of-actuals cost-estimate target, ≥90% report-generation, technician-usability and adjuster-approval pilot metrics — retained as release gates.
- All security/concurrency findings — integrated into §30/§32 as requirements.
- The source-of-truth ownership calls — integrated into §8 and the traceability matrix.

## Content superseded
- The prior spec's framing of RestoreAssist as the "NIR system" (report-centric) is superseded by the operations-system identity (§1); the NIR pipeline becomes one capability within the lifecycle.
- The persona/reviewer roster (Nova/Lens/Forge…) is superseded by the concrete roles (§3) and the two independent reviews (§13 of the task); the reviewer mechanism is retained as a release-gate concept.
- The `goals.md` 32-`/goal` backlog mapping is superseded by the V1 backlog (`RESTOREASSIST-V1-BACKLOG.md`).

## Unresolved (non-blocking) questions
- Authorised drying-goal methodology source (numeric thresholds) — needed before Phase 1 certification maths finalises; deterministic engine scaffold can proceed.
- Per-organisation completeness baseline content for water damage — the rule *pack* structure is specified; the exact baseline list is an owner input.
- Pilot-partner selection for release metrics.
None of these block starting Phase 0–2.

## Implementation drift (target vs current reality)
- Money path: current hardcodes $50/line and orphans the estimate contract; target derives invoices from approved estimate snapshot (§21).
- Drying: current certification is structurally unachievable; target is legitimately achievable (§14).
- Reports: current PDF reads hand-keyed JSON; target reads relational sources (§20).
- Storage: current serves evidence/sketch from public buckets; target private + signed URLs (§30).
- Margot: current chatbot is claim-blind; target is claim-aware via one context service (§24).
- Room/EquipmentDeployment/CostEstimate/FormSignature: currently dead models; target retires them after prod row-count check (§40).

## Draft PR implications
- **PR #1967** (block `bulk-status` COMPLETED) — classified **temporary defence-in-depth**, compatible with the final report state model (§9, traceability §E.6). Assessed against that model and **merged 2026-07-17** as the interim guard (assessment recorded on the PR); the durable change (decouple `report_sent` from user-settable status) lands in Phase 1 (P1-6).

## Independent review outcomes (§13) and how they were folded
Both reviews initially returned FAIL; every material finding was folded into this consolidation:

**Review A — engineering ambiguity:** M1 absent state-machine tables → authored (traceability §E, all 12 machines); M2 undefined closure financial precondition → pinned (§23, D-013, §E.9); M3 unnamed V1 accounting provider → Xero named (§39, D-014); M4 scheduling competency had no model → RA-local tag (§11, D-015); M5 completeness enumeration/scaffold asymmetry → advisory-projection + scaffold latitude stated (§25, D-016). Non-blocking items (drying thresholds, pilot partners, PDF layout, partner payload mapping, entitlement map, appointment equipment tags, Margot per-action rows) confirmed deferrable.

**Review B — restoration operations:** M1 water Category/Class → canonical datum (§8/§12, D-012); M2 loss timeline (cause/date/first-attendance) → required intake fields (§10, D-012); M3 pre-work safety record + typed hazards → captured, ACM blocks strip-out (§12, D-012); M4 authority-to-dispose → disposal gate (§16, D-012). V1.x-acceptable gaps recorded (insurer variation approval, distinct make-safe phase, communication-history detail, excess/subcontractor/welfare/test-and-tag). Photo metadata binding folded into §34; retention duration added to §43 non-blocking owner inputs.

After folding, both reviews' material findings are closed; a confirmation re-review was run (see commit trail). No material engineer guesswork remains.
