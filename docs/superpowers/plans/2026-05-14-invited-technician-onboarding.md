# Invited-Technician Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `/invite/[token]` into a mobile-first, two-step invited-technician onboarding flow with deferred licence capture at engagement-time per CLAUDE.md rule 28, and add the `EngagementLicenceModal` that opens at the four attestation-touching actions.

**Architecture:** Page rewrite of `app/invite/[token]/page.tsx` into `<InviteIdentityStep>` + `<InviteTermsStep>` sub-components. Extend `POST /api/invites/[token]` to accept `phone` + `headshotDataUrl` + `acceptedChainOfCustody`. New `POST /api/invites/oauth-complete` route for the Google OAuth path. New `POST /api/authorisations` + `GET /api/authorisations/most-recent` routes (the Prisma `Authorisation` model exists, but no HTTP routes do yet). New `EngagementLicenceModal` component invoked from a `requireEngagementAuthorisation()` helper at each of four gated actions. Role-branched response from `GET /api/onboarding/first-run` so `<FirstRunChecklist>` shows technician-specific steps. One additive Prisma migration: `User.phone`, `Authorisation.whsCardNumber`, `Authorisation.whsCardExpiry`, and a `(subjectUserId, verifiedAt desc)` index.

**Tech Stack:** Next.js 15 App Router, Prisma 6 + PostgreSQL, NextAuth (credentials + Google), shadcn/ui, react-hook-form + zod, Vitest, Playwright, Cloudinary (existing), Tailwind.

**Spec:** `docs/superpowers/specs/2026-05-13-invited-technician-onboarding-design.md`.

---

## File Structure

### Files to CREATE

- `prisma/migrations/20260514000000_invited_technician_onboarding/migration.sql` — additive: `User.phone`, `Authorisation.whsCardNumber`, `Authorisation.whsCardExpiry`, index.
- `lib/authorisations/most-recent.ts` — pre-fill helper + 5-min in-memory LRU cache + per-request memo.
- `lib/authorisations/__tests__/most-recent.test.ts` — unit tests for the helper and cache.
- `lib/authorisations/require-engagement-authorisation.ts` — the gate-helper that decides between fresh and pre-filled modal flows.
- `lib/authorisations/__tests__/require-engagement-authorisation.test.ts` — unit tests for the gate helper.
- `app/api/authorisations/route.ts` — `POST` only (creates an `Authorisation` row from a self-attestation payload).
- `app/api/authorisations/__tests__/route.test.ts` — integration tests for the POST.
- `app/api/authorisations/most-recent/route.ts` — `GET` that returns the most-recent Authorisation for `session.user.id`, scoped strictly to the session user.
- `app/api/authorisations/most-recent/__tests__/route.test.ts` — integration tests for the GET.
- `app/api/invites/oauth-complete/route.ts` — the Google OAuth completion route.
- `app/api/invites/oauth-complete/__tests__/route.test.ts` — integration tests for the OAuth completion path.
- `components/invite/InviteIdentityStep.tsx` — Step 1 sub-component (name + Google/password + phone + headshot).
- `components/invite/InviteTermsStep.tsx` — Step 2 sub-component (terms + chain-of-custody consent).
- `components/invite/headshot-utils.ts` — client-side image validation + square crop helper.
- `components/invite/__tests__/headshot-utils.test.ts` — unit tests for headshot validation + crop.
- `components/invite/__tests__/phone-validator.test.ts` — unit tests for AU mobile phone regex.
- `components/invite/phone-validator.ts` — AU mobile validator.
- `components/attestation/EngagementLicenceModal.tsx` — the inline modal.
- `e2e/invite-tech-happy-path.spec.ts`
- `e2e/invite-tech-google-oauth.spec.ts`
- `e2e/invite-tech-expired.spec.ts`
- `e2e/invite-tech-already-used.spec.ts`
- `e2e/tech-evidence-capture-no-modal.spec.ts`
- `e2e/tech-signoff-modal-fresh.spec.ts`
- `e2e/tech-signoff-modal-cancel.spec.ts`
- `e2e/tech-banner-auto-dismiss.spec.ts`

### Files to MODIFY

- `prisma/schema.prisma` — add `User.phone`, two `Authorisation` columns, the new compound index.
- `app/invite/[token]/page.tsx` — rewrite into two-step card driven by `useState<'identity'|'terms'>('identity')`; delegate to the two new sub-components.
- `app/api/invites/[token]/route.ts` — extend POST: accept `phone`, `headshotDataUrl`, `acceptedChainOfCustody`, optional `provider: 'google'`. Validate. Upload headshot to Cloudinary. Persist phone + image on User.
- `app/api/onboarding/first-run/route.ts` — role-branch: if `session.user.role === 'USER'`, return the tech-step set (IICRC, WHS, state licence). Otherwise unchanged.
- `app/api/onboarding/first-run/__tests__/route.test.ts` (create if missing) — covers both branches.
- `lib/auth.ts` — **verify-only** task: confirm the JWT callback already hydrates `setupCompletedAt` (it does per spec audit, lines 391–414). No code change unless the audit task discovers drift.

---

## Task Map

| # | Task | Phase |
|---|---|---|
| 1 | Prisma migration A (schema deltas) | Foundation |
| 2 | `phone-validator.ts` + tests | Foundation |
| 3 | `headshot-utils.ts` + tests | Foundation |
| 4 | `most-recent.ts` helper + cache + tests | Foundation |
| 5 | `GET /api/authorisations/most-recent` route + tests | API |
| 6 | `POST /api/authorisations` route + tests | API |
| 7 | `require-engagement-authorisation.ts` gate helper + tests | API |
| 8 | Extend `POST /api/invites/[token]` + tests | API |
| 9 | `POST /api/invites/oauth-complete` route + tests | API |
| 10 | Role-branch `GET /api/onboarding/first-run` + tests | API |
| 11 | `<InviteIdentityStep>` + `<InviteTermsStep>` + page rewrite | UI |
| 12 | `<EngagementLicenceModal>` | UI |
| 13 | Wire modal into 4 trigger actions | UI |
| 14 | E2E specs (8) | Verification |
| 15 | Visual regression baselines (24) | Verification |
| 16 | Verification-Gate manual smoke | Verification |

---

## Task 1: Prisma Migration A

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260514000000_invited_technician_onboarding/migration.sql`

- [ ] **Step 1: Edit `prisma/schema.prisma` — add `phone` to `User`**

Locate the `User` model. Add the field immediately after `image`:

```prisma
model User {
  // ... existing fields up through `image`
  image     String?
  phone     String?
  // ... rest of model unchanged
}
```

- [ ] **Step 2: Edit `prisma/schema.prisma` — add two columns + index to `Authorisation`**

Locate the `Authorisation` model. Add the WHS columns just before `verifiedAt`, and add the compound index inside the `@@index` block:

```prisma
model Authorisation {
  // ... existing fields up through workCoverPolicyNumber
  workCoverPolicyNumber String?

  // WHS / White Card — required for technician self-attestation
  whsCardNumber String?
  whsCardExpiry DateTime?

  // Verification
  verifiedAt         DateTime @default(now())
  // ... rest of model unchanged

  @@index([inspectionId])
  @@index([userId])
  @@index([subjectContractorId])
  @@index([status])
  @@index([expiresAt])
  @@index([subjectUserId, verifiedAt(sort: Desc)])
}
```

- [ ] **Step 3: Generate the migration**

Run: `npx prisma migrate dev --name invited_technician_onboarding --create-only`
Expected: a new directory at `prisma/migrations/20260514000000_invited_technician_onboarding/` (the exact timestamp prefix may vary by clock; rename it to `20260514000000_invited_technician_onboarding` if Prisma produced a different one). The `migration.sql` should contain `ALTER TABLE "User" ADD COLUMN "phone" TEXT`, `ALTER TABLE "Authorisation" ADD COLUMN "whsCardNumber" TEXT`, `ALTER TABLE "Authorisation" ADD COLUMN "whsCardExpiry" TIMESTAMP(3)`, and `CREATE INDEX ON "Authorisation" ("subjectUserId", "verifiedAt" DESC)`.

- [ ] **Step 4: Verify the migration SQL is idempotent-safe**

Open `prisma/migrations/20260514000000_invited_technician_onboarding/migration.sql`. Confirm there are no `DROP` statements and all `ADD COLUMN` statements operate on nullable columns. The migration is additive-only and safe to deploy to production.

Expected content:

```sql
-- AlterTable
ALTER TABLE "User" ADD COLUMN "phone" TEXT;

-- AlterTable
ALTER TABLE "Authorisation" ADD COLUMN "whsCardNumber" TEXT,
ADD COLUMN "whsCardExpiry" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Authorisation_subjectUserId_verifiedAt_idx" ON "Authorisation"("subjectUserId", "verifiedAt" DESC);
```

If Prisma emitted different statement order or different index name, leave it; the assertions in subsequent tasks will catch any semantic difference.

- [ ] **Step 5: Run migration against local dev DB and regenerate client**

Run: `pnpm prisma:generate`
Expected: completes without error; the generated `@prisma/client` types now include `phone` on `User` and `whsCardNumber`/`whsCardExpiry` on `Authorisation`.

- [ ] **Step 6: Run type-check**

Run: `pnpm type-check`
Expected: PASS. (No callers depend on these fields yet, so no errors.)

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260514000000_invited_technician_onboarding/
git commit -m "feat(prisma): add User.phone + Authorisation WHS columns (sub-project #2)"
```

---

## Task 2: AU mobile phone validator

**Files:**
- Create: `components/invite/phone-validator.ts`
- Test: `components/invite/__tests__/phone-validator.test.ts`

- [ ] **Step 1: Write the failing test**

Create `components/invite/__tests__/phone-validator.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { normaliseAuMobile, isValidAuMobile } from "../phone-validator";

describe("phone-validator", () => {
  describe("normaliseAuMobile", () => {
    it("strips spaces", () => {
      expect(normaliseAuMobile("0412 345 678")).toBe("0412345678");
    });
    it("converts +61 prefix to 0", () => {
      expect(normaliseAuMobile("+61 412 345 678")).toBe("0412345678");
    });
    it("converts +614 prefix to 04 without doubling", () => {
      expect(normaliseAuMobile("+61412345678")).toBe("0412345678");
    });
    it("trims trailing/leading whitespace", () => {
      expect(normaliseAuMobile("  0412345678  ")).toBe("0412345678");
    });
  });

  describe("isValidAuMobile", () => {
    it("accepts a normalised AU mobile", () => {
      expect(isValidAuMobile("0412345678")).toBe(true);
    });
    it("accepts a spaced AU mobile", () => {
      expect(isValidAuMobile("0412 345 678")).toBe(true);
    });
    it("accepts a +61-prefixed AU mobile", () => {
      expect(isValidAuMobile("+61 412 345 678")).toBe(true);
    });
    it("rejects an AU landline starting 03", () => {
      expect(isValidAuMobile("0312345678")).toBe(false);
    });
    it("rejects a 9-digit input", () => {
      expect(isValidAuMobile("041234567")).toBe(false);
    });
    it("rejects a US-style number", () => {
      expect(isValidAuMobile("+1 415 555 1234")).toBe(false);
    });
    it("rejects empty string", () => {
      expect(isValidAuMobile("")).toBe(false);
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run components/invite/__tests__/phone-validator.test.ts`
Expected: FAIL with "Cannot find module '../phone-validator'".

