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
| 4 | **Sandra** — admin / business owner | Desktop | Billing, reopen inspection, void invoice | Invoice void unimplemented (but honestly warned, #1 — verified OK); bulk-delete shows counts but not which items failed (#4, minor) |
| 5 | **Aput** — contractor (public directory) | Desktop / tablet | Maintain certifications, service areas, profile | Verification workflow gaps; profile completeness signals |
| 6 | **Linda** — insurer claims adjuster | Desktop / tablet, insurer portal | Review evidence, validate, export to Guidewire | Guidewire export ships empty `certifications` + `0,0` GPS (#14); insurer portal untested |
| 7 | **Tom** — homeowner self-capture | Android phone, `/capture/[token]` | Sketch damp areas before tech arrives | Guided-editor clarity; quarantine review path |
| 8 | **Margaret** — homeowner signer | iPhone Safari, `/sign/[token]` | E-sign authority form | Signature modal focus trap (#25); dual-submit race (#10) |
| 9 | **Raj** — bookkeeper / accountant | Desktop, Xero | Sync invoices, GL mapping by damage type | Integration sync surfaces; webhook reliability |
| 10 | **Chloe** — trial signup | Web signup → installs iOS app | Onboard, setup wizard, evaluate | **Native Google OAuth placeholder ID blocks iOS sign-in (#3)**; setup edits not persisted (#19, #20); paywall |

---

## Defect catalogue

Severity: **P1** broken · **P2** degraded · **P3** polish/a11y. Disposition: **FIX** (code changed this run) ·
**LOCK** (behaviour already correct — regression test added, no code change) · **FALSE-POSITIVE** (audit claim
contradicted by source — no change needed) · **DEFER** (owner-gated) · **REPORT** (tracked, not built this run).

> **Honesty note:** during the build, T4/T5/T10 were retargeted from heavy client-page renders to tractable,
> genuinely-untested API/lib subjects; the disposition + coverage table below reflect **what was actually built**,
> not the original plan. Several audit findings were verified against source and were **not** the defects claimed:
> #1 (reopen) and #23 (interview stats) are **already correct** in source → regression-LOCKed, not fixed;
> #4 (invoice bulk-delete) is **already reasonable** (counts shown) with only a minor gap — per-item itemization
> of *which* invoices failed — which is filed as REPORT, not a fix. None of these three were code changes this run.

| # | Sev | Finding | file:line | Persona | Disposition |
|---|---|---|---|---|---|
| 1 | P1 | `reopen` accepts `voidInvoice` but never voids — BUT returns `invoiceVoided:false` **with an explicit `warning`** (route.ts:201-203), so it is already honest, not silent | `app/api/inspections/[id]/reopen/route.ts:189-204` | Sandra | **LOCK** (T3) — already honest; test pins the warning contract |
| 2 | P1 | Live Teacher tool array hardwired empty (`const tools = []`) | `lib/live-teacher/claude-cloud.ts:193` | Dave | **DEFER** — needs tool design |
| 3 | P1 | Native Google OAuth uses literal placeholder web client ID | `lib/oauth-native.ts:64` | Chloe | **DEFER** — owner Google secret |
| 4 | P2 | Invoice bulk-delete already counts + toasts partial success **and** failure (route.ts:142-160); only per-item itemization (which IDs) is missing | `app/dashboard/invoices/page.tsx:154` | Sandra | **FALSE-POSITIVE** — already reasonable; per-item itemization is a future enhancement (REPORT) |
| 5 | P2 | Report download failures log to console only — no user feedback | `app/dashboard/reports/page.tsx:207` | Marcus | **FIX** ✓ — error toast added; T4 locks the download route's auth/entitlement/ownership guards |
| 6 | P2 | Report synthesis: cached vs new ambiguous, no next-action CTA | `app/dashboard/reports/page.tsx:174` | Marcus | **REPORT** |
| 7 | P2 | OneDrive "coming soon" disabled but reason not reachable by assistive tech | `components/setup/StorageCard.tsx:128` | Chloe | **FIX** ✓ — `aria-disabled` + reason in accessible name (T6) |
| 8 | P2 | NIR Bluetooth UUIDs flagged "TODO: validate" against firmware; wrong → silent no-pair | `lib/nir-bluetooth-service.ts:51,406` | Dave | **DEFER** — hardware firmware |
| 9 | P3 | Setup activation only `console.log`s — no funnel metric | `app/api/setup/activate/route.ts:9` | (internal) | **REPORT** |
| 10 | P2 | Authority-form signature dual-submit race not guarded by a test (atomic `signedAt:null` guard already exists) | `app/api/authority-forms/sign/[token]/route.ts:120` | Margaret | **LOCK** (T2) — guard already correct; test pins idempotency |
| 11 | P3 | `setup/hydrate` rate-limit keyed on IP not session — shared networks lock out | `app/api/setup/hydrate/route.ts:16` | Chloe | **REPORT** |
| 12 | P3 | NZ weather (NIWA CliFlo) integration TODO — NZ reports miss weather context | `lib/weather/weather-provider.ts:6,218` | Linda (NZ) | **DEFER** — NIWA API key |
| 13 | P2 | **Missing connection:** reports surface has zero linkage into the signing flow. (Audit-doc's "PENDING_SIGNATURE button" was UNSUPPORTED — no such status in schema; signing is decoupled on AuthorityForm.) | `app/dashboard/reports/page.tsx` (no sign link) | Marcus | **REPORT** — needs UX wiring |
| 14 | P2 | Guidewire export ships empty `certifications` (TODO Phase 3) + GPS defaults to `0,0` (null-island) when photo lacks GPS | `app/api/inspections/[id]/guidewire/route.ts:177,265-266` | Linda | **DEFER** — needs insurer field spec |
| 15 | P3 | Field technician first-run has no onboarding checklist | (no component) | Priya | **REPORT** — retention gap |
| 16 | P3 | Report generation dead-ends — no "next step" (sign / share / download) CTA | reports flow | Marcus | **REPORT** |
| 17 | P3 | Bulk-action confirmation modal loses focus / no return focus | DeleteConfirmationDialog usage | Marcus | **REPORT** — not built this run (a11y backlog) |
| 18 | P3 | Reports table icon buttons (eye/edit/copy/more) have `title` but no `aria-label` | `app/dashboard/reports/page.tsx:942-983` | Marcus | **REPORT** — not built this run (a11y backlog) |
| 19 | P3 | Setup BrandCard logo upload not wired (TODO Cloudinary) — silent no-op | `components/setup/BrandCard.tsx:34` | Chloe | **DEFER/REPORT** |
| 20 | P3 | Setup BusinessDetailsCard manual edits not persisted on blur (TODO) — data loss on refresh | `components/setup/BusinessDetailsCard.tsx:179` | Chloe | **REPORT** |
| 21 | P3 | Claims-analysis Google Drive picker partially gated / "coming soon" | various | Linda | **REPORT** |
| 22 | P3 | Reports pagination shows stale page-count briefly after filter change | `app/dashboard/reports/page.tsx:1011-1026` | Marcus | **REPORT** |
| 23 | P2 | Interview stats `statsError` IS rendered (page.tsx:332-338 shows "—" + error title) — NOT an infinite spinner. Residual: the `templates` `useFetch` (line 94) has no error branch | `app/dashboard/interviews/page.tsx:88-96,332` | Marcus | **FALSE-POSITIVE** — stats error already handled; templates-error branch is REPORT |
| 24 | P3 | Interview bulk-delete confirmation lacks detail / undo | `app/dashboard/interviews/page.tsx:187` | Marcus | **REPORT** |
| 25 | P3 | Authority-form signature modal doesn't trap/return focus | `components/authority-forms/*` | Margaret | **REPORT** — not built this run (a11y backlog) |

**Coverage gaps closed by the new tests (what each test actually exercises — 45 cases, all green):**

| Test | Subject (untested before) | Persona | Locks |
|---|---|---|---|
| T1 | `app/api/inspections` GET+POST | Priya/Sandra | auth, tenant scoping, validation, 201 create |
| T2 | `app/api/authority-forms/sign/[token]` POST | Margaret | signature idempotency / dual-submit → 409 |
| T3 | `app/api/inspections/[id]/reopen` POST | Sandra | reopen guards + honest void-invoice warning contract |
| T4 | `app/api/reports/[id]/download` GET | Marcus | auth / entitlement(402) / tenant-ownership(404) guards |
| T5 | `app/api/progress/[reportId]/transition` POST | Marcus/Priya | state machine + junior-tech ring-fence + stale-version 409 |
| T6 | `components/setup/StorageCard` | Chloe | disabled option `aria-disabled` + reason in accessible name |
| T7 | `app/api/progress/[reportId]/init` POST | Marcus | bootstrap: auth, 201, idempotent 409, 404 |
| T8 | `app/api/capture/[token]` GET | Tom | token validation: deny invalid without reading tenant data |
| T9 | `lib/generate-authority-form-pdf` | Linda/Marcus | PDF smoke (valid `%PDF-` byte stream) |
| T10 | `app/api/portal/reports/[id]/approvals` POST | Linda | insurer approve/reject: client-only, scoping, find-or-create |

**Code fixes shipped this run:** #5 (report download error toast), #7 (StorageCard disabled-option a11y).
Everything else is LOCK (test only), FALSE-POSITIVE (no change), DEFER (owner-gated), or REPORT (backlog).

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
