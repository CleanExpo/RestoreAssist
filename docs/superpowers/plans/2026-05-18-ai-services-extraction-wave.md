# AI Services Extraction Wave Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The pattern this plan installs is `service-layer-architecture` — read `.claude/skills/service-layer-architecture/SKILL.md` once before starting.

**Goal:** Move 8 Next.js API routes off direct `@anthropic-ai/sdk` imports by introducing a single platform-key Anthropic gateway service that returns `ServiceResult<T, AnthropicReason>`. Routes shrink to orchestration; the gateway owns SDK instantiation, key lookup, retry envelope, and structured failure mapping.

**Architecture:** New `lib/services/ai/` sibling to `lib/services/xero/`. One gateway module + N task-specific domain modules. The gateway composes the existing `lib/ai-provider.ts:getAnthropicApiKey(userId)` helper — does NOT replace it. Distinct from `lib/ai/byok-client.ts` (BYOK = user-supplied keys); this is the platform-keyed-with-per-user-override flow. Routes call the domain modules and translate `ServiceResult.reason` into HTTP status codes (`KEY_MISSING` → 402, `RATE_LIMITED` → 429, `MODEL_OVERLOADED` → 503, `API_ERROR` → 500).

**Tech Stack:** Next.js 15 App Router, TypeScript 5 (strict), `@anthropic-ai/sdk`, Prisma 5, Vitest. pnpm only.

---

## Files we will create or modify

### Created
- `lib/services/ai/anthropic-gateway.ts` — platform-key Anthropic wrapper returning `ServiceResult<AnthropicMessage, AnthropicReason>`.
- `lib/services/ai/__tests__/anthropic-gateway.test.ts` — happy path + 4 reason paths (KEY_MISSING / RATE_LIMITED / MODEL_OVERLOADED / API_ERROR).
- `lib/services/ai/classify-inspection.ts` — Task-specific service composing the gateway with the classify prompt.
- `lib/services/ai/__tests__/classify-inspection.test.ts`.
- `lib/services/ai/generate-scope.ts` — generate-scope task service.
- `lib/services/ai/__tests__/generate-scope.test.ts`.
- `lib/services/ai/draft-support-ticket.ts` — support-ticket-draft task service.
- `lib/services/ai/__tests__/draft-support-ticket.test.ts`.

### Modified (3 of 8 routes — proof-of-pattern wave)
- `app/api/inspections/[id]/classify/route.ts` (264 LOC → target ~120).
- `app/api/inspections/[id]/generate-scope/route.ts` (482 LOC → target ~180).
- `app/api/support/tickets/[id]/draft/route.ts` (108 LOC → target ~70).

### Out of scope (this plan — follow-up)
- 5 remaining routes: `vision/extract-reading`, `inspections/[id]/sketches/import-from-image`, `inspections/[id]/group-readings`, `ai/auto-classify-photo/[photoId]`, `support/tickets/route.ts`. Same pattern, follow-up plan once this proves.
- Webhook signature-verification SDK imports (`webhooks/github`, `webhooks/stripe`) — legitimate boundary; leave alone.
- BYOK refactor (`lib/ai/byok-client.ts`) — separate concern; not touched.
- Multi-provider routing (Anthropic vs Gemini vs GPT) — `lib/ai/model-router.ts` already handles this for BYOK. Cross-pollination is a Phase-3 follow-up.

---

## Task 1: Anthropic gateway service (foundation)

**Files:**
- Create: `lib/services/ai/anthropic-gateway.ts`
- Test: `lib/services/ai/__tests__/anthropic-gateway.test.ts`

- [ ] **Step 1: Write the failing test first**

Create `lib/services/ai/__tests__/anthropic-gateway.test.ts`. Mock `@/lib/ai-provider` and `@anthropic-ai/sdk`. Cover 5 cases: happy path, `KEY_MISSING` (no API key resolved), `RATE_LIMITED` (SDK throws `RateLimitError`), `MODEL_OVERLOADED` (SDK throws `OverloadedError`), `API_ERROR` (generic SDK throw). Each case asserts on `result.ok` + `result.reason`.

