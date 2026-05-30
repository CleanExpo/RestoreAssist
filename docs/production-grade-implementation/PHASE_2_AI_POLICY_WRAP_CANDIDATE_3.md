# Phase 2 AI Policy Wrap Candidate 3

Date: 2026-05-25

Branch: `codex/phase-2-ai-workflow-upgrades`

## Selected Candidate

- File/module: `lib/services/ai/generate-interview-question.ts`
- Function: `generateInterviewQuestion`
- Task class: `fast_classification`
- Route/user surface: client-intake interview follow-up helper.
- Current provider: Anthropic through existing `callAnthropicWithFallback` gateway.
- Current model: default fallback chain owned by the existing gateway/Anthropic model helper.

## Current Prompt / Input / Output Shape

Current system prompt:

- water damage restoration assistant for client intake conversations.
- asks one conversational follow-up question at a time.
- gathers incident details, then client name, property address, email, and phone.
- returns JSON with `question` and `isComplete`.

Current input shape:

- `apiKey: string`
- `conversation: ConversationMessage[]`
- each message has `{ role: "user" | "assistant", content: string }`.

Current gateway request shape:

- `userId: "system"`
- resolved `apiKey` override.
- cached system prompt via `createCachedSystemPrompt(SYSTEM_PROMPT)`.
- `max_tokens: 500`.
- conversation messages followed by the existing JSON-object instruction.
- `agentName: "QuestionGenerator"`.
- `enableCacheMetrics: true`.

Current output shape:

- `ServiceResult<GenerateQuestionResult, GenerateQuestionReason>`.
- success returns `{ question: string, isComplete: boolean }`.
- gateway failures propagate existing Anthropic reasons.
- non-JSON model output falls back to text with completion threshold behavior.

## Why It Is Low Risk

- It is a service-layer helper with focused tests.
- It is an interview/classification-style helper, not final report generation, customer/insurance-facing report generation, voice/realtime, OCR/image, or RAG/IICRC retrieval.
- It already uses the structured fallback gateway.
- It has a clear output contract and deterministic fallback behavior.
- Existing tests mock `callAnthropicWithFallback`, so provider/request preservation can be asserted without live AI calls.

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
- Model selection must remain owned by the existing fallback gateway/model helper.
- System prompt must remain byte-for-byte unchanged.
- User message shape must remain unchanged.
- `max_tokens` must remain `500`.
- `agentName` and cache metrics flags must remain unchanged.
- Output shape must remain `ServiceResult<GenerateQuestionResult, GenerateQuestionReason>`.
- No DB writes.
- No new provider calls.
- No broad runtime routing.

## Tests To Prove Behaviour Preservation

Required tests:

- selected policy is `fast_classification`.
- usage metadata is generated from task policy.
- missing/unknown task policy fails closed.
- gateway remains `callAnthropicWithFallback`.
- request `max_tokens` remains `500`.
- system prompt still contains the existing intake instructions.
- user message sequence and JSON instruction remain unchanged.
- output behavior remains unchanged for success, non-JSON fallback, and gateway failures.
- no extra provider call occurs.

## Rollback Plan

Rollback is a single-service revert:

- remove the policy lookup from `generate-interview-question.ts`.
- remove the pure metadata build call.
- keep the existing `callAnthropicWithFallback` request unchanged.
- remove only the new preservation assertions if necessary.

No data migration or external state rollback is required.
