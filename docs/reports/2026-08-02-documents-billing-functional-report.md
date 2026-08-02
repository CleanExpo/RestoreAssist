# Documents & Billing Functional Report

**Date:** 2026-08-02  
**Scope:** Invoices (AR) · Restoration Documents · Quote Generator · Media Library · Cost Libraries  
**Cloudinary rule:** image/media uploads via `getStorageProvider` / `lib/cloudinary.ts`; durable `secure_url` / `public_id` in Postgres.

---

## Summary

| Surface | Intended journey | Status |
|---|---|---|
| Invoices | Create → edit lines → GST → PDF → send → public token view → payment → sync | **Pass** (core paths); recurring auto-generate gated |
| Restoration Documents | Seed → form → save → list/filter → edit/delete; distinct from AR | **Pass** |
| Quote Generator | Calculate → min charge → print → **Save as Estimate** / **Create Invoice Draft** | **Pass** |
| Media Library | Inspection upload → Cloudinary → MediaAsset → working thumbs | **Pass** (proxy routes added) |
| Cost Libraries | CRUD / search / promote / import; Quote honesty about rates | **Pass** (tests + UX honesty) |

---

## 1. Invoices (AR)

### Intended journey — **Pass**

Standalone create (`/dashboard/invoices/new`), line edit, AU GST via `lib/invoices/calc.ts`, PDF (`/api/invoices/[id]/pdf`), send (`/api/invoices/[id]/send` mints public token), **public page** `/invoices/public/{token}`, payments, sync/retry. Inspection generate uses durable `source: inspection:{id}`.

### Happy path evidence

| Route / artefact | Assertion |
|---|---|
| `GET /api/invoices/public/[token]` | Valid token → 200; strips `publicToken`; contractor + lines |
| `GET/POST .../generate-invoice` | Lookup OR includes `source: inspection:{id}`; POST persists that source |
| `lib/invoices/calc` | GST / rounding unit tests (existing) |
| Email templates | Link target `/invoices/public/{token}` now has page + API |

**Commands:**

```bash
pnpm exec vitest run --config config/vitest.config.js \
  'app/api/invoices/public/[token]/__tests__/route.test.ts' \
  'app/api/inspections/[id]/generate-invoice/__tests__/source-link.test.ts' \
  lib/invoices/__tests__/calc.test.ts \
  lib/invoices/__tests__/calc-gst-free.test.ts
```

### Edge cases

| Case | Expected | Actual | Status |
|---|---|---|---|
| Unauthenticated list/create | 401 | Existing invoice routes use session + apiError | Pass |
| Wrong tenant (IDOR) | 404 / empty | Routes filter `userId: session.user.id` | Pass |
| Missing workspace / payment gate | 402 where gated | Payments entitlement tests exist; public view is token-gated not payment-gated | Pass / N/A |
| Missing Cloudinary env | Logos may be empty; PDF logo URL optional | Business logo from profile URL (Cloudinary when set); no hard fail on public page | Pass (soft) |
| Empty invoice list | Empty state UI | Existing dashboard empty handling | Pass |
| Invalid create payload | 400 VALIDATION | route-validation tests | Pass |
| Double-submit create | Idempotency-Key | `withIdempotency` on POST | Pass |
| GST / rounding | Per-line gstRate + shared calc | `calculateInvoiceTotals` SSOT | Pass |
| Public token invalid | 404 generic | Implemented | Pass |
| Public token expired | 404 + expired message | Implemented | Pass |
| Public token rotated | Old token 404 | `isPublicTokenValid` mismatch | Pass |
| Legacy token no expiry | Accept + `legacy_no_expiry` | Helper behaviour preserved | Pass |
| Recurring auto-generate | Cron or honest gate | **UI banner: no cron yet** — schedules can be stored, not auto-fired | Gated |
| Dual systems confusion | Clear UX | Restoration Documents banner + AR prefill CTA | Pass |

### Remaining gaps

- Recurring invoice **cron** not implemented (UI warns).
- No `sourceInspectionId` FK column — durable string `source: inspection:{id}` used instead (schema-compatible).
- Public page is view-only (no online pay CTA on public page; checkout remains authenticated dashboard path).

---

## 2. Restoration Documents

### Intended journey — **Pass**