Verify: `npx vitest run lib/services/ai/__tests__/anthropic-gateway.test.ts` → expect FAIL (module not found).

Commit: `git commit -m "test(services-ai): failing tests for anthropic-gateway structured-result"`

- [ ] **Step 2: Implement the gateway**

Create `lib/services/ai/anthropic-gateway.ts`:

```typescript
/**
 * Structured-result Anthropic platform-key gateway.
 *
 * Returns ServiceResult<AnthropicMessage, AnthropicReason> so route handlers
 * map reasons to HTTP status codes without try/catch ladders. Composes
 * `getAnthropicApiKey(userId)` from lib/ai-provider.ts — this gateway is for
 * the platform-key-with-per-user-override flow, NOT BYOK (lib/ai/byok-client.ts).
 *
 * Reasons:
 *  - KEY_MISSING        — no usable Anthropic key for this user (no connected
 *                         integration AND no env fallback)
 *  - RATE_LIMITED       — SDK returned 429
 *  - MODEL_OVERLOADED   — SDK returned 529 / overloaded
 *  - API_ERROR          — any other SDK failure (5xx, network, parse)
 *
 * @see .claude/skills/service-layer-architecture/SKILL.md
 */

import Anthropic from "@anthropic-ai/sdk";
import { getAnthropicApiKey } from "@/lib/ai-provider";
import { ok, fail, type ServiceResult } from "@/lib/services/_shared/result";
import type { MessageCreateParams } from "@anthropic-ai/sdk/resources/messages";

export type AnthropicReason =
  | "KEY_MISSING"
  | "RATE_LIMITED"
  | "MODEL_OVERLOADED"
  | "API_ERROR";

export interface AnthropicGatewayRequest {
  userId: string;
  request: MessageCreateParams;
}

export async function callAnthropic(
  args: AnthropicGatewayRequest,
): Promise<ServiceResult<Anthropic.Message, AnthropicReason>> {
  let apiKey: string;
  try {
    apiKey = await getAnthropicApiKey(args.userId);
  } catch (err) {
    return fail("KEY_MISSING", {
      detail: err instanceof Error ? err.message : String(err),
      cause: err,
    });
  }
  if (!apiKey) {
    return fail("KEY_MISSING", {
      detail: `No Anthropic key resolved for user ${args.userId}`,
    });
  }

  const client = new Anthropic({ apiKey });
  try {
    const message = await client.messages.create(args.request);
    return ok(message);
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      return fail("RATE_LIMITED", {
        detail: err.message,
        retryAfterMs: 30000,
        cause: err,
      });
    }
    if (err instanceof Anthropic.APIError && err.status === 529) {
      return fail("MODEL_OVERLOADED", {
        detail: err.message,
        retryAfterMs: 10000,
        cause: err,
      });
    }
    return fail("API_ERROR", {
      detail: err instanceof Error ? err.message : String(err),
      cause: err,
    });
  }
}
```

Verify: `npx vitest run lib/services/ai/__tests__/anthropic-gateway.test.ts` → 5/5 PASS.
Type-check: `pnpm type-check` (zero new errors in `lib/services/ai/**`).

Commit: `git commit -m "feat(services-ai): anthropic-gateway with structured ServiceResult"`

---

## Task 2: Inspection classification service

**Files:**
- Create: `lib/services/ai/classify-inspection.ts`
- Create: `lib/services/ai/__tests__/classify-inspection.test.ts`

- [ ] **Step 1: Read** `app/api/inspections/[id]/classify/route.ts` and identify the AI seam.

The current route fetches `getAnthropicApiKey(userId)`, instantiates `new Anthropic({ apiKey })`, calls `anthropic.messages.create({...})` with the classification prompt, then parses the response. Extract:
- The prompt construction (system + user message)
- The model selection (likely `claude-sonnet-4-6`)
- The response parsing (likely JSON-from-text)

into `lib/services/ai/classify-inspection.ts` that takes `{ userId, inspectionPayload }` and returns `ServiceResult<ClassifyResult, AnthropicReason | "PARSE_FAILED">`.

