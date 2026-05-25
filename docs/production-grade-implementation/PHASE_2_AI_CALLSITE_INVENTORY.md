# Phase 2 AI Call-Site Inventory

Date: 2026-05-25

Branch: `codex/phase-2-ai-workflow-upgrades`

## Scope

This inventory is the first safe Phase 2 implementation slice. It adds static, non-runtime visibility into RestoreAssist AI/provider call sites without changing production AI behavior.

Runtime behavior changed: no.

Prompts changed: no.

Provider selection changed: no.

External dependencies added: no.

## Artifacts Added

- `scripts/audit-ai-call-sites.ts`
- `scripts/__tests__/audit-ai-call-sites.test.ts`
- `lib/ai/task-policy.ts`

## Audit Result

Command:

```bash
pnpm exec tsx scripts/audit-ai-call-sites.ts --json
```

Result:

- source files scanned: 1,193
- AI/provider/RAG surfaces found: 117

Provider-family counts:

| Provider family | Count |
| --- | ---: |
| Anthropic | 41 |
| OpenAI | 9 |
| Gemini | 17 |
| RestoreAssist AI / self-hosted | 14 |
| BYOK | 50 |
| RAG/vector | 18 |
| Local/hash fallback | 7 |
| Unknown provider surface | 2 |

Task-class counts:

| Task class | Count |
| --- | ---: |
| Fast classification | 7 |
| OCR/image understanding | 41 |
| Report drafting | 20 |
| Standards/RAG lookup | 7 |
| Voice/realtime | 22 |
| Workflow automation | 4 |
| Embeddings | 10 |
| Unknown | 6 |

## What The Audit Answers

### Where are AI calls made?

AI/provider/RAG surfaces are spread across:

- `app/api/**` route handlers for vision, voice, reports, inspections, interviews, Margot, workspace provider connections, and webhooks.
- `lib/services/ai/**` service wrappers.
- `lib/ai/**` router, BYOK, RestoreAssist AI, embeddings, lifecycle, and budget modules.
- `lib/rag/**` and standards retrieval modules.
- selected ingestion/vectorisation scripts.

### Which provider/model is used?

The static audit detects provider families and model hints, including:

- Anthropic models such as Claude Haiku/Sonnet/Opus variants.
- OpenAI chat/embedding/STT surfaces, including `text-embedding-3-small` where explicit.
- Gemini surfaces including `gemini-3.1-*` and older Gemini pricing/model references.
- RestoreAssist AI / Gemma surfaces.
- BYOK dispatch surfaces.
- deterministic RAG/vector and local/hash fallback surfaces.

Some model names remain dynamic because current code passes model values through variables or provider connection settings.

### Which task class does each call belong to?

The new `lib/ai/task-policy.ts` defines these initial task classes:

- `fast_classification`
- `ocr_image_understanding`
- `report_drafting`
- `standards_rag_lookup`
- `voice_realtime`
- `workflow_automation`
- `embeddings`
- `unknown`

The audit assigns a best-effort class from file path and source patterns. Unknown classifications remain review prompts, not failures.

### Is the call tenant/account aware?

The audit marks call sites as tenant-aware when source includes workspace, organization, member, tenant, or user context. This is a static indicator only. The next slice should verify the actual runtime context passed into each migrated call.

### Is usage/cost observable?

The audit marks usage/cost observability when a call site includes `logAiUsage`, direct `aiUsageLog` usage, or related telemetry. Current result shows many service-level call sites still lack local usage logging evidence and should be migrated through a central policy/gateway path before provider changes.

### Is there fallback behavior?

Fallback is detected through patterns such as `fallback`, `tryClaudeModels`, `fellBack`, or `allowsFallback`. Current fallback behavior is inconsistent and should be normalized by task policy so cheap-model failure cannot silently escalate to expensive premium calls.

### Is there a max token/request guardrail?

The audit checks for `max_tokens`, `maxTokens`, policy token caps, timeout, and common max constants. Many call sites have local token guards, but request/cost caps are not centrally enforced yet.

### Is the call synchronous, queued, or background?

The audit classifies execution mode as `synchronous`, `queued`, `background`, or `unknown` from route/script/source patterns. This is useful for separating interactive field workflows from batch/report work.

### Is sensitive data sent externally?

The audit marks external sensitivity when source uses Anthropic, OpenAI, Gemini, or BYOK provider families outside tests. This is conservative and should drive data-class review before migrating or changing providers.

## Initial Task Policy

`lib/ai/task-policy.ts` documents initial policy defaults for:

- allowed provider families.
- default latency class.
- data class.
- max input/output tokens.
- max estimated cost.
- tenant context requirements.
- usage logging requirements.
- budget check requirements.
- fallback policy.

This policy is not wired into runtime behavior yet. It is a guardrail/test foundation for future migration.

## High-Risk Follow-Up Areas

Review these areas before any provider routing changes:

- OCR/image flows with evidence media: `app/api/ai/vision/route.ts`, `lib/ai/byok-vision-client.ts`, `lib/services/ai/*image*`, `lib/services/ai/extract-reading.ts`, `lib/services/ai/import-sketch-from-image.ts`.
- Report drafting and report assistance: `lib/services/ai/generate-enhanced-report.ts`, `lib/services/ai/generate-scope.ts`, `lib/reports/generate-report-ai.ts`, report API routes.
- Voice/realtime: `app/api/ai/voice-note-transcribe/route.ts`, `lib/voice/*`, voice inspection routes.
- Standards/RAG and embeddings: `lib/rag/*`, `scripts/ingest-standards.ts`, vectorisation routes, standards analysis services.
- BYOK/provider connection validation: `lib/workspace/provider-connections.ts`, workspace provider routes.

## Known Limitations

- This is a static source scan, not a runtime trace.
- Task classification is best-effort and intentionally conservative.
- Dynamic model strings are reported as `dynamic-model-field`.
- Some provider-family detections are based on helper names rather than direct SDK calls.
- The script ignores test/spec files so the report reflects runtime/source surfaces.
- It does not fail the build; it provides inventory for the next migration slice.

## Validation

Focused validation:

- `pnpm exec vitest run scripts/__tests__/audit-ai-call-sites.test.ts`: PASS, 1 file / 6 tests.
- `pnpm exec tsx scripts/audit-ai-call-sites.ts --json`: PASS, 117 call-site surfaces found.

Visibility checks:

- `pnpm exec tsx scripts/audit-api-routes.ts --json`: PASS, 442 routes / 0 errors / 14 warnings.
- `pnpm --dir mobile --ignore-workspace type-check`: PASS.
- `cd mobile && pnpm exec vitest run --config vitest.config.ts`: PASS, 2 files / 7 tests.

## Next Safe Implementation Slice

Do not reroute production calls yet.

Next slice:

1. Tighten the audit script with reviewed false-positive/false-negative cases from the 117-call inventory.
2. Add task-policy tests for cost caps, fallback permission, and required tenant/usage/budget flags.
3. Select one low-risk migrated task, likely support-ticket draft or interview question suggestion.
4. Wrap that one task with policy, budget estimate, and usage logging while preserving existing provider/prompt behavior.
5. Run targeted service tests plus root validation.

Acceptance for the next slice:

- one low-risk task uses policy guardrails.
- provider and prompt remain unchanged.
- no silent expensive fallback is introduced.
- Phase 1 blockers and API warnings remain visible.
