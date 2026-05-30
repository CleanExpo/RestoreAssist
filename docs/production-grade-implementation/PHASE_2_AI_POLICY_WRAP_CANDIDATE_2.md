# Phase 2 AI Policy Wrap Candidate 2

Date: 2026-05-25

Branch: `codex/phase-2-ai-workflow-upgrades`

## Selected Candidate

- File/module: `lib/services/ai/analyse-support-ticket.ts`
- Function: `analyseSupportTicket`
- Route/user surface: inbound support ticket analysis helper used by `app/api/support/tickets/route.ts`.
- Current provider: Anthropic through existing `callAnthropic` gateway.
- Current model: `claude-haiku-4-5-20251001`.

## Current Prompt / Input / Output Shape

Current system prompt:

- customer-support specialist for RestoreAssist.
- classify category as `general|billing|technical|feature_request|bug`.
- classify priority as `low|normal|high|urgent`.
- return JSON only with `category`, `priority`, and `responseDraft`.
- response draft is Australian English, 150-250 words, and includes next steps with a 24-hour response timeline.

Current user input shape:

```text
Subject: <subject>

<body>
```

Current output shape:

- `ServiceResult<SupportTicketAnalysis, AnalyseSupportTicketReason>`.
- success returns `{ category, priority, responseDraft }`.
- invalid category/priority clamp to `general` and `normal`.
- invalid JSON returns `PARSE_FAILED`.
- gateway failures propagate existing Anthropic reasons.

## Why It Is Low Risk

- It is a service-layer support/admin helper with focused tests.
- It already uses the structured `callAnthropic` gateway.
- The route degrades gracefully when the service fails.
- It is not final report generation, insurance/customer-facing report generation, voice/realtime, OCR/image, RAG/IICRC standards retrieval, or public-route behavior.
- Existing tests mock `callAnthropic`, so provider/model/prompt/request/output preservation can be asserted without live AI calls.

## What Must Not Change

- Provider must remain Anthropic through `callAnthropic`.
- Model must remain `claude-haiku-4-5-20251001`.
- System prompt must remain byte-for-byte unchanged.
- User message shape must remain unchanged.
- Output shape must remain `ServiceResult<SupportTicketAnalysis, AnalyseSupportTicketReason>`.
- Existing parse/defaulting/error behavior must remain unchanged except for an impossible missing-policy fail-closed path.
- No new external dependency.
- No runtime routing change outside this helper.

## Policy Wrapper Scope

The wrapper may:

- require `support_ticket_analysis` task policy before the provider call.
- surface policy guardrails in code/tests.
- use the policy's current `maxOutputTokens` value because it equals the existing hard-coded `1024`.
- fail closed if the task policy is missing.

The wrapper may not:

- change provider selection.
- change model selection.
- change prompt text.
- change request message content.
- add fallback.
- add new paid calls.
- alter route behavior.

## Tests To Prove Behaviour Preservation

Required tests:

- selected policy is `support_ticket_analysis`.
- missing/unknown task policy fails closed.
- provider remains the existing `callAnthropic` gateway.
- model remains `claude-haiku-4-5-20251001`.
- max token guardrail remains `1024`.
- system prompt still contains the existing JSON-only support analysis instructions.
- user content shape remains subject/body.
- success, clamping, gateway error, and parse failure output shapes remain unchanged.

## Rollback Plan

Rollback is a single-service revert:

- remove the policy lookup from `analyse-support-ticket.ts`.
- keep the existing `callAnthropic` request unchanged.
- remove only the new preservation assertions if necessary.

No data migration or external state rollback is required.
