# AI Services Extraction Wave-2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Pattern reference: `.claude/skills/service-layer-architecture/SKILL.md`. Wave-1 reference: `docs/superpowers/plans/2026-05-18-ai-services-extraction-wave.md`.

**Goal:** Complete the AI Services Extraction by (a) adding a streaming sibling to the gateway (`callAnthropicStream`) and (b) migrating the 5 remaining direct-SDK routes — one streaming, four batch — off `@anthropic-ai/sdk` imports.

**Architecture:** Extend `lib/services/ai/anthropic-gateway.ts` (same file as `callAnthropic`) with `callAnthropicStream({userId, request, apiKey?}) → ServiceResult<Anthropic.MessageStream, AnthropicReason>`. Pre-stream failures (key resolution, immediate SDK reject) map to ServiceResult reasons before the stream begins. Mid-stream errors are out of this gateway's scope — consumers handle them via stream events (the SDK's `MessageStream` is an `AsyncIterable<MessageStreamEvent>` plus an `EventEmitter` with `'error'` listener).

**Tech Stack:** Next.js 15 App Router, TypeScript 5 (strict), `@anthropic-ai/sdk@0.95.2`, Vitest. pnpm only.

---

## Files we will create or modify

### Created
- `lib/services/ai/__tests__/anthropic-gateway-stream.test.ts` — separate from batch tests; cleaner mock surface for the stream object.
- `lib/services/ai/generate-scope.ts` — streaming task service.
- `lib/services/ai/__tests__/generate-scope.test.ts`.
- `lib/services/ai/extract-reading.ts` — vision (batch) task service for the moisture-meter photo route.
- `lib/services/ai/__tests__/extract-reading.test.ts`.
- `lib/services/ai/import-sketch-from-image.ts` — vision (batch) task service for sketch-from-photo.
- `lib/services/ai/__tests__/import-sketch-from-image.test.ts`.
- `lib/services/ai/auto-classify-photo.ts` — vision (batch) task service.
- `lib/services/ai/__tests__/auto-classify-photo.test.ts`.
- `lib/services/ai/list-support-tickets.ts` (or a more accurate name once the route is read) — batch task service for the `support/tickets/route.ts` AI use.
- `lib/services/ai/__tests__/list-support-tickets.test.ts`.

### Modified
- `lib/services/ai/anthropic-gateway.ts` — adds `callAnthropicStream` export.
- `app/api/inspections/[id]/generate-scope/route.ts` (482 LOC → target ~250).
- `app/api/vision/extract-reading/route.ts` (154 LOC → target ~80).
- `app/api/inspections/[id]/sketches/import-from-image/route.ts` (281 LOC → target ~150).
- `app/api/ai/auto-classify-photo/[photoId]/route.ts` (193 LOC → target ~100).
- `app/api/support/tickets/route.ts` (266 LOC → target ~140).
- `.claude/STANDARDS.md` — note streaming gateway in the AI Service Pattern subsection.
- `session_manifest.md` — wave-2 close-out.

### Out of scope
- Webhook signature-verification SDK imports (`webhooks/github`, `webhooks/stripe`) — legitimate boundary.
- BYOK refactor (`lib/ai/byok-client.ts`) — separate concern.
- Multi-provider routing (Gemini, GPT) — `lib/ai/model-router.ts` handles for BYOK; cross-pollination is a Phase-3 concern.
- UsageEvent telemetry gateway-side (called out in wave-1 retrospectives) — Phase-3.

---

## Task 1: `callAnthropicStream` gateway extension (foundation)

**Files:**
- Create: `lib/services/ai/__tests__/anthropic-gateway-stream.test.ts`
- Modify: `lib/services/ai/anthropic-gateway.ts`

- [ ] **Step 1: Failing tests**

Create `lib/services/ai/__tests__/anthropic-gateway-stream.test.ts`. Mock `@/lib/ai-provider` and `@anthropic-ai/sdk`. Pattern mirrors the batch gateway tests; uses a fake `MessageStream`-like object (a minimal AsyncIterable + `abort()` stub). Cases:

```typescript
import { describe, expect, it, vi, beforeEach } from "vitest";

const mockMessagesStream = vi.fn();

const hoisted = vi.hoisted(() => {
  class MockRateLimitError extends Error {
    status = 429;
  }
  class MockAPIError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  }
  return { MockRateLimitError, MockAPIError };
});

vi.mock("@/lib/ai-provider", () => ({
  getAnthropicApiKey: vi.fn(),
}));

vi.mock("@anthropic-ai/sdk", () => {
  const Anthropic: any = vi
    .fn()
    .mockImplementation(() => ({ messages: { stream: mockMessagesStream } }));
  Anthropic.RateLimitError = hoisted.MockRateLimitError;
  Anthropic.APIError = hoisted.MockAPIError;
  return { default: Anthropic };
});

import { callAnthropicStream } from "../anthropic-gateway";
import { getAnthropicApiKey } from "@/lib/ai-provider";

const baseReq = {
  userId: "user-1",
  request: {
    model: "claude-sonnet-4-6" as const,
    max_tokens: 100,
    messages: [{ role: "user" as const, content: "hi" }],
  },
};

function fakeStream(): unknown {
  return {
    [Symbol.asyncIterator]: () => ({ next: async () => ({ done: true, value: undefined }) }),
    abort: vi.fn(),
    finalMessage: vi.fn(),
  };
}

describe("callAnthropicStream", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMessagesStream.mockReset();
  });

  it("returns ok with the stream on success", async () => {
    vi.mocked(getAnthropicApiKey).mockResolvedValueOnce("sk-test");
    const stream = fakeStream();
    mockMessagesStream.mockReturnValueOnce(stream);

    const r = await callAnthropicStream(baseReq);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toBe(stream);
  });

  it("returns KEY_MISSING when getAnthropicApiKey throws", async () => {
    vi.mocked(getAnthropicApiKey).mockRejectedValueOnce(new Error("no key"));
    const r = await callAnthropicStream(baseReq);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("KEY_MISSING");
  });

  it("uses the provided apiKey override instead of calling getAnthropicApiKey", async () => {
    vi.mocked(getAnthropicApiKey).mockRejectedValueOnce(new Error("should not be called"));
    mockMessagesStream.mockReturnValueOnce(fakeStream());

    const r = await callAnthropicStream({ ...baseReq, apiKey: "sk-override" });
    expect(r.ok).toBe(true);
    expect(vi.mocked(getAnthropicApiKey)).not.toHaveBeenCalled();
  });

  it("returns RATE_LIMITED when SDK throws synchronously with RateLimitError", async () => {
    vi.mocked(getAnthropicApiKey).mockResolvedValueOnce("sk-test");
    mockMessagesStream.mockImplementationOnce(() => {
      throw new hoisted.MockRateLimitError("rate limited");
    });

    const r = await callAnthropicStream(baseReq);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("RATE_LIMITED");
      expect(r.retryAfterMs).toBeGreaterThan(0);
    }
  });

  it("returns MODEL_OVERLOADED on synchronous APIError status 529", async () => {
    vi.mocked(getAnthropicApiKey).mockResolvedValueOnce("sk-test");
    mockMessagesStream.mockImplementationOnce(() => {
      throw new hoisted.MockAPIError("overloaded", 529);
    });

    const r = await callAnthropicStream(baseReq);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("MODEL_OVERLOADED");
  });

  it("returns API_ERROR on any other synchronous throw", async () => {
    vi.mocked(getAnthropicApiKey).mockResolvedValueOnce("sk-test");
    mockMessagesStream.mockImplementationOnce(() => {
      throw new Error("network broke");
    });

    const r = await callAnthropicStream(baseReq);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("API_ERROR");
  });
});
```

Verify FAIL: `npx vitest run lib/services/ai/__tests__/anthropic-gateway-stream.test.ts` → `callAnthropicStream is not exported`.

Commit: `test(services-ai): failing tests for anthropic-gateway-stream`

- [ ] **Step 2: Implementation**

Append to `lib/services/ai/anthropic-gateway.ts` (after `callAnthropic`):

