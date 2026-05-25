# Phase 2 Progress Log

Date: 2026-05-25

Branch: `codex/phase-2-ai-workflow-upgrades`

## Current Status

Phase 2 has started from the Phase 1 review-ready baseline. No application code has been modified.

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

Current static inventory:

- source files scanned: 1,193
- AI/provider/RAG surfaces found: 117
- provider families: Anthropic 41, OpenAI 9, Gemini 17, RestoreAssist AI 14, BYOK 50, RAG/vector 18, local/hash fallback 7, unknown 2
- task classes: fast classification 7, OCR/image understanding 41, report drafting 20, standards/RAG lookup 7, voice/realtime 22, workflow automation 4, embeddings 10, unknown 6

Runtime behavior changed: no.

Prompts/provider selection changed: no.

## Validation

Latest focused validation:

- `pnpm exec vitest run scripts/__tests__/audit-ai-call-sites.test.ts`: PASS, 1 file / 6 tests.
- `pnpm exec tsx scripts/audit-ai-call-sites.ts --json`: PASS.
- `pnpm exec tsx scripts/audit-api-routes.ts --json`: PASS, 442 routes / 0 errors / 14 warnings.
- `pnpm --dir mobile --ignore-workspace type-check`: PASS.
- `cd mobile && pnpm exec vitest run --config vitest.config.ts`: PASS, 2 files / 7 tests.
- `pnpm type-check`: PASS.
- `pnpm lint`: PASS with 0 errors and 838 warnings.
- `git diff --check`: PASS.

## Next Safe Action

Run full slice validation, then select one low-risk task for policy wrapping without changing provider or prompt behavior.
