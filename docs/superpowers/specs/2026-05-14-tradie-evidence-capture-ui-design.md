# Tradie evidence-capture UI — design

> **Scope:** Sub-project #7 of the onboarding redesign. Three coherent UI gaps surfaced during sub-project #2's E2E iteration: (B) the dashboard licence banner that the role-branched `GET /api/onboarding/first-run` API was already returning but had nowhere to render; (C) the photo-capture entry point on the inspection detail page; (D) the sign-off form's modal-launch contract.

> **Persona:** Junior Technician (`USER` role per `Role` enum). Per CLAUDE.md rule 25 this role is evidence-only — they capture photos, can launch the engagement-licence modal at sign-off time, and can fill the sign-off form. They never bypass the licence step.

> **Out of scope (separate work):** Seam F (Cloudinary upload-pipeline bug) was fixed in parallel via PR #1008 — `lib/cloudinary.ts` `ensureCloudinaryConfigured()` checked the legacy 3-var form while the codebase + Vercel use the canonical `CLOUDINARY_URL`. Once that lands, real users can complete the existing invite flow. RC3 (sandbox `GOOGLE_CLIENT_ID/SECRET`) is a separate user-action env update.

---

## Context

Sub-project #2 shipped the invited-technician onboarding flow to production. Iterating against its 8 E2E specs surfaced four gaps the spec doc had assumed were complete but weren't:

- **Seam B**: `GET /api/onboarding/first-run` is role-branched and returns tech-specific steps (IICRC / WHS / state) for `USER` role. The `<FirstRunChecklist>` component exists. Neither is mounted on `/dashboard`. The banner the design spec described doesn't actually render.
- **Seam C**: The inspection detail page (`app/dashboard/inspections/[id]/page.tsx`) has no "Capture photo" entry point. Tradies cannot start the evidence-capture flow from the inspection surface. The `InspectionPhoto` Prisma model and `POST /api/inspections/[id]/photos` route both exist; they just have no UI binding.
- **Seam D**: `<InspectionSignOff>` was mounted by F1 (PR #991) but its "Sign Inspection" button is disabled until `signatoryName` + a `confirmed` checkbox are filled. The E2E specs assume the click launches the licence modal regardless. The current contract conflates regulatory verification (the licence check) with the legal sign-off act (name + confirmation). The spec wants them separated.

The three seams are independent: B is mounting work, D is a refactor, C is a build. They can ship in any order to sandbox.

Sub-project #7 closes these three gaps and unblocks five deferred E2E specs from sub-project #2.

---

## Locked-in design constraints (decided 2026-05-14)

1. **Seam B**: build a new `<TechLicenceBanner>` component rather than reusing `<FirstRunChecklist>`. The existing component is sidebar-styled (text-xs, narrow column, `mx-2 mb-3`); putting it at top-of-dashboard would look like a transplanted sidebar fragment. The banner reuses the same `GET /api/onboarding/first-run` API.
2. **Seam C entry**: floating action button bottom-right, mobile-first. The inspection detail page already has multiple tabs; a FAB keeps the entry point visible regardless of current tab.
3. **Seam C flow**: native camera, single-photo, tag-then-save. Multi-photo batch capture is v2; v1 ships the smallest end-to-end loop.
4. **Seam D**: modal-first sign-off. Click "Sign Inspection" → engagement-licence modal opens immediately → on confirm, form fields unlock with `signatoryName` pre-filled from session. This aligns with rule 28's engagement-time intent.

---

## Section 1 — Architecture & data flow

### What's reused as-is

- `InspectionPhoto` Prisma model (url, thumbnailUrl, location, description, timestamp, fileSize, mimeType, gpsLatitude, gpsLongitude)
- `POST /api/inspections/[id]/photos` route handler
- `<EngagementLicenceModal>` component from sub-project #2 (`components/attestation/EngagementLicenceModal.tsx`)
- `POST /api/authorisations` route (self-attestation)
- `GET /api/authorisations/most-recent` (pre-fill cache)
- `GET /api/onboarding/first-run` (role-branched, returns tech steps for USER role)
- `POST /api/inspections/[id]/sign` (sign-off endpoint)

### What's new

- `<TechLicenceBanner>` — top-of-dashboard banner component (banner-styled, not sidebar-styled)
- `<CapturePhotoFab>` — inspection-page FAB
- `<CapturePhotoTagModal>` — preview + caption + GPS readout + submit
- `lib/capture/cocoa-client.ts` — SHA-256 via SubtleCrypto + GPS via navigator.geolocation
- Server extension to `POST /api/inspections/[id]/photos` — magic-byte validation, hash recompute, cocoaUserHash computation

### Schema delta

```prisma
model InspectionPhoto {
  // existing fields untouched

  // NEW — chain-of-custody (rule 21)
  cocoaSha256        String?   // SHA-256 of file bytes (client-computed, server-verified)
  cocoaCapturedAtUtc DateTime? // UTC at capture moment (client-supplied)
  cocoaUserHash      String?   // server-authoritative: SHA-256(user.id + ":" + user.image)
  cocoaDeviceHint    String?   // user-agent excerpt for forensics
}
```

Four new nullable columns. One additive migration. Existing photos backfill to NULL (the NIR report renderer flags `cocoaSha256 == null` rows as "legacy capture").

### Data flow per seam

**Seam B**:

```
User → /dashboard
  → <TechLicenceBanner> mounts
  → fetch GET /api/onboarding/first-run
  → server: if session.user.role === "USER" return tech steps + dismissed if any Authorisation exists
  → banner renders OR returns null (dismissed / non-tech)
```

**Seam D**:

```
A — Initial:        Button enabled,  form hidden
B — Modal open:     button spinner,   form hidden,   click → modal
C — Form unlocked:  button "Confirm", form visible,  signatoryName prefilled from session
D — Submitted:      success state
```

Edge: if `Authorisation.findFirst({ where: { subjectUserId } })` returns a row < 90 days old, the modal opens in pre-filled state (existing #989 contract), and a single confirm advances to State C. Reloading the page after State C lands but before sign-off completes returns the user to State C (recently-valid Authorisation suffices).

**Seam C**:

```
Tap FAB on /dashboard/inspections/[id]
  → hidden <input type="file" accept="image/jpeg,image/png" capture="environment"> click()
  → user takes photo / selects file → onChange
  → client: SHA-256 the bytes via crypto.subtle.digest
  → client: navigator.geolocation.getCurrentPosition (10s timeout, fail-soft)
  → <CapturePhotoTagModal> opens: preview + caption + GPS readout
  → submit → optimistic UI placeholder
  → POST /api/inspections/[id]/photos (multipart/form-data)
    → server: magic-byte check (rule 11)
    → server: recompute SHA-256, reject if mismatch with client-supplied
    → server: compute cocoaUserHash from session
    → server: upload to Cloudinary
    → server: create InspectionPhoto row with cocoa* fields
  → response: { photoId, url, thumbnailUrl }
  → client: replace placeholder with real photo. FAB ready for next.
```

### CLAUDE.md rule coverage

| Rule | Coverage |
|---|---|
| 1 — getServerSession on every route | photo route + authorisations route already gated |
| 4 — explicit Prisma select + take | photo write uses `select: { id, url, thumbnailUrl }` |
| 7 — no error.message in 500s | upload errors return generic 502; Cloudinary error logged server-side |
| 11 — magic-byte validation | new server check on photo POST |
| 21 — chain-of-custody hashing | cocoa* columns populated per photo |
| 25 — Junior Tech evidence-only | FAB renders for USER role; photo capture never gates on licence modal |
| 28 — engagement-time licence verification | Seam D refactor moves licence-verify before sign-off act |

---

## Section 2 — Seam B detail: TechLicenceBanner

### Why a new component instead of reusing FirstRunChecklist

`<FirstRunChecklist>` uses `text-xs`, `[10px]`, `mx-2 mb-3 rounded-xl border p-3 text-sm`. The render is designed for a narrow sidebar column. Mounting it at top-of-dashboard would look like a sidebar fragment dropped into the main content. Cleaner to build a banner-styled component that reuses the same data contract.

### Component

```tsx
// components/dashboard/TechLicenceBanner.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface FirstRunChecklistResponse {
  dismissed: boolean;
  allComplete: boolean;
  completedCount: number;
  totalCount: number;
  steps: Array<{ id: string; title: string; description: string; href: string; completed: boolean }>;
}

export function TechLicenceBanner() {
  const [data, setData] = useState<FirstRunChecklistResponse | null>(null);

  useEffect(() => {
    fetch("/api/onboarding/first-run")
      .then((r) => r.json())
      .then(setData)
      .catch(() => {});
  }, []);

  // Hide while loading, when dismissed, and for non-tech step sets.
  if (!data || data.dismissed) return null;
  const isTech = data.steps[0]?.id === "tech_iicrc";
  if (!isTech) return null;

  return (
    <div className="border border-[#1C2E47]/30 bg-[#1C2E47]/8 rounded-lg p-4 mb-6 flex items-center gap-4">
      <div className="text-2xl"></div>
      <div className="flex-1">
        <p className="font-semibold text-sm">Add your credentials to unlock attestations</p>
        <p className="text-xs text-muted-foreground">IICRC certificate · WHS White Card · State licence — takes a minute</p>
        <div className="flex gap-2 mt-2">
          {data.steps.map((s) => (
            <span key={s.id} className="text-[10px] px-2 py-0.5 border rounded-full">
              {s.title.replace(/^Add your /, "")} {s.completed ? "" : "pending"}
            </span>
          ))}
        </div>
      </div>
      <Link
        href={data.steps.find((s) => !s.completed)?.href ?? "/dashboard/settings/credentials"}
        className="bg-[#1C2E47] text-white px-4 py-2 rounded-md text-sm font-medium"
      >
        Add credentials →
      </Link>
    </div>
  );
}
```

### Mount

```tsx
// app/dashboard/page.tsx — top of return body
return (
  <DashboardLayout>
    <TechLicenceBanner />
    {/* existing metrics + cards unchanged */}
  </DashboardLayout>
);
```

### Files for Seam B

- **New**: `components/dashboard/TechLicenceBanner.tsx`
- **Modified**: `app/dashboard/page.tsx` (+1 import, +1 JSX line)
- **New**: `app/dashboard/settings/credentials/page.tsx` — referenced by the API's `href` field; thin route that opens the existing `<EngagementLicenceModal>` in standalone mode
- **Test**: `components/dashboard/__tests__/TechLicenceBanner.test.tsx` — 4 cases: dismissed → null, tech steps → render, non-tech steps → null, CTA href maps to first incomplete step

### Acceptance

- Banner visible on /dashboard for USER role with no Authorisation row
- Banner auto-hides once any Authorisation row exists for the user
- ADMIN / MANAGER never see the banner (regardless of dashboard state)
- E2E spec `tech-banner-auto-dismiss.spec.ts` passes

---

## Section 3 — Seam D detail: Modal-first sign-off refactor

### State machine

| State | Button | Form fields | Trigger out |
|---|---|---|---|
| **A — Initial** | "Sign Inspection" enabled | hidden | click → B |
| **B — Modal open** | spinner | hidden | modal cancel → A; modal confirm → C |
| **C — Form unlocked** | "Confirm sign-off" (enabled when form valid) | `signatoryName` prefilled from `session.user.name`, `confirmed` checkbox required | submit → D |
| **D — Submitted** | success state (existing) | readonly summary | — |

### Edge cases

- **Authorisation already exists < 90 days**: `<EngagementLicenceModal>` opens in pre-filled state (existing #989 contract). Single confirm advances directly to State C.
- **Modal cancel**: revert to State A. No Authorisation row created.
- **Reload after State C lands but before form submitted**: component checks for any `Authorisation < 90 days` for `subjectUserId`; if found, opens directly at State C (skip modal). Tradie doesn't redo the licence step.
- **Sign-off POST fails after State C**: stays in State C with error toast. Authorisation row stays. Retry just re-POSTs sign.

### Refactor surface

`components/inspection/InspectionSignOff.tsx`:

```tsx
type SignOffState = "initial" | "modal" | "form-unlocked" | "submitted";

const [state, setState] = useState<SignOffState>("initial");
const [signatoryName, setSignatoryName] = useState(session?.user?.name ?? "");
const [confirmed, setConfirmed] = useState(false);

// On mount, check for fresh-enough Authorisation
useEffect(() => {
  fetch("/api/authorisations/most-recent")
    .then((r) => r.json())
    .then((data) => {
      if (data.row && Date.now() - new Date(data.row.verifiedAt).getTime() < 90 * 24 * 60 * 60 * 1000) {
        setState("form-unlocked");
      }
    })
    .catch(() => {});
}, []);

// Render varies by state — see state machine table
```

### Files for Seam D

- **Modified**: `components/inspection/InspectionSignOff.tsx` — state-machine refactor; reuses existing `<EngagementLicenceModal>`
- **No new API** — `POST /api/inspections/[id]/sign` unchanged
- **Test**: extend `components/inspection/__tests__/InspectionSignOff.test.tsx` — 8 state-transition cases (Initial render; modal open on click; modal cancel reverts; modal confirm unlocks form; State C signatoryName prefilled; State C submit disabled until confirmed; State C submit POSTs sign; submit fail keeps State C)
- **E2E unblock**: `tech-signoff-modal-cancel.spec.ts`, `tech-signoff-modal-fresh.spec.ts`, and new `tech-second-signoff-prefilled.spec.ts`

### Acceptance

- Sign Inspection button always enabled in State A
- Click → `<EngagementLicenceModal>` opens
- Modal confirm → form fields visible with `signatoryName` prefilled
- Submit completes the existing `/api/inspections/[id]/sign` POST
- Returning user with recent Authorisation skips the modal (State A → C directly)

---

## Section 4 — Seam C detail: Capture FAB + tag modal + chain-of-custody

### Components

- **`<CapturePhotoFab>`** — fixed-position bottom-right (`fixed bottom-4 right-4`). Renders only when `inspection.status !== "COMPLETED"` AND user has photo-capture permission (USER + MANAGER + ADMIN). Round 56×56 button with camera glyph. Triggers a hidden `<input type="file" accept="image/jpeg,image/png" capture="environment">` on click.
- **`<CapturePhotoTagModal>`** — opens after file selected. Renders: preview img (256×256 max, object-cover), GPS readout (or "GPS unavailable"), SHA-256 (truncated, visible to user for transparency), caption input (optional, 500 chars), cancel + save buttons.
- **`lib/capture/cocoa-client.ts`** — exports `sha256OfFile(file: File): Promise<string>` (uses `crypto.subtle.digest`) and `getCurrentGps(): Promise<{ lat: number; lng: number } | null>` (10s timeout, fail-soft).

### Server route extension

`POST /api/inspections/[id]/photos`:

1. Existing validations preserved (auth, inspection ownership, etc.).
2. **NEW magic-byte check (rule 11)**: read first 8 bytes of uploaded file. Confirm JPEG (`FF D8 FF`) or PNG (`89 50 4E 47`). Reject `400` if neither.
3. **NEW hash recompute**: compute SHA-256 of received bytes server-side. Compare to client-supplied `cocoaSha256`. If mismatch, reject `400`. Defends against MITM tampering between camera and upload.
4. **NEW compute cocoaUserHash**: `sha256(session.user.id + ":" + (session.user.image ?? ""))` — client doesn't supply this.
5. **NEW capture cocoaDeviceHint**: `req.headers.get("user-agent")?.slice(0, 200) ?? null`.
6. Existing Cloudinary upload (uses `lib/cloudinary.ts` post-PR#1008 fix).
7. Create `InspectionPhoto` row with all existing fields PLUS cocoa* fields.

### Schema migration

```sql
-- prisma/migrations/20260514100000_inspection_photo_cocoa/migration.sql
ALTER TABLE "InspectionPhoto"
  ADD COLUMN "cocoaSha256" TEXT,
  ADD COLUMN "cocoaCapturedAtUtc" TIMESTAMP(3),
  ADD COLUMN "cocoaUserHash" TEXT,
  ADD COLUMN "cocoaDeviceHint" TEXT;
```

Additive only. Existing rows backfill to NULL. NIR report renderer flags `cocoaSha256 == null` rows as "legacy capture (chain-of-custody not verified)".

### Files for Seam C

- **New**: `components/inspection/CapturePhotoFab.tsx` (~120 lines)
- **New**: `components/inspection/CapturePhotoTagModal.tsx` (~150 lines)
- **New**: `lib/capture/cocoa-client.ts` (~60 lines)
- **New**: `lib/capture/__tests__/cocoa-client.test.ts` (SHA-256 cases)
- **Modified**: `app/api/inspections/[id]/photos/route.ts` (magic-byte + recompute + cocoa fields)
- **Modified**: `app/dashboard/inspections/[id]/page.tsx` (+1 import, +1 JSX line)
- **Migration**: `prisma/migrations/20260514100000_inspection_photo_cocoa/migration.sql`
- **Test**: `app/api/inspections/[id]/photos/__tests__/cocoa.test.ts` (3 cases: magic-byte reject, hash-mismatch reject, happy path persists cocoa fields)
- **E2E unblock**: `tech-evidence-capture-no-modal.spec.ts`

### Acceptance

- FAB renders on inspection detail page when status != COMPLETED
- Tap → native camera opens (mobile) or file picker (desktop)
- Tag modal shows GPS + SHA-256 + caption
- Submit → photo appears in inspection's photo list, `InspectionPhoto` row has all four cocoa* fields populated
- Photo capture NEVER opens the licence modal (rule 25 invariant)

### Out of scope for v1 (note for future cycles)

- Multi-photo batch capture (biggest UX upside; v2)
- EXIF GPS extraction from JPEG bytes (defer; navigator.geolocation covers it for mobile)
- Damage-type dropdown / room selector (v2 — data-model decisions needed)
- Photo editing (crop, rotate, annotate)
- Full C2PA cryptographic manifest (rule 21 references C2PA-style; v1 uses SHA-256 + cocoaUserHash; full manifest layers in v2)

---

## Section 5 — Testing strategy

### Unit (Vitest) — ~27 new cases

| Module | Cases |
|---|---|
| `TechLicenceBanner` | dismissed → null · tech steps → render · ADMIN/MANAGER steps → null · CTA href maps to first incomplete step |
| `InspectionSignOff` state machine | Initial A render (button enabled, form hidden) · click A → B opens modal · modal cancel B → A · modal confirm B → C unlocks form · State C `signatoryName` prefilled from session · State C submit disabled until `confirmed` checked · submit C → D · submit fails → stays in C with error · Authorisation < 90 days on mount → opens at State C |
| `cocoa-client.ts` | SHA-256 of known input matches expected · GPS helper returns null on permission denied (no throw) · GPS helper times out at 10s |
| `CapturePhotoFab` | renders only when status !== COMPLETED · hidden file input triggered on click · onChange opens tag modal |
| `CapturePhotoTagModal` | preview renders · GPS readout shown when available · caption submits trimmed · cancel closes without POST · submit calls onUpload with full payload |

### Integration (Vitest + Prisma) — 4 new cases

`POST /api/inspections/[id]/photos` (extended):

- Happy path persists `cocoaSha256` / `cocoaCapturedAtUtc` / `cocoaUserHash` / `cocoaDeviceHint`
- Rejects non-JPEG/PNG bytes (rule 11)
- Rejects when client-supplied `cocoaSha256` doesn't match server-recomputed hash
- Rejects when `session.user.id` doesn't have permission on the inspection

### E2E (Playwright) — 5 specs unblocked

- `tech-banner-auto-dismiss.spec.ts` (Seam B): banner visible on first /dashboard load; auto-dismisses after Authorisation row exists
- `tech-signoff-modal-fresh.spec.ts` (Seam D): first sign-off — click → modal opens fresh → fill → submit → form unlocks → submit form → /dashboard redirect
- `tech-signoff-modal-cancel.spec.ts` (Seam D): click → modal opens → ESC → modal closes → form stays hidden → inspection intact
- `tech-evidence-capture-no-modal.spec.ts` (Seam C): tap FAB → set photo → tag modal opens → submit → photo appears in list → licence modal NEVER opened (rule 25)
- **NEW**: `tech-second-signoff-prefilled.spec.ts` (Seam D edge): sign off once, reload, click Sign Inspection again → modal opens prefilled (not fresh), one-tap confirm proceeds to State C

### Visual regression — 15 baselines

5 surfaces × 3 viewports (iPhone 14 Pro 393×852 / iPad mini 768×1024 / desktop 1280×800):

- /dashboard with TechLicenceBanner (USER role, no Authorisation)
- /dashboard without TechLicenceBanner (dismissed/has Authorisation)
- Inspection detail page with CapturePhotoFab visible
- CapturePhotoTagModal open with preview
- InspectionSignOff State A (initial) and State C (form unlocked)

### CI gates (must all pass)

- `pnpm type-check`
- `pnpm lint`
- `npx vitest run` (no regressions)
- `npx playwright test e2e/tech-*.spec.ts`
- Snapshot diff = 0
- `npx prisma migrate diff` = no drift (PR #954 smoke gate)
- DESIGN.md baseline (no new lucide imports unless baseline bumped)

### Subscription gate regression (rule 8)

`USER` with `creditsRemaining = 0` must still be able to:

- Render dashboard with TechLicenceBanner
- Open EngagementLicenceModal + persist Authorisation row
- Capture photos + persist InspectionPhoto rows with cocoa* fields
- Sign off an inspection (no AI call involved)

`USER` with 0 credits must still be **blocked** from any AI route. Existing model-router gate covers it; no new behavior here.

### Verification Gate (`.claude/rules/verification-gate.md`)

Pre-merge manual checklist:

1. **Where to check**: `restoreassist-sandbox.vercel.app` after the release deploys.
2. **How to get there**: seed a fresh org via `/setup` happy path; invite a test tradie via `/dashboard/team`; accept invite via `/invite/[token]`.
3. **What to see**:
   - On /dashboard: TechLicenceBanner visible above metrics for the new tradie.
   - Banner dismisses after first Authorisation submitted.
   - Open an inspection in COMPLETED state — CapturePhotoFab renders bottom-right.
   - Tap FAB → native camera opens (on mobile) → take photo → tag modal opens with SHA-256 visible.
   - Save photo → new entry in inspection's photo list with chain-of-custody fields populated (verify in Prisma Studio).
   - Tap "Sign Inspection" → EngagementLicenceModal opens immediately (modal-first).
   - Submit licence → form unlocks → signatoryName prefilled → confirm → Submit → status flips to SUBMITTED.
   - Reload after sign-off without writing new Authorisation → modal opens prefilled (one-tap confirm).
4. **What NOT to see**:
   - NO TechLicenceBanner for ADMIN/MANAGER roles (only USER).
   - NO licence modal on photo capture (rule 25).
   - NO 502 on photo upload (Seam F PR #1008 must be live).
   - NO unauthorised photo POST succeeding.
   - NO cocoaUserHash matching another user's hash.
5. **Confirmation prompt**: screenshots of (a) /dashboard with banner, (b) inspection page with FAB visible, (c) tag modal with SHA-256, (d) InspectionSignOff State C form unlocked + signatoryName prefilled, (e) Prisma Studio row showing the photo's `cocoaSha256` / `cocoaUserHash` populated.

---

## Critical files (read-only reference)

- `app/dashboard/page.tsx` — TechLicenceBanner mount site
- `app/dashboard/inspections/[id]/page.tsx` — CapturePhotoFab mount site
- `components/inspection/InspectionSignOff.tsx` — refactor target for Seam D
- `components/attestation/EngagementLicenceModal.tsx` — reused as-is from #989
- `components/FirstRunChecklist.tsx` — sibling component, NOT modified
- `app/api/onboarding/first-run/route.ts` — role-branched, NOT modified
- `app/api/inspections/[id]/photos/route.ts` — extended for cocoa* fields
- `app/api/inspections/[id]/sign/route.ts` — NOT modified
- `app/api/authorisations/most-recent/route.ts` — read by InspectionSignOff for fresh-Authorisation check
- `prisma/schema.prisma` — `InspectionPhoto` model edits

## New files (to be created)

- `components/dashboard/TechLicenceBanner.tsx`
- `components/dashboard/__tests__/TechLicenceBanner.test.tsx`
- `app/dashboard/settings/credentials/page.tsx`
- `components/inspection/CapturePhotoFab.tsx`
- `components/inspection/CapturePhotoTagModal.tsx`
- `lib/capture/cocoa-client.ts`
- `lib/capture/__tests__/cocoa-client.test.ts`
- `app/api/inspections/[id]/photos/__tests__/cocoa.test.ts`
- `prisma/migrations/20260514100000_inspection_photo_cocoa/migration.sql`
- `e2e/tech-second-signoff-prefilled.spec.ts`

---

## Verification

1. Unit + integration tests pass: `pnpm type-check && npx vitest run`.
2. E2E target: all 5 invited-tech specs (`tech-banner-auto-dismiss`, `tech-signoff-modal-cancel`, `tech-signoff-modal-fresh`, `tech-second-signoff-prefilled`, `tech-evidence-capture-no-modal`) green against staging.
3. Visual baselines: snapshot diff = 0.
4. Schema migration round-trips: apply on staging snapshot; assert `InspectionPhoto` rows are backward-compatible (NULL `cocoa*` on existing rows); re-run migration; no-op.
5. Manual Verification Gate executed by a human on staging with the 5 confirmation screenshots.
6. No regressions in existing inspection flow: legacy photos still render in the photo list; reports still generate; sign-off API still accepts the same payload.

---

## Out of scope (separate sub-projects)

- **Sub-project #3** — BYOK upgrade paths.
- **Sub-project #5** — sign-in → job-close E2E audit.
- **Sub-project #6** — Email-provider BYOK.
- **Seam F** — Cloudinary upload pipeline (fixed in parallel via PR #1008; not part of this design).
- **RC3** — Sandbox Google OAuth env update (user-action).

## Post-approval handoff

After this design is approved:

1. Self-review the spec for placeholders / contradictions / ambiguity / scope creep.
2. User reviews the spec doc.
3. Invoke `superpowers:writing-plans` skill to produce the implementation plan.

No implementation actions are authorized before that handoff completes.