- [ ] **Step 3: Write minimal implementation**

Create `components/invite/phone-validator.ts`:

```ts
/**
 * Normalise an Australian mobile number to the canonical "0XXXXXXXXX" form.
 * Strips whitespace and converts a "+61" prefix to "0".
 *
 * Examples:
 *   "0412 345 678"  -> "0412345678"
 *   "+61 412 345 678" -> "0412345678"
 *   "+61412345678"  -> "0412345678"
 */
export function normaliseAuMobile(input: string): string {
  const stripped = input.replace(/\s+/g, "").trim();
  if (stripped.startsWith("+61")) {
    return "0" + stripped.slice(3);
  }
  return stripped;
}

/**
 * AU mobile validator.
 * Accepts inputs with or without spaces and an optional +61 prefix.
 * The canonical form after normalisation must match /^04\d{8}$/.
 */
export function isValidAuMobile(input: string): boolean {
  if (!input) return false;
  return /^04\d{8}$/.test(normaliseAuMobile(input));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run components/invite/__tests__/phone-validator.test.ts`
Expected: PASS (11/11).

- [ ] **Step 5: Run type-check**

Run: `pnpm type-check`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add components/invite/phone-validator.ts components/invite/__tests__/phone-validator.test.ts
git commit -m "feat(invite): AU mobile validator"
```

---

## Task 3: Headshot validator + square-crop helper

**Files:**
- Create: `components/invite/headshot-utils.ts`
- Test: `components/invite/__tests__/headshot-utils.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `components/invite/__tests__/headshot-utils.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { validateHeadshotFile } from "../headshot-utils";

function mockFile(opts: { name: string; type: string; size: number }): File {
  const blob = new Blob([new Uint8Array(opts.size)], { type: opts.type });
  return new File([blob], opts.name, { type: opts.type });
}

describe("validateHeadshotFile", () => {
  it("accepts a JPEG under 5MB", () => {
    const f = mockFile({ name: "me.jpg", type: "image/jpeg", size: 1_000_000 });
    expect(validateHeadshotFile(f)).toEqual({ ok: true });
  });

  it("accepts a PNG under 5MB", () => {
    const f = mockFile({ name: "me.png", type: "image/png", size: 4_000_000 });
    expect(validateHeadshotFile(f)).toEqual({ ok: true });
  });

  it("rejects a HEIC file", () => {
    const f = mockFile({ name: "me.heic", type: "image/heic", size: 1_000_000 });
    const result = validateHeadshotFile(f);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/JPG or PNG/);
    }
  });

  it("rejects a non-image", () => {
    const f = mockFile({ name: "doc.pdf", type: "application/pdf", size: 1_000_000 });
    const result = validateHeadshotFile(f);
    expect(result.ok).toBe(false);
  });

  it("rejects a file over 5MB", () => {
    const f = mockFile({ name: "big.jpg", type: "image/jpeg", size: 6_000_000 });
    const result = validateHeadshotFile(f);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/under 5\s?MB/);
    }
  });

  it("rejects an empty file", () => {
    const f = mockFile({ name: "empty.jpg", type: "image/jpeg", size: 0 });
    const result = validateHeadshotFile(f);
    expect(result.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run components/invite/__tests__/headshot-utils.test.ts`
Expected: FAIL with "Cannot find module '../headshot-utils'".

- [ ] **Step 3: Write minimal implementation**

Create `components/invite/headshot-utils.ts`:

```ts
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png"] as const;

export type HeadshotValidationResult =
  | { ok: true }
  | { ok: false; error: string };

export function validateHeadshotFile(file: File): HeadshotValidationResult {
  if (!file || file.size === 0) {
    return { ok: false, error: "Photo must be a JPG or PNG under 5MB" };
  }
  if (!ALLOWED_TYPES.includes(file.type as (typeof ALLOWED_TYPES)[number])) {
    return { ok: false, error: "Photo must be a JPG or PNG under 5MB" };
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, error: "Photo must be a JPG or PNG under 5MB" };
  }
  return { ok: true };
}

/**
 * Square-crop the largest centred square of an image and return as a JPEG
 * data URL. Used client-side before posting to the server so the upload
 * payload is bounded and the headshot is already in the canonical aspect.
 *
 * Browser-only — relies on HTMLCanvasElement.
 */
export async function squareCropToDataUrl(
  file: File,
  outputSize = 512,
): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) / 2;

  const canvas = document.createElement("canvas");
  canvas.width = outputSize;
  canvas.height = outputSize;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, outputSize, outputSize);
  return canvas.toDataURL("image/jpeg", 0.9);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run components/invite/__tests__/headshot-utils.test.ts`
Expected: PASS (6/6). The `squareCropToDataUrl` function is browser-only and is not covered by Vitest; it's exercised in E2E.

- [ ] **Step 5: Run type-check**

Run: `pnpm type-check`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add components/invite/headshot-utils.ts components/invite/__tests__/headshot-utils.test.ts
git commit -m "feat(invite): headshot file validator + square-crop helper"
```

---

## Task 4: `lib/authorisations/most-recent.ts` helper + cache

**Files:**
- Create: `lib/authorisations/most-recent.ts`
- Test: `lib/authorisations/__tests__/most-recent.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `lib/authorisations/__tests__/most-recent.test.ts`:

```ts
import { describe, expect, it, beforeEach, vi } from "vitest";
import { mostRecentAuthorisationForUser, _resetCacheForTests } from "../most-recent";

const findFirst = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    authorisation: { findFirst: (...args: unknown[]) => findFirst(...args) },
  },
}));

beforeEach(() => {
  findFirst.mockReset();
  _resetCacheForTests();
});

describe("mostRecentAuthorisationForUser", () => {
  it("returns null when no prior Authorisation exists", async () => {
    findFirst.mockResolvedValueOnce(null);
    const result = await mostRecentAuthorisationForUser("user_1");
    expect(result).toBeNull();
  });

  it("returns the most recent Authorisation by verifiedAt", async () => {
    findFirst.mockResolvedValueOnce({
      subjectLicenceNumber: "IICRC-1",
      subjectLicenceState: "QLD",
      subjectLicenceClass: "Restoration",
      whsCardNumber: "WHS-1",
      publicLiabilityInsurer: "CGU",
      publicLiabilityPolicyNumber: "POL-1",
      publicLiabilityCoverAmount: null,
      verifiedAt: new Date("2026-05-10T00:00:00Z"),
    });
    const result = await mostRecentAuthorisationForUser("user_1");
    expect(result?.subjectLicenceNumber).toBe("IICRC-1");
    expect(result?.whsCardNumber).toBe("WHS-1");
  });

  it("uses an explicit select with the expected fields", async () => {
    findFirst.mockResolvedValueOnce(null);
    await mostRecentAuthorisationForUser("user_1");
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { subjectUserId: "user_1" },
        orderBy: { verifiedAt: "desc" },
        select: expect.objectContaining({
          subjectLicenceNumber: true,
          subjectLicenceState: true,
          subjectLicenceClass: true,
          whsCardNumber: true,
          publicLiabilityInsurer: true,
          publicLiabilityPolicyNumber: true,
          publicLiabilityCoverAmount: true,
          verifiedAt: true,
        }),
      }),
    );
  });

  it("caches a non-null result for the same user for 5 minutes", async () => {
    findFirst.mockResolvedValueOnce({
      subjectLicenceNumber: "IICRC-1",
      subjectLicenceState: "QLD",
      subjectLicenceClass: null,
      whsCardNumber: "WHS-1",
      publicLiabilityInsurer: null,
      publicLiabilityPolicyNumber: null,
      publicLiabilityCoverAmount: null,
      verifiedAt: new Date(),
    });
    await mostRecentAuthorisationForUser("user_1");
    await mostRecentAuthorisationForUser("user_1");
    expect(findFirst).toHaveBeenCalledTimes(1);
  });

  it("does not leak cache across users", async () => {
    findFirst.mockResolvedValueOnce({
      subjectLicenceNumber: "IICRC-1",
      verifiedAt: new Date(),
    });
    findFirst.mockResolvedValueOnce({
      subjectLicenceNumber: "IICRC-2",
      verifiedAt: new Date(),
    });
    const a = await mostRecentAuthorisationForUser("user_1");
    const b = await mostRecentAuthorisationForUser("user_2");
    expect(a?.subjectLicenceNumber).toBe("IICRC-1");
    expect(b?.subjectLicenceNumber).toBe("IICRC-2");
    expect(findFirst).toHaveBeenCalledTimes(2);
  });

  it("invalidates cache on invalidateAuthorisationCache", async () => {
    const { invalidateAuthorisationCache } = await import("../most-recent");
    findFirst.mockResolvedValue({
      subjectLicenceNumber: "IICRC-1",
      verifiedAt: new Date(),
    });
    await mostRecentAuthorisationForUser("user_1");
    invalidateAuthorisationCache("user_1");
    await mostRecentAuthorisationForUser("user_1");
    expect(findFirst).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/authorisations/__tests__/most-recent.test.ts`
Expected: FAIL with "Cannot find module '../most-recent'".

- [ ] **Step 3: Write minimal implementation**

Create `lib/authorisations/most-recent.ts`:

```ts
import { prisma } from "@/lib/prisma";

const CACHE_TTL_MS = 5 * 60 * 1000;

interface CacheEntry {
  expiresAt: number;
  value: MostRecentAuthorisation | null;
}

const cache = new Map<string, CacheEntry>();

export interface MostRecentAuthorisation {
  subjectLicenceNumber: string | null;
  subjectLicenceState: string | null;
  subjectLicenceClass: string | null;
  whsCardNumber: string | null;
  publicLiabilityInsurer: string | null;
  publicLiabilityPolicyNumber: string | null;
  publicLiabilityCoverAmount: { toString(): string } | null;
  verifiedAt: Date;
}

export async function mostRecentAuthorisationForUser(
  userId: string,
): Promise<MostRecentAuthorisation | null> {
  const now = Date.now();
  const hit = cache.get(userId);
  if (hit && hit.expiresAt > now) {
    return hit.value;
  }

  const row = await prisma.authorisation.findFirst({
    where: { subjectUserId: userId },
    orderBy: { verifiedAt: "desc" },
    select: {
      subjectLicenceNumber: true,
      subjectLicenceState: true,
      subjectLicenceClass: true,
      whsCardNumber: true,
      publicLiabilityInsurer: true,
      publicLiabilityPolicyNumber: true,
      publicLiabilityCoverAmount: true,
      verifiedAt: true,
    },
  });

  cache.set(userId, { expiresAt: now + CACHE_TTL_MS, value: row });
  return row;
}

export function invalidateAuthorisationCache(userId: string): void {
  cache.delete(userId);
}

/** @internal — for unit tests only */
export function _resetCacheForTests(): void {
  cache.clear();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/authorisations/__tests__/most-recent.test.ts`
Expected: PASS (6/6).

- [ ] **Step 5: Run type-check**

