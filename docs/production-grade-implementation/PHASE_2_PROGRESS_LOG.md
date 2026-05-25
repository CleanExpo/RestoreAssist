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
- task classes: fast classification 17, support response draft 1, OCR/image understanding 41, report drafting 6, standards/RAG lookup 6, voice/realtime 2, workflow automation 4, embeddings 10, unknown 1

Runtime behavior changed: no provider/model/prompt/output-shape behavior changed. The support draft helper now fails closed if its task policy is missing.

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

## Validation

Latest focused validation:

- `pnpm exec vitest run scripts/__tests__/audit-ai-call-sites.test.ts`: PASS, 1 file / 9 tests.
- `pnpm exec tsx scripts/audit-ai-call-sites.ts --json`: PASS, 88 call-site surfaces found.
- `pnpm exec vitest run lib/services/ai/__tests__/draft-support-ticket.test.ts`: PASS, 1 file / 6 tests.
- `pnpm type-check`: PASS.
- `pnpm lint`: PASS with 0 errors and 838 existing warnings.
- `git diff --check`: PASS.
- `pnpm exec tsx scripts/audit-api-routes.ts --json`: PASS, 442 routes / 0 errors / 14 warnings.
- `pnpm --dir mobile --ignore-workspace type-check`: PASS.

## Next Safe Action

Run final slice validation, commit the narrow policy-wrap slice, then review the single remaining unknown inventory item before selecting the next low-risk task.
