# Runtime Reconciliation and Deployment Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The pattern this plan installs is `service-layer-architecture` — read `.claude/skills/service-layer-architecture/SKILL.md` once before starting.

**Goal:** Make deployment provisioning and repair simpler by moving repeated runtime mechanics out of Next.js API route handlers / cron jobs into structured service modules, while keeping handlers responsible for orchestration (auth, ownership, status transitions, audit events, persistence, user-facing error policy).

**Architecture:** Route handlers and cron entry-points remain orchestration modules. Service modules in `lib/services/` own reusable operational mechanics — gateway credential reads, dispatcher runtime setup, validation, readiness probes, restart and teardown helpers — and return a discriminated-union `ServiceResult<T, E>` so callers map outcomes to HTTP / audit policy. The David Ondrej "actions stay thin; services own mechanics" pattern, adapted from Convex to Next.js App Router + Prisma + Supabase.

**Tech Stack:** Next.js 15 App Router, TypeScript 5 (strict), Prisma 5, Supabase (Postgres 17), Vitest (unit), Playwright (E2E), pnpm.

---

## Files we will create or modify

### Created
- `lib/services/_shared/result.ts` — exports the `ServiceResult<T, E>` discriminated-union type + helper constructors.
- `lib/services/_shared/__tests__/result.test.ts` — unit test for the helpers.
- `lib/services/xero/credentials.ts` — replaces the throw-based `getValidXeroToken` with a structured-result `getValidXeroAccessToken`.
- `lib/services/xero/__tests__/credentials.test.ts` — exhaustive `reason`-space coverage.
- `lib/services/inspection/validate-submission.ts` — pure validation function extracted from `app/api/inspections/[id]/submit/route.ts`.
- `lib/services/inspection/__tests__/validate-submission.test.ts`.

### Modified
- `lib/integrations/xero/token-manager.ts` — re-exports the new service as a thin shim, marks old `getValidXeroToken` as `@deprecated`.
- `app/api/cron/sync-xero-payments/route.ts` — migrate to new service result API.
- `lib/integrations/xero/nir-sync.ts` — migrate.
- `lib/integrations/xero/webhook-processor.ts` — migrate.
- `lib/integrations/xero.ts` — migrate.
- `app/api/inspections/[id]/submit/route.ts` — extract validation, call service.

### Out of scope (this plan)
- Dispatcher / worker runtime setup helpers — Phase 4, follow-up plan.
- Memory runtime / classification cache helpers — Phase 5, follow-up plan.
- Ascora, MYOB, QuickBooks credential extractions — same pattern as Xero; do not re-derive the design, follow this plan task-for-task once it's green for Xero.

---

## Task 1: Foundation — `ServiceResult<T, E>` discriminated-union

**Files:**
- Create: `lib/services/_shared/result.ts`
- Test: `lib/services/_shared/__tests__/result.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/services/_shared/__tests__/result.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { ok, fail, type ServiceResult } from "../result";

describe("ServiceResult", () => {
  it("ok() returns { ok: true, data }", () => {
    const r = ok(42);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toBe(42);
  });

  it("fail() returns { ok: false, reason } with optional detail + retryAfterMs", () => {
    const r = fail("RATE_LIMITED", { detail: "Xero", retryAfterMs: 30000 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("RATE_LIMITED");
      expect(r.detail).toBe("Xero");
      expect(r.retryAfterMs).toBe(30000);
    }
  });

  it("narrows correctly via discriminant", () => {
    const r: ServiceResult<number, "NOT_FOUND"> = ok(7);
    if (r.ok) {
      const n: number = r.data;
      expect(n).toBe(7);
    } else {
      // Unreachable in this test, but the type narrows so the compiler is happy
      const _: "NOT_FOUND" = r.reason;
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```
npx vitest run lib/services/_shared/__tests__/result.test.ts
```
Expected: FAIL — `Cannot find module '../result'`.

- [ ] **Step 3: Write the minimal implementation**

Create `lib/services/_shared/result.ts`:

```typescript
/**
 * Discriminated-union result type for service modules.
 *
 * Service modules in lib/services/** never throw for expected outcomes —
 * they return ServiceResult so the orchestration layer can map reasons to
 * HTTP status codes, audit events, and retry policy.
 *
 * Throws are reserved for truly unexpected errors (bugs, infra outages
 * that bypass our retry envelope).
 *
 * @see .claude/skills/service-layer-architecture/SKILL.md
 */