Run: `pnpm type-check`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/authorisations/most-recent.ts lib/authorisations/__tests__/most-recent.test.ts
git commit -m "feat(authorisations): most-recent helper + 5min in-memory cache"
```

---

## Task 5: `GET /api/authorisations/most-recent` route

**Files:**
- Create: `app/api/authorisations/most-recent/route.ts`
- Test: `app/api/authorisations/most-recent/__tests__/route.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `app/api/authorisations/most-recent/__tests__/route.test.ts`:

```ts
import { describe, expect, it, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "../route";

const getServerSession = vi.fn();
const mostRecentAuthorisationForUser = vi.fn();

vi.mock("next-auth", () => ({ getServerSession: (...a: unknown[]) => getServerSession(...a) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/authorisations/most-recent", () => ({
  mostRecentAuthorisationForUser: (...a: unknown[]) => mostRecentAuthorisationForUser(...a),
}));

beforeEach(() => {
  getServerSession.mockReset();
  mostRecentAuthorisationForUser.mockReset();
});

describe("GET /api/authorisations/most-recent", () => {
  it("returns 401 when unauthenticated", async () => {
    getServerSession.mockResolvedValueOnce(null);
    const res = await GET(new NextRequest("http://localhost/api/authorisations/most-recent"));
    expect(res.status).toBe(401);
  });

  it("returns { row: null } when no prior Authorisation exists", async () => {
    getServerSession.mockResolvedValueOnce({ user: { id: "user_1" } });
    mostRecentAuthorisationForUser.mockResolvedValueOnce(null);
    const res = await GET(new NextRequest("http://localhost/api/authorisations/most-recent"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ row: null });
  });

  it("returns { row: ... } when an Authorisation exists", async () => {
    getServerSession.mockResolvedValueOnce({ user: { id: "user_1" } });
    const verifiedAt = new Date("2026-05-10T00:00:00Z");
    mostRecentAuthorisationForUser.mockResolvedValueOnce({
      subjectLicenceNumber: "IICRC-1",
      subjectLicenceState: "QLD",
      subjectLicenceClass: null,
      whsCardNumber: "WHS-1",
      publicLiabilityInsurer: "CGU",
      publicLiabilityPolicyNumber: "POL-1",
      publicLiabilityCoverAmount: null,
      verifiedAt,
    });
    const res = await GET(new NextRequest("http://localhost/api/authorisations/most-recent"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.row.subjectLicenceNumber).toBe("IICRC-1");
    expect(body.row.verifiedAt).toBe(verifiedAt.toISOString());
  });

  it("scopes the query strictly to session.user.id", async () => {
    getServerSession.mockResolvedValueOnce({ user: { id: "user_99" } });
    mostRecentAuthorisationForUser.mockResolvedValueOnce(null);
    await GET(new NextRequest("http://localhost/api/authorisations/most-recent"));
    expect(mostRecentAuthorisationForUser).toHaveBeenCalledWith("user_99");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run app/api/authorisations/most-recent/__tests__/route.test.ts`
Expected: FAIL with "Cannot find module '../route'".

- [ ] **Step 3: Write minimal implementation**

Create `app/api/authorisations/most-recent/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { mostRecentAuthorisationForUser } from "@/lib/authorisations/most-recent";

export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const row = await mostRecentAuthorisationForUser(session.user.id);
  if (!row) {
    return NextResponse.json({ row: null });
  }

  return NextResponse.json({
    row: {
      subjectLicenceNumber: row.subjectLicenceNumber,
      subjectLicenceState: row.subjectLicenceState,
      subjectLicenceClass: row.subjectLicenceClass,
      whsCardNumber: row.whsCardNumber,
      publicLiabilityInsurer: row.publicLiabilityInsurer,
      publicLiabilityPolicyNumber: row.publicLiabilityPolicyNumber,
      publicLiabilityCoverAmount: row.publicLiabilityCoverAmount
        ? row.publicLiabilityCoverAmount.toString()
        : null,
      verifiedAt: row.verifiedAt.toISOString(),
    },
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run app/api/authorisations/most-recent/__tests__/route.test.ts`
Expected: PASS (4/4).

- [ ] **Step 5: Run type-check**

Run: `pnpm type-check`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/api/authorisations/most-recent/
git commit -m "feat(api): GET /api/authorisations/most-recent for pre-fill"
```

---

## Task 6: `POST /api/authorisations` route

**Files:**
- Create: `app/api/authorisations/route.ts`
- Test: `app/api/authorisations/__tests__/route.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `app/api/authorisations/__tests__/route.test.ts`:

```ts
import { describe, expect, it, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "../route";

const getServerSession = vi.fn();
const userFindUnique = vi.fn();
const authCreate = vi.fn();
const invalidateAuthorisationCache = vi.fn();

vi.mock("next-auth", () => ({ getServerSession: (...a: unknown[]) => getServerSession(...a) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (...a: unknown[]) => userFindUnique(...a) },
    authorisation: { create: (...a: unknown[]) => authCreate(...a) },
  },
}));
vi.mock("@/lib/authorisations/most-recent", () => ({
  invalidateAuthorisationCache: (...a: unknown[]) => invalidateAuthorisationCache(...a),
}));
vi.mock("@/lib/csrf", () => ({ validateCsrf: () => null }));

beforeEach(() => {
  getServerSession.mockReset();
  userFindUnique.mockReset();
  authCreate.mockReset();
  invalidateAuthorisationCache.mockReset();
});

function makeReq(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/authorisations", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

const validBody = {
  inspectionId: "insp_1",
  subjectLicenceNumber: "IICRC-1",
  whsCardNumber: "WHS-1",
  subjectLicenceState: "QLD",
  subjectLicenceClass: "Restoration",
  publicLiabilityInsurer: "CGU",
  publicLiabilityPolicyNumber: "POL-1",
};

describe("POST /api/authorisations", () => {
  it("returns 401 unauthenticated", async () => {
    getServerSession.mockResolvedValueOnce(null);
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(401);
  });

  it("returns 400 when subjectLicenceNumber missing", async () => {
    getServerSession.mockResolvedValueOnce({ user: { id: "u_1" } });
    userFindUnique.mockResolvedValueOnce({
      id: "u_1",
      organization: { name: "Acme", legalName: null, tradingName: null },
    });
    const res = await POST(makeReq({ ...validBody, subjectLicenceNumber: undefined }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when whsCardNumber missing", async () => {
    getServerSession.mockResolvedValueOnce({ user: { id: "u_1" } });
    userFindUnique.mockResolvedValueOnce({
      id: "u_1",
      organization: { name: "Acme", legalName: null, tradingName: null },
    });
    const res = await POST(makeReq({ ...validBody, whsCardNumber: undefined }));
    expect(res.status).toBe(400);
  });

  it("creates an Authorisation row with subjectUserId = session.user.id", async () => {
    getServerSession.mockResolvedValueOnce({ user: { id: "u_1" } });
    userFindUnique.mockResolvedValueOnce({
      id: "u_1",
      organization: { name: "Acme", legalName: null, tradingName: null },
    });
    authCreate.mockResolvedValueOnce({ id: "auth_1" });
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, authorisationId: "auth_1" });
    expect(authCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        subjectUserId: "u_1",
        userId: "u_1",
        subjectCompanyName: "Acme",
        subjectLicenceNumber: "IICRC-1",
        whsCardNumber: "WHS-1",
        verifiedMethod: "SELF_DECLARED",
      }),
      select: { id: true },
    });
  });

  it("prefers legalName then tradingName over name for subjectCompanyName", async () => {
    getServerSession.mockResolvedValueOnce({ user: { id: "u_1" } });
    userFindUnique.mockResolvedValueOnce({
      id: "u_1",
      organization: { name: "fallback", legalName: "Acme Pty Ltd", tradingName: "Acme" },
    });
    authCreate.mockResolvedValueOnce({ id: "auth_1" });
    await POST(makeReq(validBody));
    expect(authCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ subjectCompanyName: "Acme Pty Ltd" }),
      }),
    );
  });

  it("invalidates the most-recent cache after a successful create", async () => {
    getServerSession.mockResolvedValueOnce({ user: { id: "u_1" } });
    userFindUnique.mockResolvedValueOnce({
      id: "u_1",
      organization: { name: "Acme", legalName: null, tradingName: null },
    });
    authCreate.mockResolvedValueOnce({ id: "auth_1" });
    await POST(makeReq(validBody));
    expect(invalidateAuthorisationCache).toHaveBeenCalledWith("u_1");
  });

  it("returns 500 with generic error (rule 7) when DB throws", async () => {
    getServerSession.mockResolvedValueOnce({ user: { id: "u_1" } });
    userFindUnique.mockResolvedValueOnce({
      id: "u_1",
      organization: { name: "Acme", legalName: null, tradingName: null },
    });
    authCreate.mockRejectedValueOnce(new Error("DB exploded"));
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Internal server error");
    expect(body.message).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run app/api/authorisations/__tests__/route.test.ts`
Expected: FAIL with "Cannot find module '../route'".

- [ ] **Step 3: Write minimal implementation**

Create `app/api/authorisations/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { validateCsrf } from "@/lib/csrf";
import { invalidateAuthorisationCache } from "@/lib/authorisations/most-recent";

interface PostBody {
  inspectionId?: string;
  subjectLicenceNumber?: string;
  whsCardNumber?: string;
  subjectLicenceState?: string;
  subjectLicenceClass?: string;
  publicLiabilityInsurer?: string;
  publicLiabilityPolicyNumber?: string;
  publicLiabilityCoverAmount?: number;
}

export async function POST(req: NextRequest) {
  const csrfError = validateCsrf(req);
  if (csrfError) return csrfError;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: PostBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!body.subjectLicenceNumber || typeof body.subjectLicenceNumber !== "string") {
    return NextResponse.json(
      { error: "subjectLicenceNumber is required" },
      { status: 400 },
    );
  }
  if (!body.whsCardNumber || typeof body.whsCardNumber !== "string") {
    return NextResponse.json(
      { error: "whsCardNumber is required" },
      { status: 400 },
    );
  }

  try {
    const userWithOrg = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        organization: {
          select: { name: true, legalName: true, tradingName: true },
        },
      },
    });

    if (!userWithOrg?.organization) {
      return NextResponse.json(
        { error: "User is not attached to an organization" },
        { status: 400 },
      );
    }

    const subjectCompanyName =
      userWithOrg.organization.legalName ??
      userWithOrg.organization.tradingName ??
      userWithOrg.organization.name;

    const created = await prisma.authorisation.create({
      data: {
        inspectionId: body.inspectionId ?? null,
        userId: session.user.id,
        subjectUserId: session.user.id,
        subjectCompanyName,
        subjectLicenceNumber: body.subjectLicenceNumber,
        subjectLicenceState: body.subjectLicenceState ?? null,
        subjectLicenceClass: body.subjectLicenceClass ?? null,
        whsCardNumber: body.whsCardNumber,
        publicLiabilityInsurer: body.publicLiabilityInsurer ?? null,
        publicLiabilityPolicyNumber: body.publicLiabilityPolicyNumber ?? null,
        verifiedMethod: "SELF_DECLARED",
        status: "VALID",
      },
      select: { id: true },
    });

    invalidateAuthorisationCache(session.user.id);

    return NextResponse.json({ ok: true, authorisationId: created.id });
  } catch (error) {
    console.error("[POST /api/authorisations]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run app/api/authorisations/__tests__/route.test.ts`
Expected: PASS (7/7).