- [ ] **Step 2: Write failing tests** covering: happy path (mocked gateway returns parseable message), gateway failure pass-through (gateway returns `RATE_LIMITED`, service propagates the same reason), `PARSE_FAILED` (gateway returns ok but message text isn't valid JSON for the classify schema).

Commit: `test(services-ai): failing tests for classify-inspection`

- [ ] **Step 3: Implement** the service. Compose `callAnthropic(...)` from Task 1. On `!result.ok`, return the gateway's reason verbatim. On `result.ok`, parse the message text; if parse fails, return `fail("PARSE_FAILED", { detail })`. On success, return `ok(parsedResult)`.

Verify tests pass. Type-check.

Commit: `feat(services-ai): classify-inspection service composing anthropic-gateway`

- [ ] **Step 4: Migrate the route.**

In `app/api/inspections/[id]/classify/route.ts`:
- Remove `import Anthropic from "@anthropic-ai/sdk"`.
- Remove direct `getAnthropicApiKey` import (the service owns this dependency now).
- Replace the inline SDK-call block with `await classifyInspection({ userId, inspectionPayload })`.
- Map reasons → HTTP: `KEY_MISSING` → 402, `RATE_LIMITED` → 429 (with `Retry-After` header from `retryAfterMs`), `MODEL_OVERLOADED` → 503, `PARSE_FAILED` → 502, `API_ERROR` → 500.
- Keep auth, ownership, audit, persistence — those stay in the route.

Verify: `npx vitest run app/api/inspections/[id]/classify/` (if tests exist) + `pnpm type-check`.

Commit: `refactor(inspections): classify route uses service-layer AI gateway`

---

## Task 3: Generate-scope service

**Files:**
- Create: `lib/services/ai/generate-scope.ts`
- Create: `lib/services/ai/__tests__/generate-scope.test.ts`
- Modify: `app/api/inspections/[id]/generate-scope/route.ts`

Apply the same recipe as Task 2. `generate-scope` is the fattest route (482 LOC) — most of the win is here.

Specifics:
- The service interface: `generateScope({ userId, inspectionId, scopePayload })` returning `ServiceResult<ScopeResult, AnthropicReason | "PARSE_FAILED" | "INSUFFICIENT_INPUT">`.
- `INSUFFICIENT_INPUT` is a pre-flight validation that the service does before hitting the gateway (no affected areas, no moisture readings, etc.). This is a domain validation concern, properly in the service module.

Three commits, same TDD shape as Task 2.

---

## Task 4: Support-ticket draft service

**Files:**
- Create: `lib/services/ai/draft-support-ticket.ts`
- Create: `lib/services/ai/__tests__/draft-support-ticket.test.ts`
- Modify: `app/api/support/tickets/[id]/draft/route.ts`

Smallest route (108 LOC). Same recipe. Service interface: `draftSupportTicket({ userId, ticketId, threadContext })` returning `ServiceResult<DraftedReply, AnthropicReason | "TICKET_NOT_FOUND" | "PARSE_FAILED">`.

Three commits, same shape.

---

## Task 5: Document the pattern + audit re-run

**Files:**
- Modify: `.claude/STANDARDS.md`
- Modify: `session_manifest.md`

- [ ] **Step 1: Append to `.claude/STANDARDS.md`** (after the existing Service Layer section):

```markdown
### AI Service Pattern

Routes that previously imported `@anthropic-ai/sdk` directly now go through `lib/services/ai/<task>.ts`, which composes `lib/services/ai/anthropic-gateway.ts`. Route → domain-task-service → gateway → SDK. Each layer returns `ServiceResult<T, Reason>`. Reasons compose: a route translates the union `AnthropicReason | <task-specific-reasons>` into HTTP status codes.

Pattern boundaries:
- **`lib/services/ai/anthropic-gateway.ts`** owns SDK instantiation + key lookup + retry envelope + error → reason mapping.
- **`lib/services/ai/<task>.ts`** owns prompt construction + response parsing + task-specific pre-flight validation.
- **Routes** own auth, ownership, audit, persistence, HTTP error mapping.

Canonical examples: `lib/services/ai/classify-inspection.ts`, `lib/services/ai/generate-scope.ts`.

When extracting a new AI route, copy the recipe from any of those three modules — do not invent a new shape.
```

- [ ] **Step 2: Re-run Phase 3 audit** (architectural-integrity-protocol skill):

```
grep -rln -E "^import .* from ['\"]@anthropic-ai/sdk['\"]" app/api --include='*.ts' | grep -v __tests__
```

After this plan, output should contain only the 5 remaining unmigrated routes — `vision/extract-reading`, `sketches/import-from-image`, `group-readings`, `auto-classify-photo`, `support/tickets/route.ts` — plus the two webhooks (legitimate). Update `session_manifest.md`'s Phase-3 audit finding to reflect the new state.

Commit: `docs(standards+manifest): AI service pattern + re-run audit after wave-1 extraction`

---

## Follow-up plans (deferred — do not start until this plan green)

1. **`2026-05-DD-ai-services-extraction-wave-2.md`** — same recipe for the 5 remaining routes: `vision/extract-reading`, `sketches/import-from-image`, `group-readings`, `auto-classify-photo`, `support/tickets/route.ts`.
2. **`2026-05-DD-byok-byok-services-unification.md`** — investigate cross-pollination between `lib/services/ai/anthropic-gateway.ts` (platform-key) and `lib/ai/byok-client.ts` (user-key). Ideal end state: single gateway with `keyMode: "platform" | "byok"` parameter.

---

## Verification at end of plan

- [ ] All 4 new `lib/services/ai/*.ts` exist and have tests.
- [ ] `pnpm type-check` green.
- [ ] `npx vitest run lib/services/` green (expect 75+ tests: 16 from existing + new gateway suite + 3 task suites).
- [ ] `npx vitest run app/api/inspections/ app/api/support/` green.
- [ ] `pnpm test:smoke:sandbox` green (if reachable).
- [ ] Phase 3 audit shows only 5 routes + 2 webhooks importing `@anthropic-ai/sdk` directly.
- [ ] `.claude/STANDARDS.md` has the new "AI Service Pattern" subsection.
- [ ] `session_manifest.md` updated with new state.
- [ ] PR opened referencing this plan + the service-layer-architecture skill.

If any check fails, do not declare the plan complete — diagnose, fix, re-run.

---

## Risk + edge cases (called out per L6 contrarian feedback)

- **Existing route tests may mock `Anthropic`-class directly.** When migrating, the mocks need to move from `vi.mock("@anthropic-ai/sdk")` to `vi.mock("@/lib/services/ai/<service>")`. If a route test asserts on a specific SDK call shape rather than the service's return value, STOP and report — that test design needs review.
- **`getAnthropicApiKey` already throws or returns falsy?** The gateway handles both — `try/catch` returns `KEY_MISSING`, and the explicit `if (!apiKey)` check covers the falsy-return path.
- **Anthropic SDK error classes vary by version.** The gateway checks `RateLimitError` first, then a status-529 fallback for overloaded. If the installed SDK version exposes a distinct `OverloadedError` class, prefer that. Subagent should verify the installed `@anthropic-ai/sdk` version via `pnpm list @anthropic-ai/sdk` before implementing Task 1.
- **Per-user override semantics.** `getAnthropicApiKey(userId)` returns the user's connected-integration key if present, env fallback otherwise. The gateway does NOT short-circuit on env-only — that's a billing/compliance concern owned upstream.
- **Streaming responses.** None of the 3 routes in this plan use `messages.stream(...)`. If a future migration needs streaming, extend the gateway with a sibling `callAnthropicStream` that returns `ServiceResult<AsyncIterable<MessageStreamEvent>, AnthropicReason>` — do not retrofit `callAnthropic`.
- **`@anthropic-ai/sdk` version pin.** Before Task 1, verify the installed version supports `MessageCreateParams` type export at the documented path. If it doesn't, import from `@anthropic-ai/sdk/resources/messages.mjs` or the top-level. The plan picks the documented path; the implementer should adjust if `pnpm type-check` flags it.
