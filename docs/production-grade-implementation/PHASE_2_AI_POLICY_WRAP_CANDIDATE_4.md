# Phase 2 AI Policy Wrap Candidate 4

Date: 2026-05-25

Branch: `codex/phase-2-ai-workflow-upgrades`

## Selected Candidate

- File/module: `lib/services/ai/validate-interview-response.ts`
- Function: `validateInterviewResponse`
- Task class: `fast_classification`
- Route/user surface: guided inspection interview answer validation helper.
- Current provider: Anthropic through existing `callAnthropicWithFallback` gateway.
- Current model selection: explicit existing fallback chain:
  - `claude-haiku-4-5-20251001`
  - `claude-3-5-haiku-20241022`

## Rejected Fallback

- File/module: `lib/services/ai/suggest-next-interview-question.ts`
- Reason rejected for this slice: also low risk, but `validate-interview-response.ts` has the clearer bounded output contract for preservation tests: gateway failures propagate, malformed JSON returns `ok({ findings: [] })`, and valid JSON normalises to a fixed findings array shape.

## Current Prompt / Input / Output Shape

Current system prompt:

- IICRC S500:2021 compliance reviewer for Australian water-damage restoration inspections.
- flags inconsistent, missing, or non-compliant interview answers.
- requires specific `S500:2021 §X.Y` citations in messages.
- returns JSON only with a `findings` array.
- clean answers return `{"findings": []}`.

Current input shape:

- `apiKey: string`
- `answered: AnsweredQuestionForValidation[]`
- each answer may include `questionId`, `questionText`, and `answer`.

Current gateway request shape:

- `userId: "system"`
- resolved `apiKey` override.
- `system: SYSTEM_PROMPT`.
- `max_tokens: 1200`.
- `temperature: 0.2`.
- one user message containing formatted answered questions and validation instruction.
- existing model fallback chain unchanged.
- `agentName: "InterviewValidate"`.

Current output shape:

- `ServiceResult<{ findings: ValidationFinding[] }, ValidateInterviewReason>`.
- success returns a normalised findings array.
- malformed JSON or missing `findings` returns `ok({ findings: [] })`.
- gateway failures propagate existing Anthropic reasons.

## Why It Is Low Risk

- It is a service-layer interview helper with focused tests.
- It has a bounded output contract.
- It already uses the structured fallback gateway.
- It does not change public route behavior.
- It does not touch final report generation, customer/insurance-facing report generation, voice/realtime, OCR/image, or RAG/IICRC retrieval.
- Existing tests mock `callAnthropicWithFallback`, so provider/model/prompt/request/output preservation can be asserted without live AI calls.

## Usage Metadata Expected

Pure metadata only:

- task class: `fast_classification`.
- provider family: `anthropic-platform`.
- tenant/account context: `userId: "system"` for the current platform-key flow.
- execution mode: `synchronous`.
- policy metadata: usage logging required, budget check required, fallback allowed, max estimated cost from task policy.

No DB persistence is added in this slice.

## What Must Not Change

- Provider gateway must remain `callAnthropicWithFallback`.
- Model fallback chain must remain unchanged.
- System prompt must remain byte-for-byte unchanged.
- User message shape must remain unchanged.
- `max_tokens` must remain `1200`.
- `temperature` must remain `0.2`.
- `agentName` must remain `InterviewValidate`.
- Output shape must remain `ServiceResult<{ findings: ValidationFinding[] }, ValidateInterviewReason>`.
- No DB writes.
- No new provider calls.
- No broad runtime routing.

## Tests To Prove Behaviour Preservation

Required tests:

- selected policy is `fast_classification`.
- usage metadata is generated from task policy.
- missing/unknown task policy fails closed.
- gateway remains `callAnthropicWithFallback`.
- model fallback chain remains unchanged.
- request `max_tokens` and `temperature` remain unchanged.
- system prompt still contains the existing IICRC S500:2021 validation instructions.
- output behavior remains unchanged for valid findings, clean findings, parse fallback, and gateway failure.
- no extra provider call occurs.

## Rollback Plan

Rollback is a single-service revert:

- remove the policy lookup from `validate-interview-response.ts`.
- remove the pure metadata build call.
- keep the existing `callAnthropicWithFallback` request unchanged.
- remove only the new preservation assertions if necessary.

No data migration or external state rollback is required.
