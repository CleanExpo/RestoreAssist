# Phase 2 Progress Log

Date: 2026-05-25

Branch: `codex/phase-2-ai-workflow-upgrades`

## Current Status

Phase 2 has started from the Phase 1 review-ready baseline. The first runtime-touching slice is limited to one policy guardrail lookup in the support ticket draft service; provider, model, prompt, request shape, and output shape are unchanged.

## Baseline

- Source branch: `codex/phase-1-production-readiness-clean`
- Phase 2 branch: `codex/phase-2-ai-workflow-upgrades`
- Baseline commit: `c2821eec docs(phase1): add review ready handoff`
- Protected dirty artifact: `.github/PULL_REQUEST_TEMPLATE.md`, unstaged and untouched.

## Completed

- Confirmed safe worktree and branch state.
- Created `codex/phase-2-ai-workflow-upgrades` from the Phase 1 review baseline.
- Read Phase 2 planning inputs:
  - `AI_STACK_RECOMMENDATIONS.md`
  - `PHASE_2_AI_AND_WORKFLOW_UPGRADES.md`
  - `SYSTEM_ARCHITECTURE.md`
  - `COST_OPTIMIZATION_PLAN.md`
  - `UX_REDESIGN.md`
  - `FINAL_SHIPIT_READINESS_REPORT.md`
  - `PHASE_1_REVIEW_READY_HANDOFF.md`
- Inspected existing AI service/provider usage.
- Created `PHASE_2_START_REPORT.md`.
- Created `PHASE_2_EXECUTION_PLAN.md`.
- Committed initial Phase 2 planning docs in `0c621772`.
- Added non-runtime AI call-site audit script: `scripts/audit-ai-call-sites.ts`.
- Added audit/task-policy guardrail tests: `scripts/__tests__/audit-ai-call-sites.test.ts`.
- Added initial documented task policy map: `lib/ai/task-policy.ts`.
- Created `PHASE_2_AI_CALLSITE_INVENTORY.md`.
- Refined the AI inventory audit to remove non-AI BYOK/storage/provider-connection false positives.
- Documented the first policy-wrap candidate in `PHASE_2_AI_POLICY_WRAP_CANDIDATE.md`.
- Wrapped `lib/services/ai/draft-support-ticket.ts` with `support_response_draft` policy guardrails without changing the Anthropic request contract.
- Added support draft preservation tests in `lib/services/ai/__tests__/draft-support-ticket.test.ts`.
- Resolved the remaining unknown AI task classification: `lib/services/ai/analytics-narrative.ts` is a real call site now classified as `workflow_automation`.
- Documented the second policy-wrap candidate in `PHASE_2_AI_POLICY_WRAP_CANDIDATE_2.md`.
- Wrapped `lib/services/ai/analyse-support-ticket.ts` with `support_ticket_analysis` policy guardrails without changing the Anthropic request contract.
- Added support ticket analysis preservation tests in `lib/services/ai/__tests__/analyse-support-ticket.test.ts`.

## AI Baseline Notes

Existing useful foundations:

- `lib/services/ai/anthropic-gateway.ts`
- `lib/ai/model-router.ts`
- `lib/ai/budget-guard.ts`
- `lib/usage/log-usage.ts`
- `lib/ai/byok-client.ts`
- `lib/ai/byok-vision-client.ts`
- `lib/ai/restoreassist-ai-client.ts`
- `lib/rag/retrieve.ts`
- `lib/rag/embed.ts`
- Prisma `AiUsageLog` and `IicrcChunk`

Primary gap:

- AI calls are spread across several direct provider paths and service wrappers. Phase 2 should inventory and migrate them through a central task policy/gateway one task at a time.

## AI Call-Site Inventory Slice

Audit command:

```bash
pnpm exec tsx scripts/audit-ai-call-sites.ts --json
```

Refined static inventory:

- source files scanned: 1,193
- AI/provider/RAG surfaces found: 88
- provider families: Anthropic 41, OpenAI 9, Gemini 17, RestoreAssist AI 14, BYOK 14, RAG/vector 18, local/hash fallback 7, unknown 3
- task classes: fast classification 16, support response draft 1, support ticket analysis 1, OCR/image understanding 41, report drafting 6, standards/RAG lookup 6, voice/realtime 2, workflow automation 5, embeddings 10, unknown 0

