# RestoreAssist — STORM Persona Audit (10 personas × device × reason · 2026-06-30)

**Method:** Stanford STORM — multi-perspective audit. Ten personas drive the app across different devices and
jobs-to-be-done; each surfaces missing elements, missing connections, UI/UX issues, stickiness gaps, and broken
flows. All findings are grounded in first-source code (`file:line`). Companion regression suite: 10 new tests
(T1–T10) added under each subject's `__tests__/`.

> Complements (does **not** replace) `.harness/storm-audit-2026-06-30.md` — that earlier pass used 7 *technical*
> personas (data-integrity, bloat, perf, ops/CI, compliance). This pass uses 10 *user-journey* personas
> (device × reason) and focuses on broken/dead flows, missing states, missing connections, and stickiness.

**App model (grounded):** Next.js App Router + Capacitor 6 (native iOS/Android) + PWA (`app/manifest.ts`).
Roles `USER | ADMIN | MANAGER` + `isJuniorTechnician` (`prisma/schema.prisma:854`). Clients/homeowners are
token-gated non-User identities via `/portal/[token]`, `/sign/[token]`, `/capture/[token]`.

---

## The 10 personas

| # | Persona | Device | Job-to-be-done | Primary bites |
|---|---|---|---|---|
| 1 | **Priya** — junior technician, first water callout | iPhone, PWA installed, offline basement | Capture photos + sketch + moisture, submit | No first-run checklist (#15); junior progress ring-fence; offline cache fallback |
| 2 | **Dave** — senior restorer | iPad native (Capacitor) + Bluetooth moisture meter | Pair meter, voice-dictate, generate report | Unverified meter UUIDs silently fail (#8); Live Teacher tools empty (#2) |
| 3 | **Marcus** — operations manager | Desktop web | Approve scope, sign authority, oversee team | Reports surface has no link into signing flow — missing connection (#13); dead-end success (#16); modal focus loss (#17) |
| 4 | **Sandra** — admin / business owner | Desktop | Billing, reopen inspection, void invoice | Invoice void unimplemented but reports success (#1); bulk-delete masks partial failure (#4) |
| 5 | **Aput** — contractor (public directory) | Desktop / tablet | Maintain certifications, service areas, profile | Verification workflow gaps; profile completeness signals |
| 6 | **Linda** — insurer claims adjuster | Desktop / tablet, insurer portal | Review evidence, validate, export to Guidewire | Guidewire export ships empty `certifications` + `0,0` GPS (#14); insurer portal untested |
| 7 | **Tom** — homeowner self-capture | Android phone, `/capture/[token]` | Sketch damp areas before tech arrives | Guided-editor clarity; quarantine review path |
| 8 | **Margaret** — homeowner signer | iPhone Safari, `/sign/[token]` | E-sign authority form | Signature modal focus trap (#25); dual-submit race (#10) |
| 9 | **Raj** — bookkeeper / accountant | Desktop, Xero | Sync invoices, GL mapping by damage type | Integration sync surfaces; webhook reliability |
| 10 | **Chloe** — trial signup | Web signup → installs iOS app | Onboard, setup wizard, evaluate | **Native Google OAuth placeholder ID blocks iOS sign-in (#3)**; setup edits not persisted (#19, #20); paywall |

---

## Defect catalogue

Severity: **P1** broken · **P2** degraded · **P3** polish/a11y. Disposition: **FIX** (safe, this run) ·
**DEFER** (owner-gated) · **REPORT** (tracked, lower priority).

| # | Sev | Finding | file:line | Persona | Disposition |
|---|---|---|---|---|---|
| 1 | P1 | `reopen` accepts `voidInvoice` but never voids; returns `invoiceVoided:false` as if success | `app/api/inspections/[id]/reopen/route.ts:189` | Sandra | **FIX** — honest contract (T3) |
| 2 | P1 | Live Teacher tool array hardwired empty (`const tools = []`) | `lib/live-teacher/claude-cloud.ts:193` | Dave | **DEFER** — needs tool design |
| 3 | P1 | Native Google OAuth uses literal placeholder web client ID | `lib/oauth-native.ts:64` | Chloe | **DEFER** — owner Google secret |
| 4 | P2 | Invoice bulk-delete shows generic "Failed to delete N" — no itemization/recovery | `app/dashboard/invoices/page.tsx:154` | Sandra | **FIX** (T10) |
| 5 | P2 | Report download failures log to console only — no user feedback | `app/dashboard/reports/page.tsx:207` | Marcus | **FIX** — error toast (T4) |
| 6 | P2 | Report synthesis: cached vs new ambiguous, no next-action CTA | `app/dashboard/reports/page.tsx:174` | Marcus | **REPORT** |
| 7 | P2 | OneDrive "coming soon" disabled but not `aria-disabled`; clickable-looking | `components/setup/StorageCard.tsx:128` | Chloe | **FIX** (T6) |
| 8 | P2 | NIR Bluetooth UUIDs flagged "TODO: validate" against firmware; wrong → silent no-pair | `lib/nir-bluetooth-service.ts:51,406` | Dave | **DEFER** — hardware firmware |
| 9 | P3 | Setup activation only `console.log`s — no funnel metric | `app/api/setup/activate/route.ts:9` | (internal) | **REPORT** |
| 10 | P2 | Authority-form signature dual-submit race not guarded by a test (atomic `signedAt:null` exists) | `app/api/authority-forms/sign/[token]/route.ts:120` | Margaret | **FIX** — lock with test (T2) |
| 11 | P3 | `setup/hydrate` rate-limit keyed on IP not session — shared networks lock out | `app/api/setup/hydrate/route.ts:16` | Chloe | **REPORT** |
| 12 | P3 | NZ weather (NIWA CliFlo) integration TODO — NZ reports miss weather context | `lib/weather/weather-provider.ts:6,218` | Linda (NZ) | **DEFER** — NIWA API key |
| 13 | P2 | **Missing connection:** reports surface has zero linkage into the signing flow. (Audit-doc's "PENDING_SIGNATURE button" was UNSUPPORTED — no such status in schema; signing is decoupled on AuthorityForm.) | `app/dashboard/reports/page.tsx` (no sign link) | Marcus | **REPORT** — needs UX wiring |
| 14 | P2 | Guidewire export ships empty `certifications` (TODO Phase 3) + GPS defaults to `0,0` (null-island) when photo lacks GPS | `app/api/inspections/[id]/guidewire/route.ts:177,265-266` | Linda | **DEFER** — needs insurer field spec |
| 15 | P3 | Field technician first-run has no onboarding checklist | (no component) | Priya | **REPORT** — retention gap |
| 16 | P3 | Report generation dead-ends — no "next step" (sign / share / download) CTA | reports flow | Marcus | **REPORT** |
| 17 | P3 | Bulk-action confirmation modal loses focus / no return focus | DeleteConfirmationDialog usage | Marcus | **FIX** — focus return (a11y) |
| 18 | P3 | Reports table icon buttons (eye/edit/copy/more) have `title` but no `aria-label` | `app/dashboard/reports/page.tsx:942-983` | Marcus | **FIX** — aria-labels |
| 19 | P3 | Setup BrandCard logo upload not wired (TODO Cloudinary) — silent no-op | `components/setup/BrandCard.tsx:34` | Chloe | **DEFER/REPORT** |
| 20 | P3 | Setup BusinessDetailsCard manual edits not persisted on blur (TODO) — data loss on refresh | `components/setup/BusinessDetailsCard.tsx:179` | Chloe | **REPORT** |
| 21 | P3 | Claims-analysis Google Drive picker partially gated / "coming soon" | various | Linda | **REPORT** |
| 22 | P3 | Reports pagination shows stale page-count briefly after filter change | `app/dashboard/reports/page.tsx:1011-1026` | Marcus | **REPORT** |
| 23 | P2 | Interview stats: `statsError` captured but unused → infinite "Loading templates…" on API failure | `app/dashboard/interviews/page.tsx:88-96` | Marcus | **FIX** — error state (T5) |
| 24 | P3 | Interview bulk-delete confirmation lacks detail / undo | `app/dashboard/interviews/page.tsx:187` | Marcus | **REPORT** |
| 25 | P3 | Authority-form signature modal doesn't trap/return focus | `components/authority-forms/*` | Margaret | **FIX** — focus (a11y) |

**Coverage gaps closed by the new tests (T1–T10):** main inspections route (T1), authority-form signing
race (T2), reopen void contract (T3), report download error (T4), interview stats error (T5), storage-option
a11y (T6), progress init (T7), portal token validation (T8), PDF generation smoke (T9), invoice bulk-delete
itemization (T10).

---

## Owner-gated blockers (NOT built — exact input each needs)

| # | Item | Input required from owner |
|---|---|---|
| 3 | Native Google OAuth | Real **Google Cloud Console Web client ID** for native redirect (`lib/oauth-native.ts:64`) |
| 8 | Bluetooth moisture meter | **Verified BLE service/characteristic UUIDs** from meter manufacturer firmware |
| 2 | Live Teacher tools | **Tool design decision** — which Anthropic tools the coach may call (`claude-cloud.ts:193`) |
| 12 | NZ weather | **NIWA CliFlo API key** + endpoint approval |
| 14 | Guidewire export | **Insurer field spec** — required certifications source + GPS-missing policy |

---

*Generated by the STORM overnight build. Tests + safe fixes ship as PRs (no merge to main, rule 18).*
