# Phase 2 AI Guardrail Consolidation Report

Date: 2026-05-25

Branch: `codex/phase-2-ai-workflow-upgrades`

## Scope

This report consolidates the Phase 2 AI guardrail work completed so far. It does not approve production ship, does not change provider/model routing, and does not alter prompts, output shapes, public route behavior, DB writes, final report generation, customer-facing report generation, voice/realtime, OCR/image, or RAG/IICRC standards retrieval.

Audit command:

```bash
pnpm exec tsx scripts/audit-ai-call-sites.ts --json
```

## Current Inventory

- Total AI/provider/RAG surfaces: 88.
- Unknown task classes: 0.
- Policy-wrapped surfaces: 4.
- Unwrapped surfaces: 84.
- Source files scanned by audit: 1,194.

## Policy-Wrapped Surfaces

- `lib/services/ai/draft-support-ticket.ts` -> `support_response_draft`.
- `lib/services/ai/analyse-support-ticket.ts` -> `support_ticket_analysis`.
- `lib/services/ai/generate-interview-question.ts` -> `fast_classification`.
- `lib/services/ai/validate-interview-response.ts` -> `fast_classification`.

All four wrappers preserve provider, model selection, prompt, request shape, max token value, and output shape. The two interview wrappers also attach pure usage metadata without DB persistence.

## Unwrapped Surfaces By Task Class

| Task class | Unwrapped count |
| --- | ---: |
| OCR/image understanding | 41 |
| Fast classification | 14 |
| Embeddings | 10 |
| Report drafting | 6 |
| Standards/RAG lookup | 6 |
| Workflow automation | 5 |
| Voice/realtime | 2 |

## Highest-Cost-Risk Surfaces

Highest-cost risk is concentrated in premium model, media, report, voice/realtime, RAG, and broad provider infrastructure areas:

- `app/api/ai/vision/route.ts`
- `app/api/ai/voice-note-transcribe/route.ts`
- `app/api/reports/generate-enhanced/route.ts`
- `app/api/reports/generate-inspection-report/route.ts`
- `lib/ai/byok-vision-client.ts`
- `lib/ai/model-router.ts`
- `lib/ai/restoreassist-ai-client.ts`
- `lib/assessments/ai-prose.ts`
- `lib/live-teacher/claude-cloud.ts`
- `lib/margot-image-gen.ts`
- `lib/revolutionary-gap-analysis.ts`
- `lib/services/ai/analyse-technician-report.ts`
- `lib/services/ai/extract-reading.ts`
- `lib/services/ai/generate-enhanced-report.ts`
- `lib/services/ai/generate-scope.ts`
- `lib/services/ai/import-sketch-from-image.ts`
- `lib/services/ai/standards/analyze-standards-folder.ts`
- `lib/services/ai/standards/extract-standards-sections.ts`
- `lib/workspace/provider-connections.ts`

These should not be migrated until the policy/metadata pattern is formally accepted and reviewed against tenant context, sensitive data handling, cost caps, and rollback.

## Highest-Sensitive-Data-Risk Surfaces

Sensitive external-provider risk remains concentrated in:

- route-level vision/report/Margot/claims/webhook surfaces:
  - `app/api/ai/vision/route.ts`
  - `app/api/ai/voice-note-transcribe/route.ts`
  - `app/api/chatbot/route.ts`
  - `app/api/claims/analyze-batch/route.ts`
  - `app/api/inspections/[id]/contents-manifest/route.ts`
  - `app/api/inspections/contents-manifest/route.ts`
  - `app/api/margot/chat/route.ts`
  - `app/api/margot/corpus/status/route.ts`
  - `app/api/onboarding/status/route.ts`
  - `app/api/reports/generate-inspection-report/route.ts`
  - `app/api/webhooks/github/route.ts`
- BYOK and provider connection infrastructure:
  - `lib/ai-provider.ts`
  - `lib/ai/byok-client.ts`
  - `lib/ai/byok-vision-client.ts`
  - `lib/ai/workspace-byok-dispatch.ts`
  - `lib/workspace/provider-connections.ts`
- embeddings, standards, and retrieval ingestion:
  - `lib/rag/embed.ts`
  - `lib/services/ai/standards/analyze-standards-folder.ts`
  - `lib/services/ai/standards/extract-standards-sections.ts`
  - `scripts/ingest-standards.ts`
- evidence-media and technician-analysis services:
  - `lib/services/ai/analyse-technician-report.ts`
  - `lib/services/ai/auto-classify-photo.ts`
  - `lib/services/ai/classify-inspection.ts`
  - `lib/services/ai/extract-reading.ts`
  - `lib/services/ai/extract-report-from-upload.ts`
  - `lib/services/ai/group-readings.ts`
  - `lib/services/ai/import-sketch-from-image.ts`
- report/scope/synopsis and customer-facing prose services:
  - `lib/services/ai/generate-client-summary.ts`
  - `lib/services/ai/generate-enhanced-report.ts`
  - `lib/services/ai/generate-scope.ts`
  - `lib/services/ai/report-synopsis.ts`
  - `lib/assessments/ai-prose.ts`
  - `lib/claim-analysis-engine.ts`