export type ServiceResult<T, E extends string = string> =
  | { ok: true; data: T }
  | { ok: false; reason: E; detail?: string; retryAfterMs?: number };

export function ok<T>(data: T): { ok: true; data: T } {
  return { ok: true, data };
}

export function fail<E extends string>(
  reason: E,
  extras?: { detail?: string; retryAfterMs?: number },
): { ok: false; reason: E; detail?: string; retryAfterMs?: number } {
  return { ok: false, reason, ...extras };
}
```

- [ ] **Step 4: Run test to verify it passes**

```
npx vitest run lib/services/_shared/__tests__/result.test.ts
```
Expected: PASS — 3 tests green.

- [ ] **Step 5: Type-check**

```
pnpm type-check
```
Expected: zero errors related to `lib/services/_shared/**`.

- [ ] **Step 6: Commit**

```
git add lib/services/_shared/result.ts lib/services/_shared/__tests__/result.test.ts
git commit -m "feat(services): add ServiceResult discriminated-union + ok/fail helpers"
```

---

## Task 2: Xero credentials service — failing tests first

**Files:**
- Create: `lib/services/xero/__tests__/credentials.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/services/xero/__tests__/credentials.test.ts`:

```typescript
import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock the underlying token store + refresh code so the service is testable in
// isolation. Match the import paths used by lib/integrations/xero/token-manager.ts.
vi.mock("@/lib/integrations/oauth-handler", () => ({
  getTokens: vi.fn(),
  storeTokens: vi.fn(),
  markIntegrationError: vi.fn(),
  disconnectIntegration: vi.fn(),
}));
vi.mock("@/lib/integrations/xero/client", () => ({
  XeroClient: vi.fn().mockImplementation(() => ({
    refreshAccessToken: vi.fn().mockResolvedValue(undefined),
  })),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    integration: { findUnique: vi.fn().mockResolvedValue({ tenantId: "T1" }) },
  },
}));

import { getValidXeroAccessToken } from "../credentials";
import { getTokens } from "@/lib/integrations/oauth-handler";

const FIVE_MIN = 5 * 60 * 1000;

describe("getValidXeroAccessToken", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns ok when token is fresh", async () => {
    vi.mocked(getTokens).mockResolvedValueOnce({
      accessToken: "fresh",
      refreshToken: "r",
      tokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      isExpired: false,
    } as never);

    const r = await getValidXeroAccessToken("int-1");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toBe("fresh");
  });

  it("returns DISCONNECTED when no access token", async () => {
    vi.mocked(getTokens).mockResolvedValueOnce({
      accessToken: null,
      refreshToken: null,
      tokenExpiresAt: null,
      isExpired: true,
    } as never);

    const r = await getValidXeroAccessToken("int-1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("DISCONNECTED");
  });

  it("returns REFRESH_REQUIRED reason when expired without refresh token", async () => {
    vi.mocked(getTokens).mockResolvedValueOnce({
      accessToken: "old",
      refreshToken: null,
      tokenExpiresAt: new Date(Date.now() - 1000),
      isExpired: true,
    } as never);

    const r = await getValidXeroAccessToken("int-1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("RECONNECT_REQUIRED");
  });

  it("refreshes when within 5-minute window and returns new token", async () => {
    // First call: stale token. Second call (after refresh): fresh token.
    vi.mocked(getTokens)
      .mockResolvedValueOnce({
        accessToken: "stale",
        refreshToken: "r",
        tokenExpiresAt: new Date(Date.now() + FIVE_MIN - 1000),
        isExpired: false,
      } as never)
      .mockResolvedValueOnce({
        accessToken: "refreshed",
        refreshToken: "r2",
        tokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
        isExpired: false,
      } as never);

    const r = await getValidXeroAccessToken("int-1");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toBe("refreshed");
  });

  it("returns REFRESH_FAILED when XeroClient.refreshAccessToken throws", async () => {
    vi.mocked(getTokens).mockResolvedValueOnce({
      accessToken: "stale",
      refreshToken: "r",
      tokenExpiresAt: new Date(Date.now() - 1000),
      isExpired: true,
    } as never);

    const { XeroClient } = await import("@/lib/integrations/xero/client");
    vi.mocked(XeroClient).mockImplementationOnce(
      () =>
        ({
          refreshAccessToken: vi
            .fn()
            .mockRejectedValueOnce(new Error("invalid_grant")),
        }) as never,
    );

    const r = await getValidXeroAccessToken("int-1");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("REFRESH_FAILED");
      expect(r.detail).toContain("invalid_grant");
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```
npx vitest run lib/services/xero/__tests__/credentials.test.ts
```
Expected: FAIL — `Cannot find module '../credentials'`.

- [ ] **Step 3: Commit (test-first checkpoint)**

```
git add lib/services/xero/__tests__/credentials.test.ts
git commit -m "test(services-xero): failing tests for getValidXeroAccessToken structured-result"
```

---

## Task 3: Xero credentials service — implementation

**Files:**
- Create: `lib/services/xero/credentials.ts`

- [ ] **Step 1: Write the implementation**

Create `lib/services/xero/credentials.ts`:

```typescript
/**
 * Structured-result Xero credentials service.
 *
 * Returns ServiceResult<accessToken, reason> so callers map reasons to HTTP
 * status codes / audit events without try/catch ladders.
 *
 * Reasons:
 *  - DISCONNECTED       — no access token; user must reconnect
 *  - RECONNECT_REQUIRED — token expired and no refresh token; user must reconnect
 *  - REFRESH_FAILED     — refresh attempt failed (invalid_grant, network, etc.)
 *
 * Replaces the throw-based getValidXeroToken from
 * lib/integrations/xero/token-manager.ts. That export is preserved as a
 * deprecation shim during migration.
 *
 * @see .claude/skills/service-layer-architecture/SKILL.md
 */

