# Phase 2 AI Cost Observability Gap Map

Date: 2026-05-25

Branch: `codex/phase-2-ai-workflow-upgrades`

## Scope

This map reviews the current static AI inventory for cost and usage observability gaps. It does not approve production ship, does not change provider routing, and does not alter prompts, models, output shapes, public route behavior, report generation, voice/realtime, OCR/image, or RAG/IICRC retrieval.

Audit command:

```bash
pnpm exec tsx scripts/audit-ai-call-sites.ts --json
```

## Summary

- Total AI/provider/RAG surfaces reviewed: 88.
- Unknown task classes: 0.
- Surfaces already policy-wrapped: 5.
- Surfaces missing local usage/cost logging evidence: 83.
- Surfaces missing static tenant/account context evidence: 36.
- Surfaces missing static max token/request guardrail evidence: 33.
- Surfaces sending sensitive data to external providers: 66.

## Surfaces Already Policy-Wrapped

- `lib/services/ai/analyse-support-ticket.ts`
- `lib/services/ai/draft-support-ticket.ts`
- `lib/services/ai/generate-interview-question.ts`
- `lib/services/ai/suggest-next-interview-question.ts`
- `lib/services/ai/validate-interview-response.ts`

All wrappers preserve provider, model selection, prompt, request shape, max token value, and output shape. `generate-interview-question.ts`, `validate-interview-response.ts`, and `suggest-next-interview-question.ts` also attach pure usage metadata without DB persistence.

## Missing Usage Logging

Count: 83.

Representative groups:

- Route/API surfaces: vision, voice-note transcription, inspection content manifest, report assistance routes, onboarding status, Margot, GitHub webhook, and vectorisation routes.
- Service-layer AI helpers: technician analysis, analytics narrative, classifications, interview helpers, report synopsis/scope, sketch import, readings grouping, and standards extraction.
- Provider/gateway infrastructure: Anthropic gateway, BYOK clients, RestoreAssist AI client, model router, budget guard, workspace provider connections.
- RAG/vector/indexing: standards retrieval, embeddings, ingestion scripts.
- UI/client-facing AI surfaces: dashboard contents/voice/integrations/settings pages.

Current observation: usage telemetry is not consistently attached at the call-site boundary. The next implementation slices should add metadata first, then wire DB persistence only where tenant context and existing `logAiUsage` semantics are clear.

## Missing Tenant / Account Context

Count: 36.

Representative groups:

- voice/transcription and live-teacher support modules.
- dashboard/client surfaces that reference AI/provider capability.
- provider libraries and model metadata modules.
- cron/agent helpers.
- RAG/standards ingestion and retrieval scripts.
- static knowledge/citation/gap-analysis helpers.

Current observation: some surfaces are platform/system tasks where tenant context may be intentionally unavailable. Those must mark tenant/account context as `not_required` or `unavailable` explicitly before DB logging is introduced.

## Missing Max Token / Request Guardrails

Count: 33.

Representative groups:

- several API route surfaces that call helpers indirectly.
- dashboard/provider UI surfaces.
- RAG/vector/indexing scripts.
- local/hash fallback and metadata-only modules.
- provider metadata and logging helper files.

Current observation: many service-layer calls already include `max_tokens` or max constants, but route and infrastructure surfaces are inconsistent. Policy metadata should be introduced before runtime routing changes so guardrail expectations are inspectable.

## High-Cost Risk Candidates

Do not migrate these first. They touch premium models, evidence media, report generation, voice/realtime, RAG, or broad provider infrastructure:

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

## Low-Risk Next Candidates

The previously recommended low-risk candidate has now been wrapped:

- `lib/services/ai/suggest-next-interview-question.ts`

No further service-layer helper should be selected automatically without a fresh inventory review. The next low-risk work should either tighten the non-runtime audit/test gate or document an owner-reviewed candidate before runtime changes.

`lib/services/ai/anthropic-gateway.ts` is low-level infrastructure, not a first-choice migration target. It should be instrumented only after enough service-layer call sites produce consistent metadata.

## Do-Not-Touch-Yet Candidates

Do not change in the next narrow slices:

- final report generation and customer-facing report generation.
- voice/realtime and live-teacher flows.
- OCR/image and evidence-media flows.
- RAG/IICRC standards retrieval and ingestion.
- broad provider routing, BYOK dispatch, and model router.
- public route behavior.

## Metadata Foundation Added

Added pure helper:

- `lib/ai/usage-metadata.ts`

The helper:

- builds usage metadata from `lib/ai/task-policy.ts`.
- returns blocked metadata for missing/unknown task policy.
- keeps estimated cost optional when token counts are unavailable.
- marks tenant/account context as `present`, `not_required`, or `unavailable`.
- performs no DB writes.
- performs no provider calls.
- changes no runtime routing.

Focused tests:

- `lib/ai/__tests__/usage-metadata.test.ts`
- `lib/services/ai/__tests__/generate-interview-question.test.ts`
- `lib/services/ai/__tests__/suggest-next-interview-question.test.ts`
- `lib/services/ai/__tests__/validate-interview-response.test.ts`

## Recommended Implementation Sequence

1. Keep using static inventory to pick one low-risk service-layer task at a time.
2. Require task policy and build pure usage metadata at the service boundary.
3. Assert provider/model/prompt/output preservation in focused tests.
4. Add DB usage logging only where tenant context is present or explicitly not required and existing `logAiUsage` semantics match the task.
5. Defer high-cost areas until policy wrapping, telemetry metadata, and focused tests are stable across low-risk services.
6. Defer broad model routing until cost metadata and logging coverage are visible.

## Next Safe Slice

Do not add DB writes yet. The next safe slice is a non-runtime audit/test gate or an owner-reviewed candidate selection pass. Shared gateways, provider routing, report generation, OCR/image, RAG/IICRC, and voice/realtime remain out of scope.
