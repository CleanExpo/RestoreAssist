# Phase 2 Completion Report

Date: 2026-05-25

Branch: `codex/phase-2-ai-workflow-upgrades`

## Status

Phase 2 is not complete.

This report prevents accidental completion claims while Phase 2 AI/workflow upgrade work is still in incremental guardrail rollout.

## Completed So Far

- Phase 2 branch created from the Phase 1 review-ready baseline.
- Phase 1 blockers carried forward and kept visible.
- Required Phase 2 source docs read.
- Existing AI service layer and provider usage inspected.
- Phase 2 start report created.
- Phase 2 execution plan created.
- Initial Phase 2 planning docs committed in `0c621772`.
- First safe implementation slice started:
  - non-runtime AI call-site audit script added.
  - task-policy map added.
  - audit/task-policy tests added.
  - AI call-site inventory report added.
- First safe implementation slice validated:
  - focused audit tests pass.
  - root type-check passes.
  - lint passes with existing warnings.
  - API audit remains 442 routes / 0 errors / 14 warnings.
  - mobile type-check passes.
  - whitespace check passes.
- Second safe implementation slice completed locally:
  - AI inventory refined from 117 to 88 static surfaces by removing non-AI BYOK/storage/provider-connection false positives.
  - first low-risk candidate documented in `PHASE_2_AI_POLICY_WRAP_CANDIDATE.md`.
  - `draftSupportTicketReply` wrapped with `support_response_draft` policy guardrails.
  - provider, model, prompt, request shape, and output shape preserved.
  - missing/unknown policy fails closed.
- Third safe implementation slice completed locally:
  - remaining unknown AI task item resolved: `analytics-narrative.ts` is a real call site classified as `workflow_automation`.
  - second low-risk candidate documented in `PHASE_2_AI_POLICY_WRAP_CANDIDATE_2.md`.
  - `analyseSupportTicket` wrapped with `support_ticket_analysis` policy guardrails.
  - provider, model, prompt, request shape, and output shape preserved.
  - missing/unknown policy fails closed.
- Fourth safe implementation slice completed locally:
  - AI cost-observability gap map created from the 88-surface inventory.
  - missing usage logging, tenant/account context, token/request guardrails, high-cost risks, low-risk next candidates, and do-not-touch-yet areas documented.
  - pure usage metadata helper added in `lib/ai/usage-metadata.ts`.
  - helper tests added in `lib/ai/__tests__/usage-metadata.test.ts`.
  - no DB writes, provider calls, prompt changes, model changes, output-shape changes, or runtime routing changes added.
- Fifth safe implementation slice completed locally:
  - third low-risk candidate documented in `PHASE_2_AI_POLICY_WRAP_CANDIDATE_3.md`.
  - `generateInterviewQuestion` wrapped with `fast_classification` policy guardrails.
  - pure usage metadata attached without DB persistence.
  - provider gateway, model selection, prompt, request shape, max token value, and output shape preserved.
  - no DB writes, new provider calls, public-route behavior changes, or broad runtime routing added.
- Sixth safe implementation slice completed locally:
  - fourth low-risk candidate documented in `PHASE_2_AI_POLICY_WRAP_CANDIDATE_4.md`.
  - `validateInterviewResponse` wrapped with `fast_classification` policy guardrails.
  - pure usage metadata attached without DB persistence.
  - existing Haiku 4.5 -> 3.5 fallback chain, prompt, request shape, max token value, and output shape preserved.
  - no DB writes, new provider calls, public-route behavior changes, or broad runtime routing added.
- Seventh safe implementation slice completed locally:
  - Phase 2 AI guardrail work consolidated in `PHASE_2_AI_GUARDRAIL_CONSOLIDATION_REPORT.md`.
  - current AI inventory remains 88 surfaces with 0 unknown task classes.
  - policy-wrapped surfaces remain 4.
  - unwrapped surfaces, high-cost risks, sensitive-data risks, safest next candidates, and do-not-touch-yet categories documented.
  - chosen next safe slice is option C: documentation-only AI policy adoption standard.
  - `suggest-next-interview-question.ts` remains the recommended next low-risk wrapper after review accepts the standard.
  - no runtime AI behavior changed.
  - no provider, model, prompt, output shape, public-route behavior, DB write, provider call, or runtime routing change added.
- Eighth safe implementation slice completed locally:
  - fifth low-risk candidate documented in `PHASE_2_AI_POLICY_WRAP_CANDIDATE_5.md`.
  - `suggestNextInterviewQuestion` wrapped with `fast_classification` policy guardrails.
  - pure usage metadata attached without DB persistence.
  - existing Haiku 4.5 -> 3.5 fallback chain, prompt, request shape, max token value, parse fallback behavior, and output shape preserved.
  - no DB writes, new provider calls, public-route behavior changes, final report changes, customer-facing report changes, voice/realtime changes, OCR/image changes, RAG/IICRC changes, or broad runtime routing added.
- Ninth safe implementation slice completed locally:
  - non-runtime AI guardrail audit gate added as `pnpm audit:ai`.
  - gate fails on unknown AI task classes.
  - current baseline remains 88 AI surfaces, 0 unknown task classes, 5 policy-wrapped surfaces, and 66 sensitive external-provider surfaces.
  - audit report now includes guardrail summary, wrapped count, sensitive external-provider count, pass/fail status, and explicit false-positive exclusions.
  - audit tests cover known pass behavior, unknown fail-closed behavior, wrapped count reporting, JSON parseability, and explicit exclusions.
  - no runtime AI behavior changed.
  - no provider, model, prompt, output shape, public-route behavior, DB write, provider call, additional AI-surface wrapping, or runtime routing change added.

## Not Yet Complete

- Provider-neutral gateway implementation.
- Broad central runtime routing.
- Reviewed owner decisions for remaining high-risk call sites.
- Runtime model routing tests for migrated calls.
- DB-backed usage logging integration for selected migrated calls.
- Cost guardrail tests for additional migrated calls.
- RAG false-citation eval gate.
- OCR/image pipeline improvements.
- Voice workflow improvements.
- Sketch/floorplan acceleration.
- Technician workflow automation.
- Report-generation assistance and quality checks.

## Phase 1 Blockers Still Visible

1. 14 public-route owner/security sign-offs.
2. Mobile offline simulator/device evidence.
3. Supabase anon-policy release-day/manual revalidation.
4. Vercel TLS release-day confirmation.
5. PR template case-collision artifact handled separately.

## Ship Readiness

RestoreAssist remains **DO NOT SHIP**. Phase 2 planning does not approve production release.

## Next Safe Action

Validate and commit the AI guardrail audit gate. After review, add `pnpm audit:ai` to CI or perform a fresh owner-reviewed candidate selection before wrapping any more AI surfaces.