import {
  getTokens,
  markIntegrationError,
} from "@/lib/integrations/oauth-handler";
import { XeroClient } from "@/lib/integrations/xero/client";
import { prisma } from "@/lib/prisma";
import { ok, fail, type ServiceResult } from "@/lib/services/_shared/result";

export type XeroCredentialsReason =
  | "DISCONNECTED"
  | "RECONNECT_REQUIRED"
  | "REFRESH_FAILED";

const FIVE_MINUTES_MS = 5 * 60 * 1000;

export async function getValidXeroAccessToken(
  integrationId: string,
): Promise<ServiceResult<string, XeroCredentialsReason>> {
  const tokens = await getTokens(integrationId);

  if (!tokens.accessToken) {
    return fail("DISCONNECTED", {
      detail: `Integration ${integrationId} has no access token`,
    });
  }

  const needsRefresh =
    tokens.isExpired ||
    (tokens.tokenExpiresAt != null &&
      tokens.tokenExpiresAt.getTime() - Date.now() < FIVE_MINUTES_MS);

  if (!needsRefresh) {
    return ok(tokens.accessToken);
  }

  if (!tokens.refreshToken) {
    await markIntegrationError(
      integrationId,
      "Xero token expired and no refresh token — user must re-connect",
    );
    return fail("RECONNECT_REQUIRED", {
      detail: "Token expired and no refresh token available",
    });
  }

  try {
    const integration = await prisma.integration.findUnique({
      where: { id: integrationId },
      select: { tenantId: true },
    });
    const client = new XeroClient(
      integrationId,
      integration?.tenantId ?? undefined,
    );
    await client.refreshAccessToken();
    const fresh = await getTokens(integrationId);
    if (!fresh.accessToken) {
      return fail("REFRESH_FAILED", {
        detail: "Refresh completed but token still missing",
      });
    }
    return ok(fresh.accessToken);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return fail("REFRESH_FAILED", { detail });
  }
}
```

- [ ] **Step 2: Run tests to verify all pass**

```
npx vitest run lib/services/xero/__tests__/credentials.test.ts
```
Expected: PASS — 5 tests green.

- [ ] **Step 3: Type-check**

```
pnpm type-check
```
Expected: zero new errors.

- [ ] **Step 4: Commit**

```
git add lib/services/xero/credentials.ts
git commit -m "feat(services-xero): getValidXeroAccessToken with structured ServiceResult"
```

---

## Task 4: Deprecate `getValidXeroToken` (shim mode)

**Files:**
- Modify: `lib/integrations/xero/token-manager.ts`

- [ ] **Step 1: Add deprecation + delegate to new service**

Replace the body of `getValidXeroToken` in `lib/integrations/xero/token-manager.ts` (around line 51) so the legacy throw-based API still works but funnels through the new service:

```typescript
import { getValidXeroAccessToken } from "@/lib/services/xero/credentials";