- remaining low-risk interview helper:
  - `lib/services/ai/suggest-next-interview-question.ts`

Static audit count: 62 unwrapped surfaces send or may send sensitive data externally.

## Safest Next Low-Risk Candidates

The safest remaining implementation candidate is:

- `lib/services/ai/suggest-next-interview-question.ts`

It is service-layer, already covered by focused tests, uses the same Anthropic fallback gateway pattern, and has a clear output contract:

- valid JSON returns `{ question: string, reasoning: string }`.
- explicit/null or parse fallback returns `{ question: null, reason: string }`.
- gateway errors propagate existing Anthropic reasons.

`lib/services/ai/anthropic-gateway.ts` is not a first-choice candidate because it is shared infrastructure. It should be changed only after the service-boundary pattern is accepted.

## Do-Not-Touch-Yet Surfaces

Do not touch these categories until architecture review and additional evidence gates are complete:

- final report generation.
- customer/insurance-facing report generation.
- voice/realtime and live-teacher flows.
- OCR/image/evidence-media workflows.
- RAG/IICRC standards retrieval and ingestion.
- broad provider routing, BYOK dispatch, and model router.
- public route behavior.

## Should `suggest-next-interview-question.ts` Be Wrapped Next?

Yes, but not in this slice.

It is the most reasonable next implementation slice after reviewers accept the documented policy adoption standard. It should be wrapped with:

- `fast_classification` task policy.
- pure `buildAiUsageMetadata`.
- no DB writes.
- no provider/model/prompt/output changes.
- focused preservation tests that pin the existing fallback chain, request shape, parse fallback behavior, and single gateway call.

## Architectural Standard Decision

Chosen next safe slice: **C. Add documentation-only architecture standard for AI policy adoption.**

Reason:

- Four service wrappers now use the same pattern.
- The pattern is still intentionally narrow and pure.
- Before expanding into shared gateways, DB-backed logging, or high-risk task classes, reviewers need an explicit standard for what future AI service changes must preserve and verify.

The current pattern is ready to become an enforced architectural standard for low-risk service-layer AI wrappers only. It is not yet ready for enforcement across all AI surfaces or shared provider infrastructure.

## AI Policy Adoption Standard

For each new low-risk service-layer AI wrapper:

1. Document the candidate before code changes.
2. Use an existing task class or add a narrowly named task policy.
3. Require task policy before the provider call.
4. Build pure usage metadata from task policy at the service boundary.
5. Do not persist usage metadata until tenant/account context and logging semantics are reviewed.
6. Preserve provider, model selection, prompt, request shape, max token value, output shape, and route behavior.
7. Add focused tests proving:
   - correct task policy is selected.
   - usage metadata is generated from policy.
   - unknown policy fails closed.
   - provider/model/prompt/request/output behavior is unchanged.
   - no extra provider call occurs.
   - no DB write occurs.
8. Run the Phase 2 validation gates before commit.

## Before DB-Backed Usage Logging

Before adding any `logAiUsage` DB writes:

- confirm tenant/account context for the specific service.
- define whether platform/admin/system flows require workspace attribution or explicit `not_required`.
- confirm token usage source and behavior when tokens are unavailable.
- define failure semantics: logging must never fail user requests.
- map provider family/model names to existing Prisma `AiProvider` values.
- decide whether estimated cost comes from provider usage, `estimateCostUsd`, task policy caps, or stays undefined.
- add tests proving no user-facing output changes and no logging error leaks.

## Before Model Routing Changes

Before changing model routing:

- complete policy wrapping for low-risk services.
- add tests for task class -> allowed provider families.
- add tests for fallback permission and max estimated cost caps.
- document rollback per task class.
- keep existing provider/model selections until the router has per-task tests and cost guardrails.
- do not route report, voice, OCR/image, or RAG tasks through new logic first.

## Before OCR/RAG/Report/Voice Tasks

Before touching these high-risk categories:

- complete architecture review of the policy standard.
- add runtime or integration evidence for sensitive data handling.
- confirm tenant/account context and retention expectations.
- add task-specific cost caps and fallback restrictions.
- add representative fixtures and preservation tests.
- define rollback and manual review owner.
- keep Phase 1 blockers visible.

## Validation Plan

Required validation for this consolidation slice:

- `pnpm exec vitest run scripts/__tests__/audit-ai-call-sites.test.ts`
- `pnpm exec tsx scripts/audit-ai-call-sites.ts --json`
- `pnpm exec vitest run lib/ai/__tests__/usage-metadata.test.ts`
- `pnpm type-check`
- `pnpm lint`
- `git diff --check`
- `pnpm exec tsx scripts/audit-api-routes.ts --json`
- `pnpm --dir mobile --ignore-workspace type-check`

## Next Safe Action

Review and approve the documented AI policy adoption standard. After review, wrap `lib/services/ai/suggest-next-interview-question.ts` with `fast_classification` policy and pure usage metadata only.