```typescript
import type { MessageStreamParams } from "@anthropic-ai/sdk/resources/messages";

export interface AnthropicStreamRequest {
  userId: string;
  request: MessageStreamParams;
  /** Optional platform-key override. Same semantics as callAnthropic. */
  apiKey?: string;
}

/**
 * Streaming sibling of callAnthropic. Returns the SDK's MessageStream inside
 * a ServiceResult so callers map pre-stream failures (KEY_MISSING / immediate
 * 429 / 5xx) to HTTP status codes BEFORE opening the SSE/ReadableStream to
 * the client.
 *
 * Mid-stream errors are not this gateway's concern — consumers attach
 * `stream.on("error", handler)` or watch the AsyncIterable for thrown values.
 *
 * @see .claude/skills/service-layer-architecture/SKILL.md
 */
export async function callAnthropicStream(
  args: AnthropicStreamRequest,
): Promise<ServiceResult<Anthropic.MessageStream, AnthropicReason>> {
  let apiKey: string;
  if (args.apiKey) {
    apiKey = args.apiKey;
  } else {
    try {
      apiKey = await getAnthropicApiKey(args.userId);
    } catch (err) {
      return fail("KEY_MISSING", {
        detail: err instanceof Error ? err.message : String(err),
        cause: err,
      });
    }
  }

  if (!apiKey) {
    return fail("KEY_MISSING", {
      detail: `No Anthropic key resolved for user ${args.userId}`,
    });
  }

  const client = new Anthropic({ apiKey });

  try {
    const stream = client.messages.stream(args.request);
    return ok(stream);
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

Verify: `npx vitest run lib/services/ai/__tests__/anthropic-gateway-stream.test.ts` → 6/6 PASS. `pnpm type-check` clean for the file.

Commit: `feat(services-ai): anthropic-gateway-stream for streaming AI responses`

---

## Task 2: `generate-scope` service + route migration (streaming)

Refactor `app/api/inspections/[id]/generate-scope/route.ts` to consume `callAnthropicStream`. The service constructs the streaming request (model, system prompt with `cache_control`, user message) and returns the `ServiceResult<MessageStream, AnthropicReason>` verbatim — the route owns SSE translation, client-disconnect handling, accumulated-text tracking, and persistence.

- [ ] **Step 1: Service tests** — happy path returns ok with a stream; pre-stream KEY_MISSING / RATE_LIMITED propagated.
- [ ] **Step 2: Service implementation** — `generateScope({ userId, systemPrompt, userMessage, model })` returning `ServiceResult<Anthropic.MessageStream, AnthropicReason>`.
- [ ] **Step 3: Route migration** — replace the `await anthropic.messages.stream(...)` call site with `await generateScope({...})`. Keep the entire SSE translation loop (`for await (const event of stream)`, `event.type === "content_block_delta"`, etc.) inside the route — that's orchestration, not service mechanics. Keep `stream.abort()` on client disconnect.
- [ ] **Step 4: HTTP mapping for pre-stream failure** — `KEY_MISSING → 402`, `RATE_LIMITED → 429`, `MODEL_OVERLOADED → 503`, `API_ERROR → 500`. Don't open the `ReadableStream` until after the service returns ok.

Three commits as per wave-1 precedent.

---

## Tasks 3–6: Batch route migrations (same recipe as wave-1)

Each task: failing test → service → route migration → 3 commits.

### Task 3 — `vision/extract-reading`
Service: `lib/services/ai/extract-reading.ts`. Vision input (image + scope of "extract moisture reading"). Use `callAnthropic` (batch). Reasons: `AnthropicReason | "PARSE_FAILED" | "NO_READING_DETECTED"` (the model may explicitly say it can't read the meter — that's a distinct outcome from PARSE_FAILED).

### Task 4 — `inspections/[id]/sketches/import-from-image`
Service: `lib/services/ai/import-sketch-from-image.ts`. Vision input. Returns structured-sketch JSON. Reasons: `AnthropicReason | "PARSE_FAILED"`.

### Task 5 — `ai/auto-classify-photo/[photoId]`
Service: `lib/services/ai/auto-classify-photo.ts`. Vision input. Returns photo-tag enum + confidence. Reasons: `AnthropicReason | "PARSE_FAILED"`.

### Task 6 — `support/tickets/route.ts`
Service: `lib/services/ai/<name>.ts` (read the route first to confirm the AI use case — possibly summarisation, possibly classification). Likely batch.

For each: read the route, capture the SYSTEM_PROMPT verbatim into the service, migrate the route, map reasons to HTTP per the precedent (`KEY_MISSING → 402`, `RATE_LIMITED → 429`, `MODEL_OVERLOADED → 503`, `PARSE_FAILED → 502`, default → 500). Set `Retry-After` header from `retryAfterMs`.

If a route uses the platform key (env var, not `getAnthropicApiKey`), pass `apiKey: process.env.ANTHROPIC_API_KEY` like the wave-1 support-ticket-draft pattern.

---

## Task 7: Docs + manifest close-out

- [ ] Append to `.claude/STANDARDS.md` `### AI Service Pattern` subsection: note that streaming routes consume `callAnthropicStream` and own SSE translation in the route, while the service returns the `MessageStream` unchanged.
- [ ] Update `session_manifest.md`: wave-2 SHIPPED, all 8 AI routes migrated, gateway has batch + streaming exports. Remaining post-this-wave: webhook routes (legitimate direct-SDK) + BYOK / multi-provider (phase 3).
- [ ] Re-run Phase 3 audit: `grep -rln "^import .* from ['\"]@anthropic-ai/sdk['\"]" app/api --include='*.ts' | grep -v __tests__` should show only the 2 webhook routes + `lib/services/ai/anthropic-gateway.ts`.