Runtime behavior changed: no provider/model/prompt/output-shape behavior changed. The support draft and support analysis helpers now fail closed if their task policies are missing.

Prompts/provider selection changed: no.

## Support Draft Policy Wrap Slice

Selected candidate:

- `lib/services/ai/draft-support-ticket.ts`
- task class: `support_response_draft`
- provider: existing Anthropic gateway
- model: `claude-haiku-4-5-20251001`
- max output tokens: unchanged at `1024`, now sourced from policy

Preserved behavior:

- no provider selection change.
- no prompt change.
- no user message shape change.
- no output shape change.
- no public route behavior change.
- no report, voice, OCR/image, or RAG workflow changed.

## Support Ticket Analysis Policy Wrap Slice

Selected candidate:

- `lib/services/ai/analyse-support-ticket.ts`
- task class: `support_ticket_analysis`
- provider: existing Anthropic gateway
- model: `claude-haiku-4-5-20251001`
- max output tokens: unchanged at `1024`, now sourced from policy

Preserved behavior:

- no provider selection change.
- no prompt change.
- no user message shape change.
- no output shape change.
- no public route behavior change.
- no report, voice, OCR/image, or RAG workflow changed.

Unknown inventory item result:

- `lib/services/ai/analytics-narrative.ts` is a real AI call site.
- It was not selected for policy wrapping in this slice because it drives dashboard-facing prose.
- It is now classified as `workflow_automation`; no AI task-class unknowns remain.

## Validation

Latest focused validation:

- `pnpm exec vitest run scripts/__tests__/audit-ai-call-sites.test.ts`: PASS, 1 file / 10 tests.
- `pnpm exec tsx scripts/audit-ai-call-sites.ts --json`: PASS, 88 call-site surfaces found.
- `pnpm exec vitest run lib/services/ai/__tests__/draft-support-ticket.test.ts`: PASS, 1 file / 6 tests.
- `pnpm exec vitest run lib/services/ai/__tests__/analyse-support-ticket.test.ts`: PASS, 1 file / 6 tests.
- `pnpm exec vitest run lib/ai/__tests__/usage-metadata.test.ts`: PASS, 1 file / 5 tests.
- `pnpm type-check`: PASS.
- `pnpm lint`: PASS with 0 errors and 838 existing warnings.
- `git diff --check`: PASS.
- `pnpm exec tsx scripts/audit-api-routes.ts --json`: PASS, 442 routes / 0 errors / 14 warnings.
- `pnpm --dir mobile --ignore-workspace type-check`: PASS.

## Cost Observability Gap Map Slice

Reviewed current AI inventory for usage/cost telemetry gaps:

- total AI/provider/RAG surfaces reviewed: 88.
- policy-wrapped surfaces: 2.
- missing local usage/cost logging evidence: 83.
- missing static tenant/account context evidence: 36.
- missing static max token/request guardrail evidence: 33.
- sensitive external-provider surfaces: 66.

Created `PHASE_2_AI_COST_OBSERVABILITY_GAP_MAP.md`.

Added non-invasive usage metadata foundation:

- `lib/ai/usage-metadata.ts`
- `lib/ai/__tests__/usage-metadata.test.ts`

The helper is pure. It performs no DB writes, no provider calls, no prompt changes, no model routing, and no runtime AI routing.

## Interview Question Policy And Metadata Slice

Selected candidate:

- `lib/services/ai/generate-interview-question.ts`
- task class: `fast_classification`
- provider: existing Anthropic fallback gateway
- model selection: unchanged, owned by existing fallback gateway/model helper
- max output tokens: unchanged at `500`

Added:

- `PHASE_2_AI_POLICY_WRAP_CANDIDATE_3.md`
- policy lookup via `fast_classification`
- pure usage metadata build with `providerFamily: "anthropic-platform"` and `userId: "system"`
- preservation tests in `lib/services/ai/__tests__/generate-interview-question.test.ts`

Preserved behavior:

- no provider selection change.
- no model selection change.
- no prompt change.
- no user message shape change.
- no output shape change.
- no public route behavior change.
- no DB writes.
- no new provider calls.
- no report, voice, OCR/image, or RAG workflow changed.

## Next Safe Action

Run final slice validation, commit the interview question policy/metadata wrapper, then consider `suggest-next-interview-question.ts` or `validate-interview-response.ts` as the next low-risk candidate.