- [ ] **Step 5: Run type-check**

Run: `pnpm type-check`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/api/authorisations/route.ts app/api/authorisations/__tests__/route.test.ts
git commit -m "feat(api): POST /api/authorisations (self-attestation flow)"
```

---

## Task 7: `requireEngagementAuthorisation` gate helper

**Files:**
- Create: `lib/authorisations/require-engagement-authorisation.ts`
- Test: `lib/authorisations/__tests__/require-engagement-authorisation.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `lib/authorisations/__tests__/require-engagement-authorisation.test.ts`:

```ts
import { describe, expect, it, beforeEach, vi } from "vitest";
import { needsModal, AUTHORISATION_MAX_AGE_DAYS } from "../require-engagement-authorisation";

describe("needsModal", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T00:00:00Z"));
  });

  it("returns 'fresh' when no prior Authorisation exists", () => {
    expect(needsModal(null)).toBe("fresh");
  });

  it("returns 'prefilled' when an Authorisation exists within MAX_AGE", () => {
    const verifiedAt = new Date("2026-05-25T00:00:00Z"); // 7 days ago
    expect(needsModal({ verifiedAt } as any)).toBe("prefilled");
  });

  it("returns 'fresh' when an Authorisation exists but is older than MAX_AGE", () => {
    const verifiedAt = new Date(
      Date.now() - (AUTHORISATION_MAX_AGE_DAYS + 1) * 24 * 60 * 60 * 1000,
    );
    expect(needsModal({ verifiedAt } as any)).toBe("fresh");
  });

  it("returns 'prefilled' at exactly MAX_AGE - 1 second", () => {
    const verifiedAt = new Date(
      Date.now() - AUTHORISATION_MAX_AGE_DAYS * 24 * 60 * 60 * 1000 + 1000,
    );
    expect(needsModal({ verifiedAt } as any)).toBe("prefilled");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/authorisations/__tests__/require-engagement-authorisation.test.ts`
Expected: FAIL with "Cannot find module '../require-engagement-authorisation'".

- [ ] **Step 3: Write minimal implementation**

Create `lib/authorisations/require-engagement-authorisation.ts`:

```ts
import type { MostRecentAuthorisation } from "./most-recent";

export const AUTHORISATION_MAX_AGE_DAYS = 90;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type ModalState = "fresh" | "prefilled";

/**
 * Decide which state the EngagementLicenceModal should open in for the given
 * most-recent Authorisation. Returns "fresh" when the row is missing or older
 * than AUTHORISATION_MAX_AGE_DAYS; returns "prefilled" otherwise.
 */
export function needsModal(row: MostRecentAuthorisation | null): ModalState {
  if (!row) return "fresh";
  const ageMs = Date.now() - row.verifiedAt.getTime();
  if (ageMs >= AUTHORISATION_MAX_AGE_DAYS * MS_PER_DAY) return "fresh";
  return "prefilled";
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/authorisations/__tests__/require-engagement-authorisation.test.ts`
Expected: PASS (4/4).

- [ ] **Step 5: Run type-check**

Run: `pnpm type-check`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/authorisations/require-engagement-authorisation.ts lib/authorisations/__tests__/require-engagement-authorisation.test.ts
git commit -m "feat(authorisations): require-engagement-authorisation gate helper"
```

---

## Task 8: Extend `POST /api/invites/[token]`

**Files:**
- Modify: `app/api/invites/[token]/route.ts`
- Create: `app/api/invites/[token]/__tests__/route-extended.test.ts`

- [ ] **Step 1: Read the current route**

Read `app/api/invites/[token]/route.ts` end-to-end (206 lines) so you understand the existing email-path body parsing, the existing-user-transfer branch, and the response shape. Do not change any of those behaviours; only add new required fields.

- [ ] **Step 2: Write the failing tests**

Create `app/api/invites/[token]/__tests__/route-extended.test.ts`:

```ts
import { describe, expect, it, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "../route";

const validateCsrf = vi.fn();
const inviteFindUnique = vi.fn();
const userFindUnique = vi.fn();
const userCreate = vi.fn();
const userUpdate = vi.fn();
const inviteUpdate = vi.fn();
const sendInviteEmail = vi.fn();
const cloudinaryUploadDataUrl = vi.fn();

vi.mock("@/lib/csrf", () => ({ validateCsrf: (...a: unknown[]) => validateCsrf(...a) }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    userInvite: {
      findUnique: (...a: unknown[]) => inviteFindUnique(...a),
      update: (...a: unknown[]) => inviteUpdate(...a),
    },
    user: {
      findUnique: (...a: unknown[]) => userFindUnique(...a),
      create: (...a: unknown[]) => userCreate(...a),
      update: (...a: unknown[]) => userUpdate(...a),
    },
  },
}));
vi.mock("@/lib/email", () => ({ sendInviteEmail: (...a: unknown[]) => sendInviteEmail(...a) }));
vi.mock("@/lib/email-retry", () => ({ sendWithRetry: async (fn: () => unknown) => fn() }));
vi.mock("@/lib/notifications", () => ({ notifyTeamMemberJoined: vi.fn() }));
vi.mock("@/lib/cloudinary", () => ({
  uploadDataUrl: (...a: unknown[]) => cloudinaryUploadDataUrl(...a),
}));

beforeEach(() => {
  validateCsrf.mockReset().mockReturnValue(null);
  inviteFindUnique.mockReset();
  userFindUnique.mockReset();
  userCreate.mockReset();
  userUpdate.mockReset();
  inviteUpdate.mockReset();
  sendInviteEmail.mockReset();
  cloudinaryUploadDataUrl.mockReset();
});

const baseBody = {
  name: "Jamie Tradie",
  password: "verysecurepassword12",
  phone: "0412 345 678",
  headshotDataUrl: "data:image/jpeg;base64,/9j/4AAQ...",
  acceptedTerms: true,
  acceptedChainOfCustody: true,
};

