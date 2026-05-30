# Phase 2 AI Policy Wrap Candidate 5

Date: 2026-05-25

Branch: `codex/phase-2-ai-workflow-upgrades`

## Selected File/Module

- `lib/services/ai/suggest-next-interview-question.ts`
- Export: `suggestNextInterviewQuestion`

## Task Class

- `fast_classification`

## Current Provider/Model

Provider path:

- existing `callAnthropicWithFallback` service gateway.

Existing model fallback chain:

- `claude-haiku-4-5-20251001` with `maxTokens: 250`.
- `claude-3-5-haiku-20241022` with `maxTokens: 250`.

This slice must not change the provider gateway, fallback order, model names, max token values, or `agentName`.

## Current Prompt/Input/Output Shape

System prompt:

- asks for one targeted follow-up question for an Australian water-damage restoration technician.
- requires Australian English.
- blocks invented standards references.
- requires JSON-only response.

Input shape:

- `apiKey: string`.
- `answered: AnsweredQuestion[]`.
- `remaining: RemainingQuestion[]`.

Prompt preparation:

- caps answered questions to the last 40.
- caps remaining questions to the first 40.
- truncates field values to 500 characters.
- formats one user message containing prior answered questions and remaining template questions.

Output shape:

- valid suggestion: `{ question: string; reasoning: string }`.
- null/covered/parse fallback: `{ question: null; reason: string }`.
- gateway failure: existing `ServiceResult` failure with `AnthropicReason`.

## Why It Is Low Risk

- service-layer helper with focused tests already present.
- internal interview assistant helper, not final report generation.
- no public route behavior needs to change.
- no OCR/image, RAG/IICRC retrieval, voice/realtime, or customer-facing report finalisation path is touched.
- output contract is small and already covered by parse/fallback tests.
- provider/model/prompt preservation can be proven by asserting the gateway request.

## Usage Metadata Expected

Pure metadata only:

- `taskClass: "fast_classification"`.
- `providerFamily: "anthropic-platform"`.
- `tenantContext: { userId: "system" }`.
- `executionMode: "synchronous"`.

The metadata must be built and intentionally not persisted. No DB writes, usage log writes, budget mutations, or provider calls are added.

## What Must Not Change

- provider gateway.
- model names or model fallback order.
- prompt text.
- request shape.
- `max_tokens: 250`.
- `temperature: 0.4`.
- `agentName: "InterviewSuggestNext"`.
- output shape.
- parse fallback behavior.
- API route behavior.
- DB writes.
- provider call count.
- runtime routing.

## Tests To Prove Behaviour Preservation

Update `lib/services/ai/__tests__/suggest-next-interview-question.test.ts` to prove:

- `fast_classification` policy is selected.
- pure usage metadata is generated from the policy.
- unknown task policy fails closed through `requireAiTaskPolicy("unknown")`.
- gateway request preserves provider/model/prompt/request/output behavior.
- gateway is called exactly once.
- no DB write path is invoked or imported.
- no broad routing change occurs.

## Rollback Plan

Revert only:

- the import and metadata wrapper lines in `lib/services/ai/suggest-next-interview-question.ts`.
- the preservation test additions in `lib/services/ai/__tests__/suggest-next-interview-question.test.ts`.
- this candidate document and Phase 2 documentation updates.

Rollback does not require data migration because this slice adds no persistence and no runtime routing changes.