/**
 * @deprecated Use `getValidXeroAccessToken` from `@/lib/services/xero/credentials`
 *   instead. It returns a ServiceResult<string, XeroCredentialsReason> rather
 *   than throwing. This shim is preserved during migration only; do not add
 *   new callers.
 */
export async function getValidXeroToken(
  integrationId: string,
): Promise<string> {
  const result = await getValidXeroAccessToken(integrationId);
  if (result.ok) return result.data;
  throw new XeroTokenError(
    integrationId,
    result.detail ?? `Xero credentials unavailable (${result.reason})`,
  );
}
```

Remove the old refresh logic from the function body — `getValidXeroAccessToken` now owns it. Keep the `XeroTokenError` export class itself for backward compatibility with existing callers' `instanceof` checks.

- [ ] **Step 2: Run the existing token-manager tests**

```
npx vitest run lib/integrations/xero/__tests__/token-manager.test.ts
```
Expected: all existing tests still PASS. The shim's contract is the same as before.

- [ ] **Step 3: Commit**

```
git add lib/integrations/xero/token-manager.ts
git commit -m "refactor(xero): getValidXeroToken delegates to service-layer credentials"
```

---

## Task 5: Migrate `app/api/cron/sync-xero-payments/route.ts`

**Files:**
- Modify: `app/api/cron/sync-xero-payments/route.ts`

- [ ] **Step 1: Read the file and locate the `getValidXeroToken` call**

```
grep -n "getValidXeroToken" app/api/cron/sync-xero-payments/route.ts
```
Expected: 1 hit. Note the line number — call it `LINE`.

- [ ] **Step 2: Replace the call**

In the route file, replace the import:

```typescript
// BEFORE
import { getValidXeroToken } from "@/lib/integrations/xero/token-manager";

// AFTER
import { getValidXeroAccessToken } from "@/lib/services/xero/credentials";
```

Replace the call site (around `LINE`):

```typescript
// BEFORE
const accessToken = await getValidXeroToken(integration.id);

// AFTER
const credResult = await getValidXeroAccessToken(integration.id);
if (!credResult.ok) {
  console.error("[CronSyncXeroPayments]", {
    integrationId: integration.id,
    reason: credResult.reason,
    detail: credResult.detail,
  });
  // Cron continues to next integration; do not abort the whole job
  continue;
}
const accessToken = credResult.data;
```

- [ ] **Step 3: Run smoke test on the cron route**

```
npx vitest run app/api/cron/sync-xero-payments/__tests__/
```
Expected: if a test file exists, it should still pass (the externally observable behaviour is identical for the happy path). If no test exists, type-check is sufficient.

- [ ] **Step 4: Type-check**

```
pnpm type-check
```
Expected: zero new errors.

- [ ] **Step 5: Commit**

```
git add app/api/cron/sync-xero-payments/route.ts
git commit -m "refactor(cron): sync-xero-payments uses service-layer credentials result"
```

---

## Task 6: Migrate `lib/integrations/xero/nir-sync.ts`

**Files:**
- Modify: `lib/integrations/xero/nir-sync.ts`

- [ ] **Step 1: Locate the call**

```
grep -n "getValidXeroToken" lib/integrations/xero/nir-sync.ts
```

- [ ] **Step 2: Apply the same import + call-site swap as Task 5**

Use the same `BEFORE / AFTER` template. The structured `reason` should be returned up the stack as part of this module's own result type. If `nir-sync.ts` does not yet return a structured result, **do not refactor that here** — return early with the existing error-handling shape so this task stays narrow.

- [ ] **Step 3: Run tests**

```
npx vitest run lib/integrations/xero/__tests__/
```
Expected: all PASS.

- [ ] **Step 4: Type-check + commit**

```
pnpm type-check
git add lib/integrations/xero/nir-sync.ts
git commit -m "refactor(xero-nir-sync): use service-layer credentials result"
```

---

## Task 7: Migrate `lib/integrations/xero/webhook-processor.ts`

**Files:**
- Modify: `lib/integrations/xero/webhook-processor.ts`

- [ ] **Step 1–4: Apply the same template as Tasks 5 and 6**

Same import swap, same call-site swap. Then:

```
npx vitest run lib/integrations/xero/__tests__/webhook-processor.test.ts
pnpm type-check
git add lib/integrations/xero/webhook-processor.ts
git commit -m "refactor(xero-webhook): use service-layer credentials result"
```

---

## Task 8: Inspection-submission validation extraction

**Files:**
- Create: `lib/services/inspection/validate-submission.ts`
- Create: `lib/services/inspection/__tests__/validate-submission.test.ts`
- Modify: `app/api/inspections/[id]/submit/route.ts`

The submit handler at `app/api/inspections/[id]/submit/route.ts` is 566 lines — a fat action. This task extracts the **pure validation** concern only. Subsequent extractions (classification dispatch, NIR generation, integration fan-out) belong to a follow-up plan once this proof-of-pattern is green.

- [ ] **Step 1: Read the handler and identify validation lines**

```
sed -n '/validateSubmission\|validateInspection\|missingFields/p' app/api/inspections/[id]/submit/route.ts | head -20
```

Underline (mentally) the contiguous block(s) that perform pure validation — "does this inspection have the required fields to submit?" — distinct from auth, ownership, status transition, persistence.

- [ ] **Step 2: Write the failing test**

Create `lib/services/inspection/__tests__/validate-submission.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { validateSubmissionPayload } from "../validate-submission";