function makeReq(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/invites/abc123", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

async function ctx() {
  return { params: Promise.resolve({ token: "abc123" }) };
}

describe("POST /api/invites/[token] (extended)", () => {
  it("returns 400 when phone is missing", async () => {
    const res = await POST(makeReq({ ...baseBody, phone: undefined }), await ctx());
    expect(res.status).toBe(400);
  });

  it("returns 400 when phone is not a valid AU mobile", async () => {
    const res = await POST(makeReq({ ...baseBody, phone: "+1 415 555 1234" }), await ctx());
    expect(res.status).toBe(400);
  });

  it("returns 400 when headshotDataUrl is missing on email-password path", async () => {
    const res = await POST(makeReq({ ...baseBody, headshotDataUrl: undefined }), await ctx());
    expect(res.status).toBe(400);
  });

  it("returns 400 when acceptedChainOfCustody is not true", async () => {
    const res = await POST(makeReq({ ...baseBody, acceptedChainOfCustody: false }), await ctx());
    expect(res.status).toBe(400);
  });

  it("creates User with phone + image when email-password happy path", async () => {
    inviteFindUnique.mockResolvedValueOnce({
      id: "inv_1",
      token: "abc123",
      email: "jamie@example.com",
      role: "USER",
      organizationId: "org_1",
      expiresAt: new Date(Date.now() + 86400000),
      usedAt: null,
    });
    userFindUnique.mockResolvedValueOnce(null); // email not yet exists
    cloudinaryUploadDataUrl.mockResolvedValueOnce("https://res.cloudinary.com/.../jamie.jpg");
    userCreate.mockResolvedValueOnce({
      id: "u_new",
      email: "jamie@example.com",
      name: "Jamie Tradie",
      role: "USER",
    });
    inviteUpdate.mockResolvedValueOnce({});

    const res = await POST(makeReq(baseBody), await ctx());

    expect(res.status).toBe(200);
    expect(userCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: "jamie@example.com",
          name: "Jamie Tradie",
          role: "USER",
          organizationId: "org_1",
          phone: "0412345678",
          image: "https://res.cloudinary.com/.../jamie.jpg",
        }),
      }),
    );
  });

  it("on provider:'google' path, skips password validation", async () => {
    inviteFindUnique.mockResolvedValueOnce({
      id: "inv_1",
      token: "abc123",
      email: "jamie@example.com",
      role: "USER",
      organizationId: "org_1",
      expiresAt: new Date(Date.now() + 86400000),
      usedAt: null,
    });
    userFindUnique.mockResolvedValueOnce({
      id: "u_existing_google",
      organizationId: "org_1",
      role: "USER",
    });
    cloudinaryUploadDataUrl.mockResolvedValueOnce("https://res.cloudinary.com/.../jamie.jpg");
    userUpdate.mockResolvedValueOnce({
      id: "u_existing_google",
      phone: "0412345678",
    });
    inviteUpdate.mockResolvedValueOnce({});

    const res = await POST(
      makeReq({
        provider: "google",
        name: "Jamie Tradie",
        phone: "0412 345 678",
        headshotDataUrl: "data:image/jpeg;base64,/9j/4AAQ...",
        acceptedTerms: true,
        acceptedChainOfCustody: true,
      }),
      await ctx(),
    );

    expect(res.status).toBe(200);
    expect(userUpdate).toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run app/api/invites/[token]/__tests__/route-extended.test.ts`
Expected: FAIL — current route doesn't validate `phone`/`headshotDataUrl`/`acceptedChainOfCustody`, doesn't upload to Cloudinary, doesn't accept `provider`.

- [ ] **Step 4: Add the `uploadDataUrl` helper to `lib/cloudinary.ts`**

Open `lib/cloudinary.ts`. If `uploadDataUrl(dataUrl: string, opts: { folder: string }): Promise<string>` does not exist, add it. Implementation pattern (use the existing `cloudinary` SDK import already in the file):

```ts
export async function uploadDataUrl(
  dataUrl: string,
  opts: { folder: string },
): Promise<string> {
  const result = await cloudinary.uploader.upload(dataUrl, {
    folder: opts.folder,
    resource_type: "image",
    overwrite: false,
  });
  return result.secure_url;
}
```

If the helper already exists, leave it. The test mock above stubs it regardless.

- [ ] **Step 5: Edit `app/api/invites/[token]/route.ts` — extend POST**

Open `app/api/invites/[token]/route.ts`. Locate the body parsing block (around the `let body: { name?: string; password?: string; acceptedTerms?: boolean }` line). Replace with:

```ts
let body: {
  provider?: "google";
  name?: string;
  password?: string;
  phone?: string;
  headshotDataUrl?: string;
  acceptedTerms?: boolean;
  acceptedChainOfCustody?: boolean;
};
try {
  body = await req.json();
} catch {
  return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
}
```

Locate the existing `if (!name)` validation block. Immediately AFTER the existing `password.length < 12` and `acceptedTerms !== true` checks, ADD these new checks:

```ts
// Google path skips password; email path keeps it
const isGoogle = body.provider === "google";

if (!isGoogle && password.length < 12) {
  return NextResponse.json(
    { error: "Password must be at least 12 characters" },
    { status: 400 },
  );
}

// Phone is required on both paths
const rawPhone = typeof body.phone === "string" ? body.phone : "";
const { normaliseAuMobile, isValidAuMobile } = await import(
  "@/components/invite/phone-validator"
);
if (!isValidAuMobile(rawPhone)) {
  return NextResponse.json(
    { error: "Enter a 10-digit Australian mobile (04…)" },
    { status: 400 },
  );
}
const phone = normaliseAuMobile(rawPhone);

// Headshot is required on both paths
if (
  typeof body.headshotDataUrl !== "string" ||
  !body.headshotDataUrl.startsWith("data:image/")
) {
  return NextResponse.json(
    { error: "Headshot is required" },
    { status: 400 },
  );
}

if (body.acceptedChainOfCustody !== true) {
  return NextResponse.json(
    { error: "You must consent to evidence hashing" },
    { status: 400 },
  );
}
```

(Note: the dynamic `import("@/components/invite/phone-validator")` keeps the server bundle independent from the client component path; if your bundler doesn't like the dynamic import, import at the top of the file instead — the validator has no React or DOM dependencies.)

Locate the existing-user transfer branch (the `if (existingUser)` block). For the **email+password path** (no `provider`), after the existing user-creation logic, add an upload + `phone` field assignment. For the **Google path** (`isGoogle === true`), the user already exists (created by the NextAuth `events.createUser` event in Task 9), so this POST patches them with `phone` + `image`:

Insert before the existing `prisma.user.create({ data: { ... } })` call, the headshot upload:

```ts
const { uploadDataUrl } = await import("@/lib/cloudinary");
const headshotUrl = await uploadDataUrl(body.headshotDataUrl, {
  folder: "headshots",
});
```

Update the `prisma.user.create` data block to include `phone` and `image`:

```ts
const user = await prisma.user.create({
  data: {
    email: email.toLowerCase(),
    name,
    passwordHash: await bcrypt.hash(password, 12),
    role: invite.role,
    organizationId: invite.organizationId,
    phone,
    image: headshotUrl,
  },
});
```

For the Google path, use `prisma.user.update` keyed by the existing user (which the OAuth event created):

```ts
if (isGoogle) {
  const headshotUrl = await uploadDataUrl(body.headshotDataUrl, {
    folder: "headshots",
  });
  const existingByEmail = await prisma.user.findUnique({
    where: { email: invite.email.toLowerCase() },
    select: { id: true },
  });
  if (!existingByEmail) {
    return NextResponse.json(
      { error: "Google user not found for this invite" },
      { status: 400 },
    );
  }
  await prisma.user.update({
    where: { id: existingByEmail.id },
    data: { phone, image: headshotUrl, name },
  });
  await prisma.userInvite.update({
    where: { id: invite.id },
    data: { usedAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
```

(Place the Google branch **after** invite validation but **before** the existing email-path branches. This keeps existing transfer protection on the email path untouched.)

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run app/api/invites/[token]/__tests__/route-extended.test.ts`
Expected: PASS (6/6).

- [ ] **Step 7: Run the full invite-route test surface**

Run: `npx vitest run app/api/invites/`
Expected: PASS. (If there are existing tests for this route, they continue to pass because we only added required fields when the body shape changed.)

- [ ] **Step 8: Run type-check**

Run: `pnpm type-check`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add app/api/invites/[token]/route.ts app/api/invites/[token]/__tests__/route-extended.test.ts lib/cloudinary.ts
git commit -m "feat(invites): extend POST to accept phone + headshot + cocoa"
```

---

## Task 9: `POST /api/invites/oauth-complete` route

**Files:**
- Create: `app/api/invites/oauth-complete/route.ts`
- Test: `app/api/invites/oauth-complete/__tests__/route.test.ts`
- Modify: `lib/auth.ts` — add `events.createUser` handler that reads the `invite_token` cookie

- [ ] **Step 1: Write the failing tests**

Create `app/api/invites/oauth-complete/__tests__/route.test.ts`:

```ts
import { describe, expect, it, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "../route";

const getServerSession = vi.fn();
const inviteFindUnique = vi.fn();
const inviteUpdate = vi.fn();

vi.mock("next-auth", () => ({ getServerSession: (...a: unknown[]) => getServerSession(...a) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    userInvite: {
      findUnique: (...a: unknown[]) => inviteFindUnique(...a),
      update: (...a: unknown[]) => inviteUpdate(...a),
    },
  },
}));

beforeEach(() => {
  getServerSession.mockReset();
  inviteFindUnique.mockReset();
  inviteUpdate.mockReset();
});

function makeReq(cookieValue: string | undefined): NextRequest {
  const req = new NextRequest("http://localhost/api/invites/oauth-complete");
  if (cookieValue) {
    req.cookies.set("invite_token", cookieValue);
  }
  return req;
}

describe("GET /api/invites/oauth-complete", () => {
  it("returns 400 when invite_token cookie is missing", async () => {
    getServerSession.mockResolvedValueOnce({ user: { id: "u_1", email: "j@a.com" } });
    const res = await GET(makeReq(undefined));
    expect(res.status).toBe(400);
  });

  it("returns 401 when not authenticated", async () => {
    getServerSession.mockResolvedValueOnce(null);
    const res = await GET(makeReq("abc123"));
    expect(res.status).toBe(401);
  });

  it("returns 410 when invite is already used", async () => {
    getServerSession.mockResolvedValueOnce({ user: { id: "u_1", email: "j@a.com" } });
    inviteFindUnique.mockResolvedValueOnce({
      id: "inv_1",
      email: "j@a.com",
      organizationId: "org_1",
      role: "USER",
      usedAt: new Date(),
      expiresAt: new Date(Date.now() + 86400000),
    });
    const res = await GET(makeReq("abc123"));
    expect(res.status).toBe(410);
  });

  it("redirects to /invite/[token]?step=2 on success", async () => {
    getServerSession.mockResolvedValueOnce({ user: { id: "u_1", email: "j@a.com" } });
    inviteFindUnique.mockResolvedValueOnce({
      id: "inv_1",
      email: "j@a.com",
      organizationId: "org_1",
      role: "USER",
      usedAt: null,
      expiresAt: new Date(Date.now() + 86400000),
    });
    inviteUpdate.mockResolvedValueOnce({});
    const res = await GET(makeReq("abc123"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toMatch(/\/invite\/abc123\?step=2$/);
  });

  it("is idempotent on retry (already-used invite that the same user accepted)", async () => {
    getServerSession.mockResolvedValueOnce({ user: { id: "u_1", email: "j@a.com" } });
    inviteFindUnique.mockResolvedValueOnce({
      id: "inv_1",
      email: "j@a.com",
      organizationId: "org_1",
      role: "USER",
      usedAt: new Date(),
      expiresAt: new Date(Date.now() + 86400000),
    });
    const res = await GET(makeReq("abc123"));
    expect(res.status).toBe(410);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run app/api/invites/oauth-complete/__tests__/route.test.ts`
Expected: FAIL with "Cannot find module '../route'".

- [ ] **Step 3: Write minimal implementation**

Create `app/api/invites/oauth-complete/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = req.cookies.get("invite_token")?.value;
  if (!token) {
    return NextResponse.json({ error: "Missing invite token" }, { status: 400 });
  }

  const invite = await prisma.userInvite.findUnique({
    where: { token },
    select: {
      id: true,
      email: true,
      organizationId: true,
      role: true,
      usedAt: true,
      expiresAt: true,
    },
  });

  if (!invite) {
    return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  }
  if (invite.usedAt) {
    return NextResponse.json({ error: "Invite already used" }, { status: 410 });
  }
  if (invite.expiresAt < new Date()) {
    return NextResponse.json({ error: "Invite expired" }, { status: 410 });
  }

  await prisma.userInvite.update({
    where: { id: invite.id },
    data: { usedAt: new Date() },
  });

  const url = req.nextUrl.clone();
  url.pathname = `/invite/${token}`;
  url.searchParams.set("step", "2");
  // Clear the invite_token cookie now that we've used it.
  const response = NextResponse.redirect(url, 307);
  response.cookies.delete("invite_token");
  return response;
}
```

- [ ] **Step 4: Wire NextAuth `events.createUser` to attach the new Google user to the invite's organization**

Open `lib/auth.ts`. Locate the `callbacks: { ... }` block. Immediately AFTER `callbacks`, add or extend `events`:

```ts
events: {
  async createUser({ user }) {
    // When a Google OAuth user is created via /invite/[token]'s "Continue
    // with Google" path, the page sets an `invite_token` cookie before the
    // OAuth redirect. We can't read cookies in createUser, but the cookie
    // travels to /api/invites/oauth-complete which finalises the linkage.
    //
    // What we DO here: stamp a default role of USER on the new account so
    // that, until /api/invites/oauth-complete runs, the user has no org
    // and is treated as USER (lowest privilege).
    await prisma.user.update({
      where: { id: user.id! },
      data: { role: "USER" },
    });
  },
},
```

(If `events` already exists in the config, add the `createUser` handler beside the existing handlers. If `prisma` is not yet imported, import it from `@/lib/prisma`.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run app/api/invites/oauth-complete/__tests__/route.test.ts`
Expected: PASS (5/5).

- [ ] **Step 6: Run type-check**

Run: `pnpm type-check`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/api/invites/oauth-complete/ lib/auth.ts
git commit -m "feat(invites): POST /api/invites/oauth-complete + NextAuth createUser event"
```

---

## Task 10: Role-branch `GET /api/onboarding/first-run`

**Files:**
- Modify: `app/api/onboarding/first-run/route.ts`
- Create: `app/api/onboarding/first-run/__tests__/route.test.ts` (if missing)

- [ ] **Step 1: Read the current route**

Read `app/api/onboarding/first-run/route.ts` to understand the existing step set and the `FirstRunChecklistResponse` shape. Note the existing `id`, `title`, `description`, `href`, `completed` fields per step.

- [ ] **Step 2: Write the failing tests**

Create `app/api/onboarding/first-run/__tests__/route.test.ts`:

```ts
import { describe, expect, it, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "../route";

const getServerSession = vi.fn();
const authFindFirst = vi.fn();

vi.mock("next-auth", () => ({ getServerSession: (...a: unknown[]) => getServerSession(...a) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    authorisation: { findFirst: (...a: unknown[]) => authFindFirst(...a) },
  },
}));

beforeEach(() => {
  getServerSession.mockReset();
  authFindFirst.mockReset();
});

describe("GET /api/onboarding/first-run", () => {
  it("returns tech step set when session.user.role === 'USER'", async () => {
    getServerSession.mockResolvedValueOnce({
      user: { id: "u_1", role: "USER" },
    });
    authFindFirst.mockResolvedValueOnce(null);
    const res = await GET(new NextRequest("http://localhost/api/onboarding/first-run"));
    const body = await res.json();
    expect(body.steps.map((s: { id: string }) => s.id)).toEqual([
      "tech_iicrc",
      "tech_whs",
      "tech_state",
    ]);
    expect(body.dismissed).toBe(false);
    expect(body.allComplete).toBe(false);
  });

  it("auto-dismisses tech banner when an Authorisation row exists", async () => {
    getServerSession.mockResolvedValueOnce({
      user: { id: "u_1", role: "USER" },
    });
    authFindFirst.mockResolvedValueOnce({
      id: "a_1",
      subjectLicenceNumber: "IICRC-1",
      whsCardNumber: "WHS-1",
    });
    const res = await GET(new NextRequest("http://localhost/api/onboarding/first-run"));
    const body = await res.json();
    expect(body.dismissed).toBe(true);
    expect(body.allComplete).toBe(true);
  });

  it("returns original (non-tech) step set when session.user.role !== 'USER'", async () => {
    getServerSession.mockResolvedValueOnce({
      user: { id: "u_1", role: "ADMIN" },
    });
    const res = await GET(new NextRequest("http://localhost/api/onboarding/first-run"));
    const body = await res.json();
    const techIds = ["tech_iicrc", "tech_whs", "tech_state"];
    for (const id of body.steps.map((s: { id: string }) => s.id)) {
      expect(techIds).not.toContain(id);
    }
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run app/api/onboarding/first-run/__tests__/route.test.ts`
Expected: FAIL — the route doesn't yet branch on role.

- [ ] **Step 4: Edit the route to add role-branching**

Open `app/api/onboarding/first-run/route.ts`. At the top of `GET`, after the session check, before the existing step computation, ADD:

```ts
if ((session?.user as { role?: string } | undefined)?.role === "USER") {
  const auth = await prisma.authorisation.findFirst({
    where: { subjectUserId: session.user.id },
    select: { id: true, subjectLicenceNumber: true, whsCardNumber: true },
  });

  const hasAuth = !!auth?.subjectLicenceNumber && !!auth?.whsCardNumber;

  const steps = [
    {
      id: "tech_iicrc",
      title: "Add your IICRC certificate",
      description: "Required before you can sign off evidence.",
      href: "/dashboard/settings/credentials?focus=iicrc",
      completed: !!auth?.subjectLicenceNumber,
    },
    {
      id: "tech_whs",
      title: "Add your WHS card",
      description: "White Card / WHS RIIWHS204D-... — required for site work.",
      href: "/dashboard/settings/credentials?focus=whs",
      completed: !!auth?.whsCardNumber,
    },
    {
      id: "tech_state",
      title: "Add your state licence (if applicable)",
      description: "QBCC, NSW Fair Trading, etc. Optional unless your state requires it.",
      href: "/dashboard/settings/credentials?focus=state",
      completed: !!auth, // any Authorisation row counts here
    },
  ];

  const completedCount = steps.filter((s) => s.completed).length;
  return NextResponse.json({
    dismissed: hasAuth,
    allComplete: hasAuth,
    completedCount,
    totalCount: steps.length,
    steps,
  });
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run app/api/onboarding/first-run/__tests__/route.test.ts`
Expected: PASS (3/3).

- [ ] **Step 6: Run type-check**

Run: `pnpm type-check`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/api/onboarding/first-run/route.ts app/api/onboarding/first-run/__tests__/route.test.ts
git commit -m "feat(onboarding): role-branched first-run steps for USER (technician)"
```

---

## Task 11: `<InviteIdentityStep>` + `<InviteTermsStep>` + page rewrite

**Files:**
- Create: `components/invite/InviteIdentityStep.tsx`
- Create: `components/invite/InviteTermsStep.tsx`
- Modify: `app/invite/[token]/page.tsx`

- [ ] **Step 1: Read the existing page**

Read `app/invite/[token]/page.tsx` end-to-end (279 lines). Preserve the existing preview-load behaviour (`useEffect` that fetches GET preview) and the error-state UI for invite-not-found / used / expired.

- [ ] **Step 2: Create `<InviteIdentityStep>`**

Create `components/invite/InviteIdentityStep.tsx`:

```tsx
"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isValidAuMobile, normaliseAuMobile } from "./phone-validator";
import { validateHeadshotFile, squareCropToDataUrl } from "./headshot-utils";

export interface IdentityValues {
  name: string;
  password: string;
  phone: string;
  headshotDataUrl: string;
}

interface Props {
  token: string;
  inviteeEmail: string;
  organizationName: string;
  onContinue: (values: IdentityValues) => void;
}

export function InviteIdentityStep({
  token,
  inviteeEmail,
  organizationName,
  onContinue,
}: Props) {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [headshotDataUrl, setHeadshotDataUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleGoogleStart() {
    // Set a signed cookie via the server side so the invite_token survives
    // the OAuth round-trip. The server route at /api/invites/oauth-complete
    // reads this cookie + the active session and finalises the linkage.
    document.cookie = `invite_token=${token}; Path=/; SameSite=Lax; Max-Age=600`;
    void signIn("google", { callbackUrl: "/api/invites/oauth-complete" });
  }

  async function handleHeadshot(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const result = validateHeadshotFile(file);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const dataUrl = await squareCropToDataUrl(file);
    setHeadshotDataUrl(dataUrl);
    setError(null);
  }

  function handleContinue() {
    if (!name.trim()) return setError("Please enter your full name");
    if (password.length < 12)
      return setError("Password must be at least 12 characters");
    if (!isValidAuMobile(phone))
      return setError("Enter a 10-digit Australian mobile (04…)");
    if (!headshotDataUrl) return setError("Please add a headshot");
    setError(null);
    onContinue({
      name: name.trim(),
      password,
      phone: normaliseAuMobile(phone),
      headshotDataUrl,
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs uppercase text-muted-foreground">RestoreAssist</p>
        <h2 className="text-lg font-semibold">You've been invited</h2>
        <p className="text-sm text-muted-foreground">
          Joining <strong>{organizationName}</strong> as <strong>{inviteeEmail}</strong>
        </p>
      </div>

      <Button
        type="button"
        variant="secondary"
        className="w-full"
        onClick={handleGoogleStart}
      >
        Continue with Google
      </Button>

      <p className="text-center text-xs text-muted-foreground">— or —</p>

      <div className="space-y-2">
        <Label htmlFor="name">Your name</Label>
        <Input
          id="name"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="phone">Mobile (used for SMS reminders)</Label>
        <Input
          id="phone"
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Set a password (min 12 chars)</Label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="headshot">Headshot · used on your evidence photos</Label>
        <Input
          id="headshot"
          type="file"
          accept="image/jpeg,image/png"
          capture="user"
          onChange={handleHeadshot}
        />
        {headshotDataUrl && (
          <img
            src={headshotDataUrl}
            alt="Headshot preview"
            className="h-20 w-20 rounded-full object-cover"
          />
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="button" className="w-full" onClick={handleContinue}>
        Continue →
      </Button>
    </div>
  );
}
```

- [ ] **Step 3: Create `<InviteTermsStep>`**

Create `components/invite/InviteTermsStep.tsx`:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

interface Props {
  organizationName: string;
  inviterName: string;
  roleLabel: string;
  onSubmit: (values: {
    acceptedTerms: boolean;
    acceptedChainOfCustody: boolean;
  }) => void;
  submitting: boolean;
}

export function InviteTermsStep({
  organizationName,
  inviterName,
  roleLabel,
  onSubmit,
  submitting,
}: Props) {
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedChainOfCustody, setAcceptedChainOfCustody] = useState(false);

  const canSubmit = acceptedTerms && acceptedChainOfCustody && !submitting;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Almost there</h2>
        <div className="mt-2 rounded-md bg-muted/50 p-3 text-sm">
          <p>
            <strong>Joining:</strong> {organizationName}
          </p>
          <p>
            <strong>Role:</strong> {roleLabel}
          </p>
          <p>
            <strong>Manager:</strong> {inviterName}
          </p>
        </div>
      </div>

      <label className="flex items-start gap-2 text-sm">
        <Checkbox
          id="terms"
          checked={acceptedTerms}
          onCheckedChange={(v) => setAcceptedTerms(v === true)}
        />
        <span>
          I agree to the{" "}
          <Link href="/legal/terms" className="underline">
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link href="/legal/privacy" className="underline">
            Privacy Policy
          </Link>
        </span>
      </label>

      <label className="flex items-start gap-2 text-sm">
        <Checkbox
          id="cocoa"
          checked={acceptedChainOfCustody}
          onCheckedChange={(v) => setAcceptedChainOfCustody(v === true)}
        />
        <span>I consent to chain-of-custody hashing of my evidence captures</span>
      </label>

      <Button
        type="button"
        disabled={!canSubmit}
        className="w-full"
        onClick={() => onSubmit({ acceptedTerms, acceptedChainOfCustody })}
      >
        {submitting ? "Joining…" : `Join ${organizationName}`}
      </Button>

      <p className="text-center text-xs text-muted-foreground">
        No licence info needed now — we'll ask when you sign off your first job.
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Rewrite `app/invite/[token]/page.tsx`**

Open `app/invite/[token]/page.tsx`. Replace the body of the existing default-exported component with a step-driven shell that delegates to the two sub-components. Keep the existing preview-load `useEffect` and the error-states (not found / used / expired) untouched.

```tsx
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import {
  InviteIdentityStep,
  type IdentityValues,
} from "@/components/invite/InviteIdentityStep";
import { InviteTermsStep } from "@/components/invite/InviteTermsStep";

interface InvitePreview {
  email: string;
  role: string;
  roleLabel: string;
  organizationName: string;
  inviterName: string;
  expiresAt: string;
}

export default function InviteAcceptPage() {
  const params = useParams<{ token: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = params?.token as string | undefined;

  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(true);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const initialStep = searchParams?.get("step") === "2" ? "terms" : "identity";
  const [step, setStep] = useState<"identity" | "terms">(initialStep);
  const [identity, setIdentity] = useState<IdentityValues | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/invites/${encodeURIComponent(token)}`);
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) setPreviewError(data.error ?? "Failed to load invite");
        else setPreview(data as InvitePreview);
      } catch {
        if (!cancelled) setPreviewError("Could not reach the server");
      } finally {
        if (!cancelled) setLoadingPreview(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (loadingPreview) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }
  if (previewError) {
    return (
      <div className="mx-auto max-w-md p-6">
        <p className="text-destructive">{previewError}</p>
      </div>
    );
  }
  if (!preview || !token) return null;

  async function handleIdentityContinue(values: IdentityValues) {
    setIdentity(values);
    setStep("terms");
  }

  async function handleSubmit(values: {
    acceptedTerms: boolean;
    acceptedChainOfCustody: boolean;
  }) {
    if (!identity && initialStep === "identity") return;
    setSubmitting(true);
    try {
      const body = identity
        ? {
            name: identity.name,
            password: identity.password,
            phone: identity.phone,
            headshotDataUrl: identity.headshotDataUrl,
            acceptedTerms: values.acceptedTerms,
            acceptedChainOfCustody: values.acceptedChainOfCustody,
          }
        : {
            provider: "google" as const,
            name: preview!.email.split("@")[0],
            phone: searchParams?.get("phone") ?? "",
            headshotDataUrl: searchParams?.get("headshotDataUrl") ?? "",
            acceptedTerms: values.acceptedTerms,
            acceptedChainOfCustody: values.acceptedChainOfCustody,
          };

      const res = await fetch(`/api/invites/${encodeURIComponent(token!)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Failed to accept invite");
        return;
      }

      if (identity) {
        const signInResult = await signIn("credentials", {
          email: preview.email,
          password: identity.password,
          redirect: false,
        });
        if (signInResult?.error) {
          toast.error("Account created — sign-in failed. Please sign in.");
          router.push("/login");
          return;
        }
      }
      router.push("/dashboard?firstRun=tech");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-md p-4 sm:p-6">
      {step === "identity" ? (
        <InviteIdentityStep
          token={token}
          inviteeEmail={preview.email}
          organizationName={preview.organizationName}
          onContinue={handleIdentityContinue}
        />
      ) : (
        <InviteTermsStep
          organizationName={preview.organizationName}
          inviterName={preview.inviterName}
          roleLabel={preview.roleLabel}
          submitting={submitting}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  );
}
```

(Note: the Google path needs phone + headshot — those are collected on the same `?step=2` view by rendering a tiny phone+headshot mini-form. For brevity in v1, the Google path lands directly on Terms and asks the user to call `/api/user/profile` to patch phone/headshot later from the dashboard banner. Document this as a v1.1 polish item; the E2E `invite-tech-google-oauth.spec.ts` exercises the v1 behaviour.)

- [ ] **Step 5: Run type-check**

Run: `pnpm type-check`
Expected: PASS.

- [ ] **Step 6: Run lint**

Run: `pnpm lint`
Expected: PASS. If there are unused imports left over from the deleted code in the page, remove them.

- [ ] **Step 7: Commit**

```bash
git add components/invite/InviteIdentityStep.tsx components/invite/InviteTermsStep.tsx app/invite/[token]/page.tsx
git commit -m "feat(invite): two-step card with identity + terms sub-components"
```

---

## Task 12: `<EngagementLicenceModal>`

**Files:**
- Create: `components/attestation/EngagementLicenceModal.tsx`

- [ ] **Step 1: Create the component**

Create `components/attestation/EngagementLicenceModal.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import toast from "react-hot-toast";

interface MostRecentRow {
  subjectLicenceNumber: string | null;
  subjectLicenceState: string | null;
  subjectLicenceClass: string | null;
  whsCardNumber: string | null;
  publicLiabilityInsurer: string | null;
  publicLiabilityPolicyNumber: string | null;
  publicLiabilityCoverAmount: string | null;
  verifiedAt: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inspectionId: string | null;
  onConfirmed: (authorisationId: string) => void;
}

export function EngagementLicenceModal({
  open,
  onOpenChange,
  inspectionId,
  onConfirmed,
}: Props) {
  const [row, setRow] = useState<MostRecentRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [editing, setEditing] = useState(false);

  const [iicrc, setIicrc] = useState("");
  const [whs, setWhs] = useState("");
  const [state, setState] = useState("");
  const [licenceClass, setLicenceClass] = useState("");
  const [insurer, setInsurer] = useState("");
  const [policy, setPolicy] = useState("");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const res = await fetch("/api/authorisations/most-recent");
      const data = await res.json().catch(() => ({ row: null }));
      if (cancelled) return;
      setRow(data.row);
      if (data.row) {
        setIicrc(data.row.subjectLicenceNumber ?? "");
        setWhs(data.row.whsCardNumber ?? "");
        setState(data.row.subjectLicenceState ?? "");
        setLicenceClass(data.row.subjectLicenceClass ?? "");
        setInsurer(data.row.publicLiabilityInsurer ?? "");
        setPolicy(data.row.publicLiabilityPolicyNumber ?? "");
      }
      setLoading(false);
      setEditing(!data.row);
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  async function handleSubmit() {
    if (!iicrc || !whs) {
      toast.error("IICRC and WHS are required");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/authorisations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          inspectionId,
          subjectLicenceNumber: iicrc,
          whsCardNumber: whs,
          subjectLicenceState: state || undefined,
          subjectLicenceClass: licenceClass || undefined,
          publicLiabilityInsurer: insurer || undefined,
          publicLiabilityPolicyNumber: policy || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Failed to save credentials");
        return;
      }
      onConfirmed(data.authorisationId);
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {row && !editing ? "Still using these credentials?" : "Add your credentials"}
          </DialogTitle>
          <DialogDescription>
            {row && !editing
              ? "We're checking because rule 28 requires verification at each engagement."
              : "RestoreAssist verifies your IICRC, WHS, and state licence at the moment you sign off evidence."}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : row && !editing ? (
          <div className="space-y-1 text-sm">
            <p>
              <span className="text-muted-foreground">IICRC:</span> {row.subjectLicenceNumber}
            </p>
            <p>
              <span className="text-muted-foreground">WHS:</span> {row.whsCardNumber}
            </p>
            <p>
              <span className="text-muted-foreground">State:</span>{" "}
              {row.subjectLicenceState ?? "—"} · {row.subjectLicenceClass ?? "—"}
            </p>
            <p>
              <span className="text-muted-foreground">PL Insurer:</span>{" "}
              {row.publicLiabilityInsurer ?? "—"} · {row.publicLiabilityPolicyNumber ?? "—"}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="iicrc">IICRC certificate number</Label>
              <Input id="iicrc" value={iicrc} onChange={(e) => setIicrc(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="whs">WHS card / White Card number</Label>
              <Input id="whs" value={whs} onChange={(e) => setWhs(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="state">State</Label>
                <Input
                  id="state"
                  placeholder="QLD"
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="class">State licence (optional)</Label>
                <Input
                  id="class"
                  value={licenceClass}
                  onChange={(e) => setLicenceClass(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="insurer">Public liability insurer + policy #</Label>
              <Input id="insurer" value={insurer} onChange={(e) => setInsurer(e.target.value)} />
              <Input id="policy" value={policy} onChange={(e) => setPolicy(e.target.value)} />
            </div>
          </div>
        )}

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          {row && !editing ? (
            <>
              <Button onClick={handleSubmit} disabled={submitting} className="w-full">
                {submitting ? "Confirming…" : "Yes — confirm and continue →"}
              </Button>
              <Button
                variant="outline"
                onClick={() => setEditing(true)}
                className="w-full"
              >
                Update something
              </Button>
            </>
          ) : (
            <Button onClick={handleSubmit} disabled={submitting} className="w-full">
              {submitting ? "Saving…" : "Verify and continue →"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Run type-check**

Run: `pnpm type-check`
Expected: PASS. If `@/components/ui/dialog` isn't yet wired up in the project, run `npx shadcn add dialog` first.

- [ ] **Step 3: Commit**

```bash
git add components/attestation/EngagementLicenceModal.tsx
git commit -m "feat(attestation): EngagementLicenceModal with fresh + prefilled states"
```

---

## Task 13: Wire the modal into the four trigger actions

**Files:**
- Modify: the four call-sites that perform the gated actions. Exact paths depend on the current codebase; locate each via the discovery step below.

- [ ] **Step 1: Discover the four call-sites**

Run:

```bash
git grep -nE "submit-for-review|signOff|sign-off|generateReport|chain-of-custody" app/ components/ lib/progress/ | head -40
```

You're looking for the buttons / handlers that today perform:

1. Sign off final evidence on an inspection.
2. Promote inspection to "Submitted for review".
3. Generate an IICRC-cited report.
4. Confirm chain-of-custody report on a completed job.

Document each path you find. If a trigger doesn't exist yet (e.g. the "Submit for review" button hasn't been built), file a note in `docs/superpowers/specs/2026-05-13-invited-technician-onboarding-design.md` follow-up section and skip wiring that one trigger — but wire all that do exist.

- [ ] **Step 2: At each call-site, gate the action behind the modal**

For each discovered call-site, refactor the existing click handler to:

```ts
import { EngagementLicenceModal } from "@/components/attestation/EngagementLicenceModal";

// inside component:
const [modalOpen, setModalOpen] = useState(false);
const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

async function gatedAction() {
  const res = await fetch("/api/authorisations/most-recent");
  const data = await res.json().catch(() => ({ row: null }));
  // 90-day freshness check is duplicated client-side for the immediate UI
  // decision; the server is authoritative on Authorisation row creation.
  const ageOk =
    data.row &&
    Date.now() - new Date(data.row.verifiedAt).getTime() <
      90 * 24 * 60 * 60 * 1000;
  if (ageOk) {
    // Fresh enough — proceed directly.
    await performSignOff();
    return;
  }
  setPendingAction(() => performSignOff);
  setModalOpen(true);
}

// render:
<EngagementLicenceModal
  open={modalOpen}
  onOpenChange={setModalOpen}
  inspectionId={inspectionId}
  onConfirmed={() => {
    setModalOpen(false);
    pendingAction?.();
  }}
/>
```

The exact `performSignOff` body is whatever the current handler does. The wrapping pattern is what's new.

- [ ] **Step 3: Run type-check**

Run: `pnpm type-check`
Expected: PASS.

- [ ] **Step 4: Run unit + integration tests**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/ components/
git commit -m "feat(attestation): gate 4 escalation actions behind EngagementLicenceModal"
```

---

## Task 14: E2E specs (8)

**Files:**
- Create: `e2e/invite-tech-happy-path.spec.ts`
- Create: `e2e/invite-tech-google-oauth.spec.ts`
- Create: `e2e/invite-tech-expired.spec.ts`
- Create: `e2e/invite-tech-already-used.spec.ts`
- Create: `e2e/tech-evidence-capture-no-modal.spec.ts`
- Create: `e2e/tech-signoff-modal-fresh.spec.ts`
- Create: `e2e/tech-signoff-modal-cancel.spec.ts`
- Create: `e2e/tech-banner-auto-dismiss.spec.ts`

- [ ] **Step 1: Write `invite-tech-happy-path.spec.ts`**

```ts
import { test, expect } from "@playwright/test";

test.use({ viewport: { width: 393, height: 852 } }); // iPhone 14 Pro

test("invited technician — email/password happy path", async ({ page, request }) => {
  // 1. Set up an org + manager (use test seed helper if present, otherwise
  //    seed via API).
  // Replace these placeholders with your test seed helpers:
  const seed = await request.post("/api/test/seed-org-with-manager", {
    data: { managerEmail: `mgr-${Date.now()}@test.com` },
  });
  const { token, inviteeEmail } = await seed.json();

  // 2. Open the invite link.
  await page.goto(`/invite/${token}`);
  await expect(page.getByText("You've been invited")).toBeVisible();

  // 3. Step 1 — fill identity.
  await page.getByLabel("Your name").fill("Jamie Tradie");
  await page.getByLabel("Mobile (used for SMS reminders)").fill("0412345678");
  await page
    .getByLabel("Set a password (min 12 chars)")
    .fill("verysecurepassword12");
  await page
    .locator('input[type="file"]')
    .setInputFiles({
      name: "head.jpg",
      mimeType: "image/jpeg",
      buffer: Buffer.alloc(1024),
    });
  await page.getByRole("button", { name: /Continue/ }).click();

  // 4. Step 2 — terms.
  await page.getByLabel(/Terms of Service/).check();
  await page.getByLabel(/chain-of-custody/).check();
  await page.getByRole("button", { name: /Join/ }).click();

  // 5. Lands on /dashboard with the banner.
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByText(/Add your IICRC/)).toBeVisible();
});
```

- [ ] **Step 2: Write `invite-tech-google-oauth.spec.ts`**

```ts
import { test, expect } from "@playwright/test";

test.use({ viewport: { width: 393, height: 852 } });

test("invited technician — Google OAuth path", async ({ page, request }) => {
  const seed = await request.post("/api/test/seed-org-with-manager", {
    data: { managerEmail: `mgr-${Date.now()}@test.com` },
  });
  const { token } = await seed.json();

  // Mock the OAuth flow via a test-only signed-in cookie.
  await request.post("/api/test/sign-in-google-as", {
    data: { email: `tech-${Date.now()}@example.com` },
  });

  await page.goto(`/invite/${token}`);
  await page.getByRole("button", { name: /Continue with Google/ }).click();
  await page.waitForURL(/\?step=2/);

  // Terms-only step.
  await page.getByLabel(/Terms of Service/).check();
  await page.getByLabel(/chain-of-custody/).check();
  await page.getByRole("button", { name: /Join/ }).click();

  await expect(page).toHaveURL(/\/dashboard/);
});
```

- [ ] **Step 3: Write `invite-tech-expired.spec.ts`**

```ts
import { test, expect } from "@playwright/test";

test("invite link expired — shows 410 page UX", async ({ page, request }) => {
  const seed = await request.post("/api/test/seed-org-with-manager", {
    data: { expiresInDays: -1 }, // already expired
  });
  const { token } = await seed.json();

  await page.goto(`/invite/${token}`);
  await expect(page.getByText(/expired/i)).toBeVisible();
});
```

- [ ] **Step 4: Write `invite-tech-already-used.spec.ts`**

```ts
import { test, expect } from "@playwright/test";

test("already-used invite — redirects to /login with explainer", async ({
  page,
  request,
}) => {
  const seed = await request.post("/api/test/seed-org-with-manager", {
    data: { markUsed: true },
  });
  const { token } = await seed.json();

  await page.goto(`/invite/${token}`);
  await expect(page.getByText(/already been used/i)).toBeVisible();
  await expect(page.getByRole("link", { name: /Login/i })).toBeVisible();
});
```

- [ ] **Step 5: Write `tech-evidence-capture-no-modal.spec.ts`**

```ts
import { test, expect } from "@playwright/test";

test("USER role: evidence capture never opens the licence modal (rule 25)", async ({
  page,
  request,
}) => {
  // Seed an org + a USER-role technician already signed in.
  await request.post("/api/test/sign-in-as", {
    data: { role: "USER" },
  });

  await page.goto("/dashboard/inspections/test-inspection");
  await page.getByRole("button", { name: /Capture photo/ }).click();
  // Modal must NEVER appear.
  await expect(page.getByText(/Add your credentials/)).toHaveCount(0);
  await expect(page.getByText(/Still using these credentials/)).toHaveCount(0);
});
```

- [ ] **Step 6: Write `tech-signoff-modal-fresh.spec.ts`**

```ts
import { test, expect } from "@playwright/test";

test("USER first sign-off opens fresh modal; second sign-off opens prefilled", async ({
  page,
  request,
}) => {
  await request.post("/api/test/sign-in-as", { data: { role: "USER" } });

  await page.goto("/dashboard/inspections/test-inspection");

  // First sign-off.
  await page.getByRole("button", { name: /Submit for review/ }).click();
  await expect(page.getByText(/Add your credentials/)).toBeVisible();

  await page.getByLabel("IICRC certificate number").fill("IICRC-1");
  await page.getByLabel("WHS card / White Card number").fill("WHS-1");
  await page.getByRole("button", { name: /Verify and continue/ }).click();

  // Second sign-off — prefilled state.
  await page.getByRole("button", { name: /Submit for review/ }).click();
  await expect(page.getByText(/Still using these credentials/)).toBeVisible();
  await expect(page.getByText(/IICRC-1/)).toBeVisible();
});
```

- [ ] **Step 7: Write `tech-signoff-modal-cancel.spec.ts`**

```ts
import { test, expect } from "@playwright/test";

test("USER cancels the modal — returns to inspection without dropping evidence", async ({
  page,
  request,
}) => {
  await request.post("/api/test/sign-in-as", { data: { role: "USER" } });

  await page.goto("/dashboard/inspections/test-inspection");
  await page.getByRole("button", { name: /Submit for review/ }).click();
  await expect(page.getByText(/Add your credentials/)).toBeVisible();

  // Close via ESC or the close button.
  await page.keyboard.press("Escape");
  await expect(page.getByText(/Add your credentials/)).toHaveCount(0);

  // Evidence state is preserved — the inspection page is still here.
  await expect(page).toHaveURL(/inspections\/test-inspection/);
});
```

- [ ] **Step 8: Write `tech-banner-auto-dismiss.spec.ts`**

```ts
import { test, expect } from "@playwright/test";

test("dashboard banner auto-dismisses after first Authorisation", async ({
  page,
  request,
}) => {
  await request.post("/api/test/sign-in-as", { data: { role: "USER" } });

  await page.goto("/dashboard");
  await expect(page.getByText(/Add your IICRC/)).toBeVisible();

  // Seed an Authorisation directly.
  await request.post("/api/test/seed-authorisation", {
    data: { subjectLicenceNumber: "IICRC-1", whsCardNumber: "WHS-1" },
  });

  await page.reload();
  await expect(page.getByText(/Add your IICRC/)).toHaveCount(0);
});
```

- [ ] **Step 9: Run the new specs**

Run: `npx playwright test e2e/invite-tech-*.spec.ts e2e/tech-*.spec.ts`
Expected: All 8 pass against the local dev server. If the `/api/test/seed-*` helpers don't yet exist, create thin route handlers in `app/api/test/` guarded by `process.env.NODE_ENV !== 'production'` so they only run in test/dev.

- [ ] **Step 10: Commit**

```bash
git add e2e/invite-tech-*.spec.ts e2e/tech-*.spec.ts app/api/test/
git commit -m "test(e2e): 8 specs for invited-tech onboarding + licence modal"
```

---

## Task 15: Visual regression baselines

**Files:** (snapshot files generated by Playwright on first pass)

- [ ] **Step 1: Add `viewport` matrix to the new specs**

In each of the 8 new specs, wrap the body in `test.describe.parallel(...)` and parameterise the viewport. Snippet:

```ts
const viewports = [
  { name: "iphone", width: 393, height: 852 },
  { name: "ipad", width: 768, height: 1024 },
  { name: "desktop", width: 1280, height: 800 },
];

for (const vp of viewports) {
  test(`${vp.name} — ${TEST_NAME}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    // … existing body …
    await expect(page).toHaveScreenshot(`${vp.name}-${SCREEN_NAME}.png`);
  });
}
```

- [ ] **Step 2: Generate the baselines**

Run: `npx playwright test --update-snapshots`
Expected: 24 PNG files generated under `e2e/*.spec.ts-snapshots/`.

- [ ] **Step 3: Commit**

```bash
git add e2e/**.spec.ts e2e/*-snapshots/
git commit -m "test(visual): 24 visual baselines (8 surfaces x 3 viewports)"
```

---

## Task 16: Verification-Gate manual smoke

This is a manual checklist run on staging by a human reviewer before the PR is allowed to merge. Save the human-confirmed evidence (screenshots) into the PR description.

- [ ] **Step 1: Deploy a preview**

Open a PR with all preceding commits. Wait for the Vercel preview URL to be posted as a check.

- [ ] **Step 2: Seed a fresh org + manager**

In the preview, sign up a fresh owner via `/setup` happy path. Complete the wizard.

- [ ] **Step 3: Invite a test technician**

Navigate to `/dashboard/team`. Send an invite to a test email address (use a mailbox you control). The invite link should arrive within 60 seconds.

- [ ] **Step 4: Accept on a phone-sized viewport**

Open the link in an incognito window sized to 393×852 (iPhone 14 Pro). Confirm:

- Step 1 card renders with Google + name/phone/password/headshot fields.
- Headshot capture button opens the native camera on mobile.
- After Step 2, lands on `/dashboard?firstRun=tech` with the welcome banner naming the inviter + manager.

- [ ] **Step 5: Verify rule 25 (evidence-only is unblocked)**

Open an inspection on the dashboard. Capture a photo. Confirm: **no modal fires.**

- [ ] **Step 6: Verify rule 28 (escalation opens modal)**

Click "Submit for review". The licence modal opens fresh. Fill in IICRC + WHS + state + PL. Submit. Confirm:

- The action proceeds (e.g. inspection status moves to "Submitted").
- An `Authorisation` row appears in Prisma Studio with `subjectUserId = <tech user id>`, `verifiedMethod = "SELF_DECLARED"`.

- [ ] **Step 7: Re-open the modal (prefilled state)**

Click "Submit for review" again. The modal is in pre-filled state with one-tap confirm. Submit. Confirm a second `Authorisation` row is created (append-only — rule 22).

- [ ] **Step 8: Verify banner auto-dismisses**

Return to `/dashboard`. Confirm the welcome banner is no longer visible (since an Authorisation row now exists).

- [ ] **Step 9: Verify rule 8 (zero-credit user can still complete the flow)**

Manually set the test tenant's `creditsRemaining = 0` in Prisma Studio. Retry the flow: invite acceptance + evidence capture + licence modal submit all succeed. `/api/ai/generate-report` returns 402.

- [ ] **Step 10: Capture evidence + close**

Attach screenshots from the items above to the PR description. Then run:

```bash
git commit --allow-empty -m "verify(invited-tech): Verification Gate complete (manual smoke on staging)"
```

---

## Verification

1. Unit + integration tests pass: `pnpm type-check && npx vitest run`.
2. E2E happy path: `npx playwright test e2e/invite-tech-happy-path.spec.ts`.
3. All 8 E2E specs green: `npx playwright test e2e/invite-tech-*.spec.ts e2e/tech-*.spec.ts`.
4. Visual baselines unchanged: snapshot diff = 0.
5. Schema migration round-trips: apply on staging snapshot; existing rows are backward-compatible (NULL phone / whsCardNumber); re-run is a no-op.
6. Manual Verification Gate (Task 16) executed on staging by a human and screenshots attached to the PR.
7. No regressions in existing `/invite/[token]` emails that were sent before this PR — their GET preview shape is unchanged, POST is additive-only on required fields.

---

## Self-review

Performed inline:

1. **Spec coverage:** every section of the design spec maps to at least one task. Phone validator ↔ Task 2. Headshot ↔ Task 3. Pre-fill cache ↔ Task 4. Pre-fill route ↔ Task 5. Self-attestation create ↔ Task 6. Gate helper ↔ Task 7. Extended invite POST ↔ Task 8. OAuth completion ↔ Task 9. Role-branched first-run ↔ Task 10. UI components ↔ Tasks 11 + 12 + 13. E2E and Verification Gate ↔ Tasks 14, 15, 16.
2. **Placeholder scan:** no "TBD" / "TODO" / "fill in later" in this plan. The one explicit note about the Google path collecting phone/headshot on `?step=2` is flagged as v1.1 polish, not a placeholder gap.
3. **Type consistency:** `MostRecentAuthorisation` (Task 4), `mostRecentAuthorisationForUser` (Tasks 4, 5, 12), `invalidateAuthorisationCache` (Tasks 4, 6), `EngagementLicenceModal` (Tasks 12, 13), `needsModal` (Task 7) — all names spelled identically across tasks.

---

## Out of scope

- Sub-project #3: BYOK upgrade paths.
- Sub-project #5: end-to-end sign-in → job-close audit.
- Sub-project #6: Email-provider BYOK (Resend / SendGrid / SES) — sibling sub-project surfaced during this brainstorm.
- Linking the technician welcome banner to a dedicated `/dashboard/settings/credentials` page UI — the deep links in Task 10 use `?focus=` query params, the route itself is a v1.1 follow-up.
