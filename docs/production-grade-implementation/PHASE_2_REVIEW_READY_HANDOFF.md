# Phase 2 Review Ready Handoff

Date: 2026-05-25

Branch: `codex/phase-2-ai-workflow-upgrades`

## Status

Phase 2 is ready for review, not ship approval.

RestoreAssist remains **DO NOT SHIP** until Phase 1 manual blockers and release-candidate evidence are complete.

## Latest Commit

Latest reviewed local commit at handoff creation:

- `b06c5d49 ci(phase2): run ai guardrail audit in pr checks`

## Phase 2 Summary

Phase 2 added non-runtime AI guardrail foundations and wrapped only low-risk service-layer helpers:

- static AI call-site inventory/audit.
- AI task policy map.
- pure AI usage metadata helper.
- policy guardrails for support response drafting.
- policy guardrails for support ticket analysis.
- policy and pure metadata for interview question generation.
- policy and pure metadata for interview response validation.
- policy and pure metadata for suggest-next interview question.
- AI guardrail audit gate through `pnpm audit:ai`.
- PR workflow now runs `pnpm audit:ai` after lint and before unit tests.

No runtime model routing was added.

## Files Changed By Category

Audit and policy foundation:

- `scripts/audit-ai-call-sites.ts`
- `scripts/__tests__/audit-ai-call-sites.test.ts`
- `lib/ai/task-policy.ts`
- `lib/ai/usage-metadata.ts`
- `lib/ai/__tests__/usage-metadata.test.ts`

Low-risk wrapped helpers:

- `lib/services/ai/draft-support-ticket.ts`
- `lib/services/ai/analyse-support-ticket.ts`
- `lib/services/ai/generate-interview-question.ts`
- `lib/services/ai/validate-interview-response.ts`
- `lib/services/ai/suggest-next-interview-question.ts`

Focused preservation tests:

- `lib/services/ai/__tests__/draft-support-ticket.test.ts`
- `lib/services/ai/__tests__/analyse-support-ticket.test.ts`
- `lib/services/ai/__tests__/generate-interview-question.test.ts`
- `lib/services/ai/__tests__/validate-interview-response.test.ts`
- `lib/services/ai/__tests__/suggest-next-interview-question.test.ts`

CI/checks:

- `package.json`
- `.github/workflows/pr-checks.yml`

Documentation:

- `PHASE_2_START_REPORT.md`
- `PHASE_2_EXECUTION_PLAN.md`
- `PHASE_2_AI_CALLSITE_INVENTORY.md`
- `PHASE_2_AI_COST_OBSERVABILITY_GAP_MAP.md`
- `PHASE_2_AI_GUARDRAIL_CONSOLIDATION_REPORT.md`
- `PHASE_2_AI_GUARDRAIL_AUDIT_GATE.md`
- `PHASE_2_AI_POLICY_WRAP_CANDIDATE.md`
- `PHASE_2_AI_POLICY_WRAP_CANDIDATE_2.md`
- `PHASE_2_AI_POLICY_WRAP_CANDIDATE_3.md`
- `PHASE_2_AI_POLICY_WRAP_CANDIDATE_4.md`
- `PHASE_2_AI_POLICY_WRAP_CANDIDATE_5.md`
- `PHASE_2_PROGRESS_LOG.md`
- `PHASE_2_COMPLETION_REPORT.md`

## AI Audit Baseline

Current `pnpm audit:ai` baseline:

- AI surfaces: 88.
- unknown task classes: 0.
- policy-wrapped surfaces: 5.
- sensitive external-provider surfaces: 66.
- files scanned: 1,194.

## Policy-Wrapped Surfaces

- `lib/services/ai/draft-support-ticket.ts`
- `lib/services/ai/analyse-support-ticket.ts`
- `lib/services/ai/generate-interview-question.ts`
- `lib/services/ai/validate-interview-response.ts`
- `lib/services/ai/suggest-next-interview-question.ts`

## CI/Check Changes

Added:

- `pnpm audit:ai`
- `.github/workflows/pr-checks.yml` step: `AI guardrail audit`

The CI gate is static only. It performs no provider calls, DB writes, or runtime routing.

## Validation Results

Latest recorded Phase 2 validation:

- `pnpm audit:ai`: PASS, 88 surfaces / 0 unknown / 5 wrapped / 66 sensitive.
- `pnpm exec vitest run scripts/__tests__/audit-ai-call-sites.test.ts`: PASS, 17 tests.
- `pnpm exec tsx scripts/audit-ai-call-sites.ts --json`: PASS.
- `pnpm exec vitest run lib/ai/__tests__/usage-metadata.test.ts`: PASS, 5 tests.
- `pnpm type-check`: PASS.
- `pnpm lint`: PASS with 0 errors and 838 existing warnings.
- `git diff --check`: PASS.
- `pnpm exec tsx scripts/audit-api-routes.ts --json`: PASS, 442 routes / 0 errors / 14 warnings.
- `pnpm --dir mobile --ignore-workspace type-check`: PASS.

## Remaining Risks

- 83 AI surfaces still lack local usage/cost logging evidence.
- 36 AI surfaces lack static tenant/account context evidence.
- 33 AI surfaces lack static max token/request guardrail evidence.
- 66 AI surfaces send or may send sensitive data to external providers.
- DB-backed usage logging is not implemented.
- runtime model routing is not implemented.
- high-risk OCR/image, RAG/IICRC, voice/realtime, report drafting, and report finalisation areas remain untouched.
- Phase 1 manual blockers remain unresolved.

## Deliberately Not Changed

- no provider changes.
- no model selection changes.
- no prompt changes.
- no output shape changes.
- no DB writes.
- no provider calls added.
- no runtime model routing.
- no public-route behavior changes.
- no report finalisation changes.
- no customer-facing report generation changes.
- no OCR/image changes.
- no RAG/IICRC standards retrieval changes.
- no voice/realtime changes.
- no protected `.github/PULL_REQUEST_TEMPLATE.md` changes.
- no `.agents/skills/appshots/` changes.

## Reviewer Checklist

- Confirm `pnpm audit:ai` belongs in PR checks after lint and before unit tests.
- Confirm policy-wrapped surfaces preserve provider/model/prompt/output behavior.
- Confirm no DB writes or provider calls were introduced by metadata helpers.
- Confirm `analytics-narrative.ts` should remain deferred or assign an owner-reviewed candidate decision.
- Confirm high-risk AI areas remain out of scope.
- Confirm Phase 1 blockers remain visible.
- Confirm `.github/PULL_REQUEST_TEMPLATE.md` is not staged.

## Ship Status

**DO NOT SHIP**.

Phase 2 is review-ready only. It does not approve production release.

## Next Safe Action

Review Phase 2. After review, either:

- add any requested CI/audit refinements, or
- approve Phase 3 release-candidate validation planning without claiming ship readiness.