Single commit: `docs(standards+manifest): AI Services Wave-2 close-out`.

---

## Verification at end of plan

- [ ] All 5 new `lib/services/ai/*.ts` exist with tests.
- [ ] `pnpm type-check` green.
- [ ] `npx vitest run lib/services/ai/` shows 25+ tests passing (19 existing + 6 stream-gateway + ~16 new service tests).
- [ ] `pnpm test:smoke:sandbox` green (if reachable).
- [ ] Phase 3 audit: zero non-webhook routes import `@anthropic-ai/sdk` directly.
- [ ] STANDARDS.md + manifest updated.
- [ ] PR opened referencing this plan + the service-layer-architecture skill.

If any check fails: diagnose, fix, re-run. Do NOT declare complete on a yellow gate.

---

## Risk + edge cases

- **`MessageStream` is not a Promise.** The SDK signature returns `MessageStream` synchronously; the wave-1 route's `await anthropic.messages.stream(...)` is a no-op `await` on a non-thenable. The gateway should match the actual return type — `Anthropic.MessageStream` (not `Promise<MessageStream>`) inside the `ServiceResult.data`.
- **Pre-stream vs mid-stream errors.** `messages.stream()` itself can throw synchronously (RateLimitError, APIError) — those map to ServiceResult reasons. Errors during iteration (network drop mid-stream, model-emitted error events) are NOT this gateway's concern — caller handles via stream events.
- **Client disconnect handling.** Keep `stream.abort()` in the route's `ReadableStream.cancel()` — the service returns the stream as-is, no wrapping that hides `.abort()`.
- **Prompt caching.** The current generate-scope route uses `cache_control: { type: "ephemeral" }` on the system prompt. Preserve this in the service. Cache hits are billed differently; do not strip the directive.
- **SDK error-class detection.** Same as wave-1: `Anthropic.RateLimitError` and `Anthropic.APIError` are static class members on the default export. Confirmed for `@anthropic-ai/sdk@0.95.2`.
- **Vision routes (Tasks 3-5)** pass `content: [{ type: "image", source: {...} }, { type: "text", text: ... }]` — the gateway handles this transparently because `MessageCreateParams` already covers it. No gateway changes needed.
- **`support/tickets/route.ts`** has not been read at plan-write time. The implementer must read it first and confirm batch vs stream, single-AI-call vs multi-AI-call. If multi-call (e.g. classify-then-summarise), split into two service modules.
- **Test mock hoisting.** Wave-1 hit a vitest TDZ issue requiring `vi.hoisted()` around mock class declarations. Apply the same pattern in the streaming-gateway test.

---

## Why this plan ships in two waves, not one

Wave-1 + wave-2 separation is a *causality + risk* split:
- Wave-1's batch gateway has zero dependence on streaming semantics. Shipping it first proved the pattern with 19 tests + 3 production routes.
- Streaming has different failure modes (mid-stream errors, client disconnect, prompt caching, abort lifecycle). Folding it into wave-1 would have doubled review surface for the same benefit.
- The wave-1 retrospective in `session_manifest.md` flagged UsageEvent-telemetry loss as a known gap — wave-3 will fix that gateway-side. Sequencing waves lets each one own a tight set of concerns.

That's the rationale, not deferred work for its own sake.