Seed (`GET /api/restoration-documents/seed?reportId=`), form save (`POST/PATCH`), list + filters, open via `/dashboard/restoration-documents/invoice/[id]` for **both** `RESTORATION_INVOICE` and `ESTIMATE` (fixed dead `/[id]` link). Dual-system copy + AR prefill CTA.

### Happy path evidence

| Route | Assertion |
|---|---|
| `GET /api/restoration-documents` | Scoped to `userId`, `take: 50`, filter by `documentType` |
| `POST /api/restoration-documents` | Creates ESTIMATE with JSON `data` (Quote Generator save path) |

```bash
pnpm exec vitest run --config config/vitest.config.js \
  app/api/restoration-documents/__tests__/route.test.ts
```

### Edge cases

| Case | Expected | Actual | Status |
|---|---|---|---|
| Unauthenticated | 401 | Pass | Pass |
| Wrong tenant | Not found / empty | `userId` filter on GET/POST/[id] | Pass |
| ESTIMATE filter | Shows estimates; openable | Filter client-side; href fixed to invoice editor | Pass |
| ESTIMATE create path | Quote Generator → Save as Estimate | Implemented | Pass |
| Empty list | Empty UI | Existing | Pass |
| Invalid POST | 400 missing fields | Tested | Pass |
| Dual invoice confusion | Honest copy | Amber banner + AR link | Pass |
| Auto-bridge to Xero AR | Optional / not silent | Explicit CTA only — no auto merge | Pass (by design) |
| Logos in form data | Cloudinary URLs when uploaded via `/api/upload` | Upload route uses Cloudinary | Pass |

### Remaining gaps

- List hard-capped at 50 (documented; raise later if needed).
- No automated conversion of Restoration Document lines → AR Invoice line items (prefill name/email/notes only).

---

## 3. Quote Generator

### Intended journey — **Pass**

`/dashboard/quote` → `POST /api/calculate` → print → **Save as Estimate** (RestorationDocument) and/or **Create Invoice Draft** (AR Invoice `source: quote_generator`). Pricing note: Company Pricing Config, **not** Cost Libraries.

### Happy path evidence

| Item | Assertion |
|---|---|
| Zod + min $2,750 ex-GST | `lib/quotes/quote-calc.ts` + route test |
| Calculate response | `pricingSource`, `pricingNote` |
| Durable save | POST restoration-documents / POST invoices |

```bash
pnpm exec vitest run --config config/vitest.config.js \
  lib/quotes/__tests__/quote-calc.test.ts \
  app/api/calculate/__tests__/route.test.ts
```

### Edge cases

| Case | Expected | Actual | Status |
|---|---|---|---|
| Unauthenticated calculate | 401 | Pass | Pass |
| Inactive subscription | 402 | Pass | Pass |
| Invalid payload | 400 | Pass | Pass |
| Below minimum | Lift to $2,750 + flag | Pass | Pass |
| GST 10% on min | $275 / total $3,025 | Pass | Pass |
| Invoice draft without client email | Blocked client-side | Toast requires email | Pass |
| Min charge without line | Top-up line added on invoice create | Client adds minimum engagement line | Pass |
| Cost Library divergence | Honest UX | Header + API `pricingNote` | Pass |
| Reload saved estimate | Open restoration document | Link after save | Pass |

### Remaining gaps

- Quote does not search Cost Libraries (intentional; Estimation Engine remains library-backed path).
- Saved ESTIMATE JSON is quote-shaped; RestorationInvoiceForm may show incomplete IICRC sections until user edits.

---

## 4. Media Library

### Intended journey — **Pass**

Inspection photo/evidence → `getStorageProvider` → Cloudinary → `InspectionPhoto` + `MediaAsset.storagePath` (public_id) → Media Library thumbs via **`GET /api/storage/thumbnail?path=`** (302 to Cloudinary transform) and file via **`GET /api/storage/file?path=`**.

### Happy path evidence

| Artefact | Assertion |
|---|---|
| `lib/media/cloudinary-asset-url.ts` | public_id → delivery URL; absolute URL passthrough; missing env → null |
| Storage factory | Cloudinary default (`get-storage-provider` tests) |
| Thumbnail/file routes | Auth required; 422 if relative path + no Cloudinary env |

```bash
pnpm exec vitest run --config config/vitest.config.js \
  lib/media/__tests__/cloudinary-asset-url.test.ts \
  lib/storage/__tests__/get-storage-provider.test.ts \
  lib/storage/__tests__/cloudinary-provider.test.ts \
  lib/media/__tests__/validate-image-upload.test.ts
```

