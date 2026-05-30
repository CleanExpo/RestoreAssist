# Phase 2 Execution Plan

Date: 2026-05-25

Branch: `codex/phase-2-ai-workflow-upgrades`

## Execution Stance

Phase 2 improves AI/workflow capability only after preserving Phase 1 hardening. The first implementation work must consolidate and test existing AI routing/cost controls before OCR, RAG, voice, sketch, or workflow upgrades.

## Workstreams

| Workstream | Implementation order | Likely files/modules affected | Risk | Expected outcome | Tests required | Acceptance criteria | Rollback notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| AI call-site inventory | 1 | `lib/services/ai/*`, `lib/ai/*`, `lib/ai-provider.ts`, `lib/anthropic.ts`, `app/api/**`, `scripts/**` | Low | Known map of unmanaged and duplicate AI calls. | inventory script or focused unit tests if script is added; `git diff --check` | Every paid/model call is categorized by task, provider, budget, logging, and fallback status. | Docs/script can be removed without behavior impact. |
| Central task policy | 2 | new `lib/ai-gateway/task-policy.ts` or existing `lib/ai/model-router.ts` extension | Medium | One typed policy for task class, model tier, max tokens, max estimated cost, fallback, and data class. | unit tests for each task rule and unknown-task rejection | No silent model selection; unknown/expensive tasks fail closed or require explicit policy. | Revert policy module and keep existing router behavior. |
| Cost guard integration | 3 | `lib/ai/budget-guard.ts`, `lib/usage/log-usage.ts`, gateway wrappers, AI service tests | Medium | Per-workspace/task budget checks become part of migrated AI calls. | budget guard tests, usage logging tests, migrated service tests | Paid migrated calls estimate cost before provider call and log usage after completion/failure. | Feature flag or task-by-task rollback to previous call path. |
| Provider-neutral gateway wrapper | 4 | new `lib/ai-gateway/*`, existing `lib/services/ai/anthropic-gateway.ts`, `lib/ai/byok-client.ts`, `lib/ai/byok-vision-client.ts`, `lib/ai/restoreassist-ai-client.ts` | High | A gateway facade routes Anthropic/OpenAI/Gemini/BYOK/self-hosted calls with shared policy and telemetry. | gateway routing, fallback, schema, redaction, and cost tests | Low-risk task migrated first; no direct provider leakage to route handlers for migrated tasks. | Keep old service function and route back to it. |
| RAG/IICRC validation | 5 | `lib/rag/*`, `scripts/ingest-iicrc.ts`, `lib/ai/rag-context.ts`, report services | Medium | Retrieval has edition/section/jurisdiction filters and false-citation evals. | known-clause retrieval tests, false-citation eval test | Models can summarize only retrieved chunks; invented citations are rejected. | Keep deterministic retrieval-only path. |
| OCR/image pipeline | 6 | `lib/ai/byok-vision-client.ts`, `lib/services/ai/extract-reading.ts`, `lib/services/ai/import-sketch-from-image.ts`, `lib/media/*`, photo routes | Medium | Better OCR/photo quality/label suggestions with budget gates. | vision route tests, media validation tests, cost guard tests | Image/OCR calls are routed, capped, logged, and draft-only. | Disable AI image suggestions and keep upload validation. |
| Voice workflow | 7 | `lib/voice/*`, voice API routes, `VoiceCopilotSession`, `VoiceCopilotObservation` | Medium | Voice observations can improve only on top of persisted sessions. | session persistence, observation confirmation, runtime/cost guard tests | No realtime upgrade unless session persistence and max runtime guard pass. | Disable realtime; keep transcription and persisted observations. |
| Sketch/floorplan workflow | 8 | sketch modules/routes, future RoomGraph/EvidencePin models | High | Existing sketch JSON can be converted toward RoomGraph without replacing canonical storage. | conversion tests, geometry tests, route tests | RoomGraph is derived/provisional until accepted. | Keep existing sketch JSON canonical. |
| Technician automation/report assist | 9 | report services, completeness checks, technician capture modules | High | AI suggestions guide capture and report drafting with evidence links. | completeness, report draft, evidence link, citation tests | Suggestions are editable drafts and link to evidence/citations. | Disable suggestions; keep deterministic report generation. |

## Model Routing Rules

| Task class | Default routing | Fallback | Required guardrails |
| --- | --- | --- | --- |
| Fast/cheap classification | RestoreAssist-hosted low-cost model or approved mini/flash model | BYOK only if policy allows and cost cap permits | schema validation, max tokens, low per-call cap, usage log |
| OCR/image understanding | deterministic OCR/media checks first, then low-cost vision model | premium vision only for blocking capture/report tasks | magic-byte validation, image count/size caps, budget guard, draft-only result |
| Report drafting | premium approved model only through task policy | alternate premium provider only if cost cap and data policy allow | subscription gate, evidence hash/versioning, citation/RAG gate, usage log |
| Standards/RAG lookup | deterministic retrieval first | model summarizes retrieved chunks only | edition/section/jurisdiction filters, false-citation rejection |
| Voice/realtime flows | persisted session + max runtime guard before paid realtime | cheaper STT plus text model fallback | session timeout, silence/lifecycle stop, budget guard, transcript persistence |

## Implementation Order

1. Inspect existing AI service layer and model/provider usage.
2. Identify duplicate or unmanaged AI calls.
3. Design central AI orchestration layer around existing modules.
4. Add typed model-routing/task-policy rules.
5. Add cost controls: per-tenant usage logging, token/cost estimation, request caps, fallback rules, and no silent expensive model calls.
6. Add tests around routing and cost guardrails.
7. Migrate one low-risk AI task.
8. Only then proceed to OCR/RAG/workflow improvements.

## Tests Required

- Task policy rejects unknown tasks and disallowed providers.
- Routing chooses cheap/default models for classification.
- Routing chooses OCR/image-capable policy for image tasks.
- Report drafting requires premium policy, subscription/budget gate, and citation path.
- RAG lookup cannot invent citations outside retrieved chunks.
- Budget guard blocks projected overspend and logs usage on success/failure.
- Fallbacks respect cost and data-class policy.
- Migrated route/service tests confirm client-safe errors remain generic.
- Existing Phase 1 audit checks remain visible.

## Acceptance Criteria

- First migrated task uses the central policy/gateway path.
- Every migrated paid AI call has an explicit task type, cost estimate, max-token/request cap, fallback policy, and usage log.
- No silent expensive fallback is possible.
- Existing Phase 1 API audit remains 0 errors.
- Phase 1 public-route warnings remain visible.
- No mobile or public-route behavior changes are introduced by the AI gateway slice.

## Explicit Do Not Touch Yet

- `.github/PULL_REQUEST_TEMPLATE.md`
- `.agents/skills/appshots/`
- public-route behavior and exception scanner suppression
- broad UI redesign or technician cockpit UI
- RoomGraph/Prisma schema changes before gateway/cost tests
- OCR/image provider swaps before routing/cost policy exists
- realtime voice provider changes before voice runtime/cost guards
- report generation rewrites before RAG/citation evals
- Phase 3 work

## Rollback Notes

- Gateway adoption must be task-by-task.
- Keep existing service functions as fallback during migration.
- Use feature flags or task-policy switches for migrated tasks.
- Any failed validation reverts the migrated call site, not Phase 1 hardening.
- Documentation-only planning can be reverted without runtime impact.
