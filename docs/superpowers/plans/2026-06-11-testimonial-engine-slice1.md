# Testimonial Engine v1 — Slice 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the first end-to-end slice of the Testimonial Engine — a homeowner records a guided selfie testimonial on the portal, signs a media release, the clip is privately stored, transcribed, composited into a minimal branded video, and the contractor approves it for download.

**Architecture:** New `TestimonialRequest`/`TestimonialAsset` Prisma models driven by a pure state machine. Capture reuses the portal token + the portal defence chain (rate-limit → BotID → CSRF → token-resolve-only) and the private `originalsOnly` storage path (#1297). Production runs through a queued pipeline (Whisper transcription → Remotion Lambda render). Contractor approval is authed + tenancy-gated. Two-key publish rule (homeowner consent AND contractor approval) is enforced as pure functions.

**Tech Stack:** Next.js 15 App Router, Prisma + Supabase Postgres, Vitest + @testing-library/react, Supabase Storage (private bucket + signed URLs), OpenAI Whisper API, Remotion Lambda.

**Scope (Slice 1):** capture + consent + private upload + transcription + minimal render + contractor approval + signed-URL download. **Deferred to Slice 2 (separate plan):** share link + copy-for-social, per-contractor gallery page, auto-trigger at claim close, written case-study page.

**Working rules:** TDD (failing test → minimal code → green → commit). `base=main`, branch per task group, **never merge to main**. Run `npx vitest run <path>`. Delete `*.tsbuildinfo` before trusting local `tsc`. Verify `gh pr view --json files` after pushing. Reuse: `apiError`/`fromException` (`lib/api-errors.ts`), `prisma` (`lib/prisma.ts`), `assertInspectionTenancy` (`lib/auth/assert-tenancy.ts`), `lookupPortalAccount` (`lib/portal/lookup-portal-account.ts`), `applyRateLimit` (`lib/rate-limiter.ts`), `verifyBotId` (`lib/auth/botid.ts`), `validateCsrf` (`lib/csrf.ts`), `SupabaseStorageProvider` (`lib/storage/supabase-provider.ts`).

---

## Task 0: Prerequisite verification (no code)

Confirm the external dependencies the render stage needs, since they are not assumable from this worktree.

- [ ] **Step 1: Confirm Remotion project location + Lambda config**

Run:

```bash
ls packages/videos 2>/dev/null; find . -path ./node_modules -prune -o -name "remotion.config.*" -print 2>/dev/null
grep -rn "renderMediaOnLambda\|@remotion/lambda" package.json packages/*/package.json 2>/dev/null
```

Expected: locate the Remotion entry/root and whether `@remotion/lambda` is installed. If absent, the render stage (Task 7) adds `@remotion/lambda` + a new composition package; record the chosen path here before proceeding.

- [ ] **Step 2: Confirm Whisper + Lambda env vars exist (names only, never print values)**

Run:

```bash
for k in OPENAI_API_KEY REMOTION_AWS_ACCESS_KEY_ID REMOTION_AWS_SECRET_ACCESS_KEY REMOTION_LAMBDA_FUNCTION_NAME REMOTION_LAMBDA_SERVE_URL; do
  grep -lq "^$k=" .env.local 2>/dev/null && echo "$k present" || echo "$k MISSING"
done
```

Expected: note which are present. Missing keys are a human gate — surface them; do not fabricate.

- [ ] **Step 3: Record findings** in this plan file under a "Task 0 results" note and commit the doc.

---

## Task 1: Prisma models + migration

**Files:**

- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<ts>_testimonial_engine/migration.sql`

- [ ] **Step 1: Add the models to `prisma/schema.prisma`**

```prisma
model TestimonialRequest {
  id           String   @id @default(cuid())
  inspectionId String
  inspection   Inspection @relation(fields: [inspectionId], references: [id], onDelete: Cascade)
  status       String   @default("invited") // invited|recorded|consented|processing|ready|approved|published|discarded
  // Consent (media release) captured at record time — same approach as authority signing.
  consentSignatureData String? @db.Text
  consentSignedAt      DateTime?
  consentIp            String?
  consentUserAgent     String?
  invitedAt    DateTime  @default(now())
  recordedAt   DateTime?
  approvedAt   DateTime?
  approvedById String?
  discardedAt  DateTime?
  asset        TestimonialAsset?
  @@index([inspectionId])
}

model TestimonialAsset {
  id          String   @id @default(cuid())
  requestId   String   @unique
  request     TestimonialRequest @relation(fields: [requestId], references: [id], onDelete: Cascade)
  rawClipPath String?  // private storage path
  transcript  Json?    // caption cues [{startMs,endMs,text}]
  producedPath String? // private storage path (final MP4)
  durationMs  Int?
  createdAt   DateTime @default(now())
}
```

Add the back-relation to `Inspection`: `testimonialRequests TestimonialRequest[]`.

- [ ] **Step 2: Author the idempotent migration SQL**

Create `prisma/migrations/<ts>_testimonial_engine/migration.sql`:

```sql
CREATE TABLE IF NOT EXISTS "TestimonialRequest" (
  "id" TEXT NOT NULL,
  "inspectionId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'invited',
  "consentSignatureData" TEXT,
  "consentSignedAt" TIMESTAMP(3),
  "consentIp" TEXT,
  "consentUserAgent" TEXT,
  "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "recordedAt" TIMESTAMP(3),
  "approvedAt" TIMESTAMP(3),
  "approvedById" TEXT,
  "discardedAt" TIMESTAMP(3),
  CONSTRAINT "TestimonialRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "TestimonialRequest_inspectionId_idx" ON "TestimonialRequest"("inspectionId");
ALTER TABLE "TestimonialRequest" ADD CONSTRAINT "TestimonialRequest_inspectionId_fkey"
  FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "TestimonialAsset" (
  "id" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "rawClipPath" TEXT,
  "transcript" JSONB,
  "producedPath" TEXT,
  "durationMs" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TestimonialAsset_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "TestimonialAsset_requestId_key" ON "TestimonialAsset"("requestId");
ALTER TABLE "TestimonialAsset" ADD CONSTRAINT "TestimonialAsset_requestId_fkey"
  FOREIGN KEY ("requestId") REFERENCES "TestimonialRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 3: Apply to prod via Supabase MCP, then record in the ledger**

Apply the migration SQL via `mcp__<supabase>__apply_migration` (project `udooysjajglluvuxkijp`). **Immediately** confirm a finished `_prisma_migrations` row exists for it (lesson from the 2026-06-11 P3009 outage — MCP-applied migrations must be reconciled with Prisma's ledger or the next Vercel build fails). Because the SQL is idempotent (`IF NOT EXISTS`), `prisma migrate deploy` on the next build will self-heal the ledger row.

- [ ] **Step 4: Regenerate client**

Run: `npx prisma generate`
Expected: `TestimonialRequest`/`TestimonialAsset` available on `prisma`.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(testimonial): add TestimonialRequest + TestimonialAsset models"
```

---

## Task 2: State machine (pure, TDD)

**Files:**

- Create: `lib/testimonial/state.ts`
- Test: `lib/testimonial/__tests__/state.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { canTransition, canPublish, STATUSES } from "../state";

describe("testimonial state machine", () => {
  it("allows invited→recorded→consented→processing→ready→approved→published", () => {
    const path = [
      "invited",
      "recorded",
      "consented",
      "processing",
      "ready",
      "approved",
      "published",
    ];
    for (let i = 0; i < path.length - 1; i++) {
      expect(canTransition(path[i], path[i + 1])).toBe(true);
    }
  });
  it("rejects skipping (invited→approved)", () => {
    expect(canTransition("invited", "approved")).toBe(false);
  });
  it("allows discard from any pre-publish state", () => {
    for (const s of [
      "invited",
      "recorded",
      "consented",
      "processing",
      "ready",
      "approved",
    ]) {
      expect(canTransition(s, "discarded")).toBe(true);
    }
    expect(canTransition("published", "discarded")).toBe(false);
  });
  it("two-key publish: requires consent AND approval", () => {
    expect(
      canPublish({ status: "approved", hasConsent: true, hasApproval: true }),
    ).toBe(true);
    expect(
      canPublish({ status: "approved", hasConsent: false, hasApproval: true }),
    ).toBe(false);
    expect(
      canPublish({ status: "ready", hasConsent: true, hasApproval: false }),
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** — `npx vitest run lib/testimonial/__tests__/state.test.ts` (module not found).

- [ ] **Step 3: Implement `lib/testimonial/state.ts`**

```ts
export const STATUSES = [
  "invited",
  "recorded",
  "consented",
  "processing",
  "ready",
  "approved",
  "published",
  "discarded",
] as const;
export type Status = (typeof STATUSES)[number];

const NEXT: Record<string, string[]> = {
  invited: ["recorded", "discarded"],
  recorded: ["consented", "discarded"],
  consented: ["processing", "discarded"],
  processing: ["ready", "discarded"],
  ready: ["approved", "discarded"],
  approved: ["published", "discarded"],
  published: [],
  discarded: [],
};

export function canTransition(from: string, to: string): boolean {
  return (NEXT[from] ?? []).includes(to);
}

export function canPublish(x: {
  status: string;
  hasConsent: boolean;
  hasApproval: boolean;
}): boolean {
  return x.status === "approved" && x.hasConsent && x.hasApproval;
}
```

- [ ] **Step 4: Run it — expect PASS.**
- [ ] **Step 5: Commit** — `git add lib/testimonial && git commit -m "feat(testimonial): pure state machine + two-key publish gate"`

---

## Task 3: Guided prompts (pure, TDD)

**Files:**

- Create: `lib/testimonial/prompts.ts`
- Test: `lib/testimonial/__tests__/prompts.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from "vitest";
import { teleprompterPrompts } from "../prompts";

describe("teleprompterPrompts", () => {
  it("returns 2-3 short prompts referencing the claim context", () => {
    const p = teleprompterPrompts({
      jobType: "Water damage",
      suburb: "Bulimba",
    });
    expect(p.length).toBeGreaterThanOrEqual(2);
    expect(p.length).toBeLessThanOrEqual(3);
    expect(p.join(" ")).toMatch(/Bulimba|water/i);
  });
  it("works with no context (generic fallback)", () => {
    expect(teleprompterPrompts({}).length).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement**

```ts
export function teleprompterPrompts(ctx: {
  jobType?: string;
  suburb?: string;
}): string[] {
  const place = ctx.suburb ? ` in ${ctx.suburb}` : "";
  const job = ctx.jobType ? ctx.jobType.toLowerCase() : "the damage";
  return [
    `What was the situation when you first found ${job}${place}?`,
    `How did the team handle it for you?`,
    `Would you recommend them — and why?`,
  ];
}
```

- [ ] **Step 4: Run — PASS.**
- [ ] **Step 5: Commit.**

---

## Task 4: Capture + consent upload route (token-gated, TDD)

**Files:**

- Create: `app/api/portal/[token]/testimonial/route.ts`
- Test: `app/api/portal/[token]/testimonial/__tests__/route.test.ts`

Behaviour: `POST` accepts `{ videoDataUrl, consentSignatureName }`. Defence chain identical to the evidence route. Resolves inspection from the token's client only. Requires a non-empty consent name (the media release). Uploads the clip via `provider.upload({ ..., originalsOnly: true })`. Creates/updates a `TestimonialRequest` (status `consented`, consent fields set) + `TestimonialAsset` (rawClipPath). Returns `{ data: { status } }`.

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: vi.fn(async () => null),
}));
vi.mock("@/lib/auth/botid", () => ({
  verifyBotId: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/csrf", () => ({ validateCsrf: vi.fn(() => null) }));
vi.mock("@/lib/portal/lookup-portal-account", () => ({
  lookupPortalAccount: vi.fn(async () => ({ clientId: "c_1" })),
}));
const { upload } = vi.hoisted(() => ({
  upload: vi.fn(async () => ({
    storagePath: "ws/i1/raw.webm",
    sizeBytes: 100,
  })),
}));
vi.mock("@/lib/storage/supabase-provider", () => ({
  SupabaseStorageProvider: class {
    upload = upload;
  },
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: {
      findFirst: vi.fn(async () => ({
        id: "i1",
        workspaceId: "ws",
        userId: "u",
      })),
    },
    testimonialRequest: { create: vi.fn(async () => ({ id: "tr_1" })) },
    testimonialAsset: { create: vi.fn(async () => ({})) },
  },
}));

import { POST } from "../route";
import { lookupPortalAccount } from "@/lib/portal/lookup-portal-account";
import { verifyBotId } from "@/lib/auth/botid";

const mLookup = lookupPortalAccount as unknown as ReturnType<typeof vi.fn>;
const mBot = verifyBotId as unknown as ReturnType<typeof vi.fn>;

const req = (body: object) =>
  new NextRequest("http://localhost/api/portal/T/testimonial", {
    method: "POST",
    headers: {
      origin: "https://restoreassist.app",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
const params = { params: Promise.resolve({ token: "T" }) };
const goodPng = "data:video/webm;base64,AAAA";

beforeEach(() => vi.clearAllMocks());

describe("POST /api/portal/[token]/testimonial", () => {
  it("403 when BotID rejects", async () => {
    mBot.mockResolvedValueOnce({ ok: false, reason: "bot" });
    expect(
      (
        await POST(
          req({ videoDataUrl: goodPng, consentSignatureName: "Jane" }),
          params,
        )
      ).status,
    ).toBe(403);
  });
  it("404 for an invalid/expired token", async () => {
    mLookup.mockResolvedValueOnce(null);
    expect(
      (
        await POST(
          req({ videoDataUrl: goodPng, consentSignatureName: "Jane" }),
          params,
        )
      ).status,
    ).toBe(404);
  });
  it("422 without consent name (media release required)", async () => {
    expect(
      (
        await POST(
          req({ videoDataUrl: goodPng, consentSignatureName: "" }),
          params,
        )
      ).status,
    ).toBe(422);
  });
  it("stores the clip privately + records consent, returns consented", async () => {
    const res = await POST(
      req({ videoDataUrl: goodPng, consentSignatureName: "Jane" }),
      params,
    );
    expect(res.status).toBe(200);
    expect((await res.json()).data.status).toBe("consented");
    expect(upload).toHaveBeenCalledWith(
      expect.objectContaining({ originalsOnly: true, folder: "testimonial" }),
    );
  });
});
```

- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement `app/api/portal/[token]/testimonial/route.ts`** — mirror `app/api/portal/[token]/evidence/route.ts`: rate-limit (key=token, failClosed) → verifyBotId → validateCsrf → lookupPortalAccount → resolve inspection from `report.clientId` → validate `videoDataUrl` (decode base64, size cap e.g. 100MB) + non-empty `consentSignatureName` (else 422) → `provider.upload({ buffer, filename:"testimonial.webm", mimeType:"video/webm", folder:"testimonial", orgId, inspectionId, originalsOnly:true })` → `prisma.testimonialRequest.create({ data: { inspectionId, status: "consented", consentSignatureData: typedSignatureDataUrl(name), consentSignedAt: new Date(), consentIp: getClientIp(request), consentUserAgent: ua, recordedAt: new Date() } })` → `prisma.testimonialAsset.create({ data: { requestId, rawClipPath: out.storagePath } })` → `{ data: { status: "consented" } }`. Reuse `typedSignatureDataUrl` from `lib/portal/typed-signature.ts`.

- [ ] **Step 4: Run — PASS.**
- [ ] **Step 5: Commit.**

---

## Task 5: Whisper transcription wrapper (TDD)

**Files:**

- Create: `lib/testimonial/transcribe.ts`
- Test: `lib/testimonial/__tests__/transcribe.test.ts`

- [ ] **Step 1: Failing test** — mock `fetch`/OpenAI SDK; assert it maps Whisper segments to `[{startMs,endMs,text}]` and throws a typed error on non-200.

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { transcribeToCues } from "../transcribe";

beforeEach(() => vi.restoreAllMocks());

it("maps whisper segments to caption cues (ms)", async () => {
  const client = {
    audio: {
      transcriptions: {
        create: vi.fn(async () => ({
          segments: [
            { start: 0, end: 1.5, text: "Hi there" },
            { start: 1.5, end: 3, text: "great job" },
          ],
        })),
      },
    },
  };
  const cues = await transcribeToCues(Buffer.from("x"), { client });
  expect(cues).toEqual([
    { startMs: 0, endMs: 1500, text: "Hi there" },
    { startMs: 1500, endMs: 3000, text: "great job" },
  ]);
});
```

- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement** — `transcribeToCues(buffer, { client })` calls `client.audio.transcriptions.create({ model: "whisper-1", file, response_format: "verbose_json", timestamp_granularities: ["segment"] })` and maps `segments` → cues (seconds→ms via `Math.round(s*1000)`). Default `client` = a lazily-constructed OpenAI client from `OPENAI_API_KEY` (injectable for tests).
- [ ] **Step 4: Run — PASS.**
- [ ] **Step 5: Commit.**

---

## Task 6: Pipeline job — transcription stage (TDD)

**Files:**

- Create: `lib/testimonial/process-job.ts`
- Test: `lib/testimonial/__tests__/process-job.test.ts`

Behaviour: given a `requestId`, download the raw clip (private), transcribe, persist `transcript` to the asset, advance `processing→ready` is reserved for after render — here advance `consented→processing` and store the transcript. Render is Task 7.

- [ ] **Step 1: Failing test** — mock provider.download, transcribeToCues, prisma; assert transcript persisted + status set to `processing`.
- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement** — guard `canTransition(current, "processing")`; `provider.download(rawClipPath)` → `transcribeToCues` → `prisma.testimonialAsset.update({ transcript })` + `prisma.testimonialRequest.update({ status: "processing" })`. Idempotent (no-op if already past `processing`).
- [ ] **Step 4: Run — PASS.**
- [ ] **Step 5: Commit.**

---

## Task 7: Remotion Lambda render stage (TDD for the trigger, smoke for the render)

**Files:**

- Create: `lib/testimonial/render.ts`
- Create: Remotion composition `Testimonial` (path per Task 0 result; e.g. `packages/videos/src/Testimonial.tsx` + register in the Remotion root)
- Test: `lib/testimonial/__tests__/render.test.ts`

Composition segments (per spec §5): branded intro (logo + suburb, **TTS voiceover**) → homeowner clip with burned-in captions (homeowner's own audio) → before/after + dry-down intercut (**TTS voiceover**) → outro (brand + CTA, **TTS voiceover**). No segment is ever silent (honours the locked voiceover rule).

- [ ] **Step 1: Failing test for the render trigger** — mock `renderMediaOnLambda`; assert `renderTestimonial({ requestId })` passes the asset's transcript + claim photos + brand as `inputProps`, uploads the produced MP4 path, sets status `processing→ready`. Guard with `canTransition`.
- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement `lib/testimonial/render.ts`** — assemble `inputProps` (homeowner clip signed URL, caption cues, before/after photo URLs, dry-down series, contractor brand from brand-config, TTS audio for non-testimonial segments), call `renderMediaOnLambda({ functionName, serveUrl, composition: "Testimonial", inputProps, codec: "h264" })`, store result to private storage, update asset `producedPath` + request status `ready`.
- [ ] **Step 4: Build the `Testimonial` Remotion composition** matching `inputProps`; register it in the Remotion root. Use existing brand-config + remotion skills for styling.
- [ ] **Step 5: Run unit test — PASS.**
- [ ] **Step 6: Render smoke** — one real Lambda render of a fixture request; confirm a playable MP4 with audible voiceover on intro/outro and the homeowner's audio on the body. Record the output URL in the PR.
- [ ] **Step 7: Commit.**

---

## Task 8: Contractor review + approval (authed, tenancy-gated, TDD)

**Files:**

- Create: `app/api/inspections/[id]/testimonial/route.ts` (GET: list ready/approved requests for the claim with a signed preview URL; POST: `{ action: "approve" | "discard" }`)
- Test: `app/api/inspections/[id]/testimonial/__tests__/route.test.ts`

- [ ] **Step 1: Failing tests** — 401 no session; 403 tenancy; GET returns ready requests with a signed `previewUrl` (mock `getSignedUrl`); POST approve sets status `ready→approved` + `approvedAt`/`approvedById` (guard `canTransition`); POST approve on a non-`ready` request → 409; POST discard sets `discarded` and is allowed from any pre-publish state.
- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement** — mirror `app/api/inspections/[id]/evidence/client-submissions/route.ts` (auth + `assertInspectionTenancy`). GET lists `testimonialRequest` where `inspectionId=id, status in (ready,approved)` with `getSignedUrl(asset.producedPath)`. POST: load request (tenancy already checked), `approve` → `updateMany({ where:{ id, status:"ready" }, data:{ status:"approved", approvedAt, approvedById } })`, `count===0 → 409`; `discard` → set `discarded` + (best-effort) `provider.delete(rawClipPath/producedPath)`.
- [ ] **Step 4: Run — PASS.**
- [ ] **Step 5: Commit.**

---

## Task 9: Portal capture UI (TDD)

**Files:**

- Create: `components/portal/ClientPortalTestimonial.tsx`
- Test: `components/portal/__tests__/ClientPortalTestimonial.test.tsx`
- Modify: `app/portal/[token]/page.tsx` (mount, self-hiding until invited/recordable)

- [ ] **Step 1: Failing test** — render with a stubbed `navigator.mediaDevices.getUserMedia`/`MediaRecorder`; assert: shows the consent checkbox + name field (Approve & sign style), the teleprompter prompts, a record button (min-h-11, aria-labels); submit posts `{ videoDataUrl, consentSignatureName }` to `/api/portal/<token>/testimonial`; on success shows "Thanks — your installer will finalise it." Self-hides when no request is invitable.
- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement** the component (browser `MediaRecorder`, blob→dataURL, consent gate before submit) following `ClientPortalUpload.tsx` conventions (a11y, brand classes). Mount on `app/portal/[token]/page.tsx` after the Status panel.
- [ ] **Step 4: Run — PASS; `tsc --noEmit` + `eslint` clean.**
- [ ] **Step 5: Commit.**

---

## Task 10: Contractor review UI + download (TDD)

**Files:**

- Create: `components/inspection/TestimonialReviewPanel.tsx`
- Test: `components/inspection/__tests__/TestimonialReviewPanel.test.tsx`
- Modify: `app/dashboard/inspections/[id]/page.tsx` (dynamic-import mount beside `ClientEvidenceReviewPanel`)

- [ ] **Step 1: Failing test** — fetch GET → shows ready testimonial with `<video>` preview (signed URL); Approve button POSTs `{action:"approve"}` then shows a Download link (the signed `previewUrl`); Discard POSTs `{action:"discard"}` and removes the item; self-hides when none.
- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement** following `ClientEvidenceReviewPanel.tsx`; mount via `dynamic(..., { ssr:false })` next to the existing panels.
- [ ] **Step 4: Run — PASS; tsc + eslint clean.**
- [ ] **Step 5: Commit.**

---

## Task 11: Wire-up + verification gate

- [ ] **Step 1:** `find . -name "*.tsbuildinfo" -delete; npx tsc --noEmit` → no errors.
- [ ] **Step 2:** `npx vitest run lib/testimonial app/api/portal/[token]/testimonial app/api/inspections components/portal components/inspection` → all green.
- [ ] **Step 3:** no-stub grep over the new files → clean.
- [ ] **Step 4:** Open PR `base=main`; `gh pr view --json files` matches the intended set; paste the render smoke output URL + a VERIFICATION CHECKLIST (where/how/what-to-see) per the project verification gate. **Do not merge to main.**

---

## Deferred to Slice 2 (separate plan)

Share link + copy-for-social, per-contractor gallery page, auto-trigger at claim close (portal card on `COMPLETED`), written/SEO case-study page reusing the transcript + assets.