### Edge cases

| Case | Expected | Actual | Status |
|---|---|---|---|
| Unauthenticated thumbnail | 401 | Implemented | Pass |
| Missing Cloudinary env + relative path | 422 actionable | Implemented | Pass |
| Absolute secure_url storagePath | Serve/redirect as-is (optional transform) | Pass | Pass |
| Photo without EXIF | Catalog still creates asset | Existing catalog path (warns / soft) | Pass (existing) |
| Broken thumbnail URL | Image broken icon; SEO uses file proxy | Proxy no longer 404 | Pass |
| Payment / workspace gate | Media page gated as before | Unchanged | Pass |
| Empty library | Empty state | Existing UI | Pass |
| Bypass Cloudinary | Must not for images | Photos/evidence/upload use Cloudinary helpers | Pass |

### Remaining gaps

- Thumbnail proxy does not re-check workspace ownership of `path` (relies on obscure public_ids + session). Hardening: resolve MediaAsset by id under workspace before redirect.
- Manual smoke still required (see checklist).

---

## 5. Cost Libraries

### Intended journey — **Pass**

CRUD libraries/items, CSV import, default library, search autocomplete, promote from estimate into library. Quote Generator explicitly does **not** use libraries.

### Happy path evidence

| Route | Assertion |
|---|---|
| `POST /api/cost-libraries/promote` | Creates default library; dedupe update |
| `GET /api/cost-libraries/search` | Tenant-scoped; q&lt;2 → []; limit capped |

```bash
pnpm exec vitest run --config config/vitest.config.js \
  app/api/cost-libraries/__tests__/promote-search.test.ts
```

### Edge cases

| Case | Expected | Actual | Status |
|---|---|---|---|
| Unauthenticated | 401 | Pass | Pass |
| Wrong tenant | No cross-user items | `library.userId` filter | Pass |
| Invalid promote payload | 422 | Pass | Pass |
| Double promote same line | Update rate/unit | Pass | Pass |
| Large CSV import | Bounded import route | Existing import; list caps 50/500 remain | Documented |
| Quote vs library rates | Clear copy | Quote page + API note | Pass |

### Remaining gaps

- Dedicated import/export route tests still thin (promote/search covered).
- List caps (50 libraries / 500 items patterns) unchanged — raise carefully if product needs.

---

## Manual smoke checklist (browser)

1. Ensure `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` set (discrete vars win over `CLOUDINARY_URL`).
2. Upload an inspection photo → confirm Cloudinary `secure_url` / public_id on photo + MediaAsset.
3. Open `/dashboard/media` → thumbnail loads (network shows `/api/storage/thumbnail` → 302 Cloudinary).
4. Refresh Media Library → asset still present.
5. Create/send invoice → open email link `/invoices/public/{token}` → amounts/lines visible.
6. Quote Generator → Calculate → Save as Estimate → reopen from Restoration Documents.
7. Quote → Create Invoice Draft (with client email) → lands on AR invoice draft.
8. Confirm Restoration Documents banner vs Billing → Invoices distinction.

---

## Re-run all Documents & Billing tests

```bash
pnpm exec vitest run --config config/vitest.config.js \
  lib/media/__tests__/cloudinary-asset-url.test.ts \
  lib/quotes/__tests__/quote-calc.test.ts \
  'app/api/invoices/public/[token]/__tests__/route.test.ts' \
  app/api/cost-libraries/__tests__/promote-search.test.ts \
  app/api/restoration-documents/__tests__/route.test.ts \
  'app/api/inspections/[id]/generate-invoice/__tests__/source-link.test.ts' \
  app/api/calculate/__tests__/route.test.ts \
  lib/invoices/__tests__/calc.test.ts \
  lib/storage/__tests__/get-storage-provider.test.ts \
  lib/storage/__tests__/cloudinary-provider.test.ts
```

**Last run (2026-08-02):** 10 files / **58 tests passed**.

---

## Follow-ups (honest)

1. Implement `cron` for recurring invoice generation (or keep UI gated).
2. Optional: Media thumbnail authorization by `MediaAsset` id + workspace.
3. Optional: richer ESTIMATE → RestorationInvoiceForm mapping from quote JSON.
4. Optional: Cost Library picker on Quote Generator (would need EstimationEngine alignment).
5. Prisma FK `sourceInspectionId` if product wants relational integrity beyond `source` string.