describe("validateSubmissionPayload", () => {
  it("returns ok for a complete inspection", () => {
    const r = validateSubmissionPayload({
      id: "insp-1",
      status: "DRAFT",
      affectedAreas: [{ id: "a", roomName: "Kitchen" }],
      moistureReadings: [{ id: "m", value: 30 }],
      photos: [{ id: "p", url: "https://..." }],
    });
    expect(r.ok).toBe(true);
  });

  it("returns INVALID_STATUS when not in DRAFT", () => {
    const r = validateSubmissionPayload({
      id: "insp-1",
      status: "SUBMITTED",
      affectedAreas: [{ id: "a", roomName: "K" }],
      moistureReadings: [{ id: "m", value: 30 }],
      photos: [{ id: "p", url: "x" }],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("INVALID_STATUS");
  });

  it("returns MISSING_AFFECTED_AREAS when zero areas", () => {
    const r = validateSubmissionPayload({
      id: "insp-1",
      status: "DRAFT",
      affectedAreas: [],
      moistureReadings: [{ id: "m", value: 30 }],
      photos: [{ id: "p", url: "x" }],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("MISSING_AFFECTED_AREAS");
  });
});
```

- [ ] **Step 3: Run test — expect fail**

```
npx vitest run lib/services/inspection/__tests__/validate-submission.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 4: Write the service**

Create `lib/services/inspection/validate-submission.ts`:

```typescript
/**
 * Pure validation for an inspection-submission attempt.
 *
 * Action layer (app/api/inspections/[id]/submit/route.ts) handles:
 *   - auth, ownership, status persistence, audit logging, HTTP mapping.
 * This service answers: given an Inspection-shaped payload already loaded
 * from the DB, is it valid to submit?
 *
 * No DB reads, no I/O — pure function for predictability + testability.
 *
 * @see .claude/skills/service-layer-architecture/SKILL.md
 */

import { ok, fail, type ServiceResult } from "@/lib/services/_shared/result";

export type SubmissionValidationReason =
  | "INVALID_STATUS"
  | "MISSING_AFFECTED_AREAS"
  | "MISSING_MOISTURE_READINGS"
  | "MISSING_PHOTOS";

export interface SubmissionPayload {
  id: string;
  status: string;
  affectedAreas: { id: string; roomName: string }[];
  moistureReadings: { id: string; value: number }[];
  photos: { id: string; url: string }[];
}

export function validateSubmissionPayload(
  payload: SubmissionPayload,
): ServiceResult<true, SubmissionValidationReason> {
  if (payload.status !== "DRAFT") {
    return fail("INVALID_STATUS", {
      detail: `Inspection is in '${payload.status}', expected 'DRAFT'`,
    });
  }
  if (payload.affectedAreas.length === 0) {
    return fail("MISSING_AFFECTED_AREAS");
  }
  if (payload.moistureReadings.length === 0) {
    return fail("MISSING_MOISTURE_READINGS");
  }
  if (payload.photos.length === 0) {
    return fail("MISSING_PHOTOS");
  }
  return ok(true);
}
```

- [ ] **Step 5: Run test — expect pass**

```
npx vitest run lib/services/inspection/__tests__/validate-submission.test.ts
```
Expected: PASS — 3 tests green.

- [ ] **Step 6: Wire into the submit handler**

In `app/api/inspections/[id]/submit/route.ts`, replace the inline validation block with a call to the service. Add the import at the top of the file:

```typescript
import { validateSubmissionPayload } from "@/lib/services/inspection/validate-submission";
```

Replace the inline validation (after the inspection has been loaded from Prisma) with:

```typescript
const validation = validateSubmissionPayload({
  id: inspection.id,
  status: inspection.status,
  affectedAreas: inspection.affectedAreas,
  moistureReadings: inspection.moistureReadings,
  photos: inspection.photos,
});
if (!validation.ok) {
  const status =
    validation.reason === "INVALID_STATUS" ? 409 : 422;
  return NextResponse.json(
    { error: validation.reason, detail: validation.detail },
    { status },
  );
}
```

Delete the inline validation that this call replaces. Keep auth + ownership + audit-log + status-update logic in the handler — those are action-layer concerns.

- [ ] **Step 7: Run the submit-route tests**

```
npx vitest run app/api/inspections/
```
Expected: existing tests PASS. If a smoke test exists, run it too.

- [ ] **Step 8: Type-check**

```
pnpm type-check
```

- [ ] **Step 9: Commit**

```
git add lib/services/inspection/validate-submission.ts lib/services/inspection/__tests__/validate-submission.test.ts app/api/inspections/\[id\]/submit/route.ts
git commit -m "refactor(inspections): extract submission validation to service layer"
```

---

## Task 9: Document the pattern in `.claude/STANDARDS.md`

**Files:**
- Modify: `.claude/STANDARDS.md`

- [ ] **Step 1: Append a section**

Add to `.claude/STANDARDS.md` (at the end, before any "Patterns to Avoid" section if one exists):

```markdown
## Service Layer (RA-4970-adjacent — 2026-05-18)

Route handlers (`app/api/**/route.ts`) own orchestration: auth, ownership, status transitions, audit events, persistence, HTTP error policy. Runtime mechanics — credential reads, retry loops, validation, readiness probes, restart helpers — live in `lib/services/<domain>/<concern>.ts` and return `ServiceResult<T, E>` (see `lib/services/_shared/result.ts`).

Full pattern: `.claude/skills/service-layer-architecture/SKILL.md`.

Canonical examples in this repo:
- `lib/services/xero/credentials.ts` — gateway credential read.
- `lib/services/inspection/validate-submission.ts` — pure validation.

When extracting from an existing fat action, use TDD per the skill recipe. One concern extracted = one commit.
```

- [ ] **Step 2: Commit**

```
git add .claude/STANDARDS.md
git commit -m "docs(standards): note service-layer pattern + canonical examples"
```

---

## Follow-up plans (separate documents — do not start until this plan is green)

After this plan ships and the team has seen 2 concrete service modules in production:

1. **`2026-05-DD-runtime-reconciliation-phase-2-inspection-mechanics.md`** — extract the classification dispatch, NIR generation, and integration fan-out concerns from the same submit handler. Same pattern, more involved because each module owns retry + structured-result.
2. **`2026-05-DD-deployment-lifecycle-cron-helpers.md`** — extract worker-restart, token-cleanup, and sync-queue-provisioning helpers from `lib/cron/*` into `lib/services/lifecycle/*`. These are the "deployment lifecycle" half of the user's brief.
3. **`2026-05-DD-credential-services-multi-provider.md`** — same Task 2–4 pattern, applied to Ascora, MYOB, QuickBooks, ServiceM8, Stripe. Boilerplate at that point — likely subagent-driven-parallel.

---

## Verification at end of plan

When all 9 tasks above are green:

- [ ] All new `lib/services/**` files exist and have tests.
- [ ] `pnpm type-check` green.
- [ ] `npx vitest run lib/services` green.
- [ ] `npx vitest run lib/integrations/xero` green.
- [ ] `npx vitest run app/api/inspections` green.
- [ ] `pnpm test:smoke:sandbox` (if reachable) green.
- [ ] No new `getValidXeroToken` callers — only the deprecation shim and its tests reference the name.
- [ ] `.claude/STANDARDS.md` mentions the service-layer pattern.
- [ ] PR opened with reference to this plan + the service-layer-architecture skill.

If any check fails, do not declare the plan complete — diagnose, fix, re-run.
