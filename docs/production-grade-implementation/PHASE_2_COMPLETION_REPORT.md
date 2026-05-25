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

Use the cost-observability gap map to migrate one additional low-risk AI task through policy and metadata guardrails without changing provider, prompt, output shape, public route behavior, or runtime routing.
