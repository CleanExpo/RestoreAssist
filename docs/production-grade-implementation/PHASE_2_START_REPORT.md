# Phase 2 Start Report

Date: 2026-05-25

Worktree: `/private/tmp/RestoreAssist-phase1-main`

## Baseline

- Source branch: `codex/phase-1-production-readiness-clean`
- New Phase 2 branch: `codex/phase-2-ai-workflow-upgrades`
- Baseline commit: `c2821eec docs(phase1): add review ready handoff`
- Protected dirty artifact carried in worktree only: `.github/PULL_REQUEST_TEMPLATE.md`
- Protected artifact status: unstaged, uncommitted, and not part of Phase 2.

Phase 1 is review-ready but not ship-approved. Phase 2 starts from this review baseline without merging or approving `/shipit`.

## Phase 1 Blockers Carried Forward

These blockers remain visible and must not be hidden, removed, or treated as resolved by Phase 2:

1. 14 public-route owner/security sign-offs.
2. Mobile offline simulator/device evidence.
3. Supabase anon-policy release-day/manual revalidation.
4. Vercel TLS release-day confirmation.
5. PR template case-collision artifact handled separately outside this branch.

Current ship decision remains **DO NOT SHIP**.

## Phase 2 Objectives

Improve RestoreAssist's AI-native workflow capability without weakening Phase 1 production hardening.

Priority order:

1. AI orchestration/model routing.
2. AI cost controls and usage accounting.
3. RAG/IICRC retrieval validation.
4. OCR/image pipeline improvements.
5. Voice workflow improvements only if session persistence remains safe.
6. Sketch/floorplan workflow acceleration.
7. Technician workflow automation.
8. Report generation assistance and quality checks.

## Phase 2 Non-Goals

- Do not merge Phase 1.
- Do not approve `/shipit`.
- Do not hide or remove Phase 1 blockers.
- Do not touch `.github/PULL_REQUEST_TEMPLATE.md`.
- Do not touch `.agents/skills/appshots/`.
- Do not start broad refactors.
- Do not redesign UI before workflow architecture is stable.
- Do not change public-route behavior unless directly required and tested.
- Do not copy competitor IP.
- Do not start Phase 3.

## Source Documents Read

- `AI_STACK_RECOMMENDATIONS.md`
- `PHASE_2_AI_AND_WORKFLOW_UPGRADES.md`
- `SYSTEM_ARCHITECTURE.md`
- `COST_OPTIMIZATION_PLAN.md`
- `UX_REDESIGN.md`
- `FINAL_SHIPIT_READINESS_REPORT.md`
- `PHASE_1_REVIEW_READY_HANDOFF.md`

## Baseline AI Inspection

Initial no-code inspection found multiple existing AI surfaces:

- `lib/services/ai/anthropic-gateway.ts`: structured Anthropic gateway with fallback and streaming helpers.
- `lib/ai/model-router.ts`: existing task-tier router for basic vs premium tasks.
- `lib/ai/budget-guard.ts`: workspace daily AI spend guard.
- `lib/usage/log-usage.ts`: async `AiUsageLog` persistence and token-cost estimation.
- `lib/ai/byok-client.ts` and `lib/ai/byok-vision-client.ts`: BYOK dispatch paths.
- `lib/ai/restoreassist-ai-client.ts`: RestoreAssist-hosted model client with BYOK fallback.
- `lib/rag/retrieve.ts`, `lib/rag/embed.ts`, and `IicrcChunk`: current RAG/vector foundation.
- many direct provider call sites still exist across Anthropic, OpenAI, Gemini, vision, RAG, report, support, live-teacher, and workflow modules.

Phase 2 should begin by inventorying and wrapping these paths rather than adding a new parallel AI subsystem.

## Validation Gates

After each meaningful implementation slice:

```bash
pnpm type-check
pnpm lint
pnpm exec vitest run
pnpm build
pnpm audit --audit-level=high --prod
git diff --check
```

Targeted tests must also run for changed modules.

Keep these checks visible during Phase 2:

```bash
pnpm exec tsx scripts/audit-api-routes.ts --json
pnpm --dir mobile --ignore-workspace type-check
cd mobile && pnpm exec vitest run --config vitest.config.ts
```

## Rollback Plan

- Keep legacy AI service paths callable while migrating task-by-task.
- Add gateway/routing changes behind typed policy modules and tests before moving call sites.
- Keep existing sketch JSON canonical until RoomGraph is proven.
- Keep report generation legacy paths available until source-linked draft pipeline is accepted.
- Treat AI photo tags and workflow suggestions as non-blocking drafts.
- Disable realtime/voice upgrades independently from transcription.
- Roll back any unsafe AI routing by restoring the prior task call site and keeping the Phase 1 hardening commits intact.

## First Safe Implementation Slice

First slice status: queued with no application code changes.

First safe implementation slice:

1. Build a read-only AI call-site inventory.
2. Categorize each call by task type, provider, model, cost guard, usage logging, fallback behavior, schema validation, and data sensitivity.
3. Add tests around existing routing and budget behavior before changing call sites.
4. Propose a central task-policy module that can wrap existing `model-router`, `budget-guard`, `logAiUsage`, BYOK clients, and `anthropic-gateway`.

Acceptance for the first slice:

- no production AI behavior changes until inventory and tests are in place.
- Phase 1 blockers remain visible.
- protected paths remain untouched.
