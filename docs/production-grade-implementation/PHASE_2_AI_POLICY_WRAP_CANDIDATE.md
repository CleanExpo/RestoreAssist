# Phase 2 AI Policy Wrap Candidate

Date: 2026-05-25

Branch: `codex/phase-2-ai-workflow-upgrades`

## Selected Candidate

- File/module: `lib/services/ai/draft-support-ticket.ts`
- Function: `draftSupportTicketReply`
- Route/user surface: admin-triggered support response draft helper.
- Current provider: Anthropic through existing `callAnthropic` gateway.
- Current model: `claude-haiku-4-5-20251001`.

## Current Prompt / Input / Output Shape

Current system prompt:

- customer-support specialist for RestoreAssist.
- Australian English.
- professional support response.
- 150-250 words.
- reference IICRC S500:2021 only if technically relevant.
- end with next steps and 24-hour response timeline.
- plain response text only.

Current user input shape:

```text
Category: <category>
Priority: <priority>
Subject: <subject>

<body>
```

Current output shape:

- `ServiceResult<string, DraftReason>`.
- success returns the trimmed text block from Anthropic.
- gateway failures propagate existing Anthropic reasons.
- empty text returns `EMPTY_OUTPUT`.

## Why It Is Low Risk

- It is a service-layer helper with focused tests.
- It is admin/platform-key oriented, not public-route behavior.
- It is not report finalisation, customer-facing report generation, voice/realtime, OCR/image, or RAG standards retrieval.
- It already uses the structured `callAnthropic` gateway.
- Existing tests mock `callAnthropic`, making provider/model/prompt preservation easy to assert.

## What Must Not Change

- Provider must remain Anthropic through `callAnthropic`.
- Model must remain `claude-haiku-4-5-20251001`.
- System prompt must remain byte-for-byte unchanged.
- User message shape must remain unchanged.
- Output shape must remain `ServiceResult<string, DraftReason>`.
- Error behavior must remain unchanged except for an impossible missing-policy fail-closed path.
- No new external dependency.
- No runtime routing change outside this helper.

## Policy Wrapper Scope

The wrapper may:

- require `support_response_draft` task policy before the provider call.
- surface policy guardrails in code/tests.
- use the policy's current `maxOutputTokens` value because it equals the existing hard-coded `1024`.
- fail closed if the task policy is missing.

The wrapper may not:

- change provider selection.
- change prompt text.
- change request message content.
- add fallback.
- add new paid calls.
- alter route behavior.

## Tests To Prove Behaviour Preservation

Required tests:

- selected policy is `support_response_draft`.
- missing/unknown task policy fails closed.
- provider remains the existing `callAnthropic` gateway.
- model remains `claude-haiku-4-5-20251001`.
- max token guardrail remains `1024`.
- system prompt still contains the existing support instructions.
- user content shape remains category/priority/subject/body.
- success and error output shapes remain unchanged.

## Rollback Plan

Rollback is a single-service revert:

- remove the policy lookup from `draft-support-ticket.ts`.
- keep the existing `callAnthropic` request unchanged.
- remove only the new preservation assertions if necessary.

No data migration or external state rollback is required.
