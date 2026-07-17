# Sub-project #5 — Sign-in → Job-Close Journey Audit

**Date:** 2026-05-14
**Status:** Design — pending user review

## 1. Context & scope

### 1.1 What this audit is

A structural read of the full tradie journey — signup → setup → admin invites tech → tech accepts → inspection start → photos & readings → sign-off → on-site handover → invoice → close → archive — to find broken seams, dead ends, missing transitions, half-built BYOK pipelines, and absent AI orchestration. The audit's output is this spec plus an ordered roadmap of nine sub-projects that, shipped in sequence, close every gap.

### 1.2 Scope boundary

- **In scope:** the 9 journey stages, their state machine, AI orchestration substrate, BYOK infrastructure, on-site handover deliverables.
- **Out of scope of *this* audit (each gets its own brainstorm):** SP-D evidence-capture expansion (video / LiDAR / GeoMap view), SP-F role-gate consolidation, SP-K SMS BYOK.
- **Out of scope entirely:** marketing-site rewrites, billing-plan changes, mobile native-app rewrites, dispute / claims-defense workflows, multi-region deploys.

### 1.3 Deliverable

This spec doc — comprising:
- Gap inventory across all 9 stages (Section 2)
- Cross-cutting findings (Section 3)
- Foundation: onboarding hotfix + SP-E storage BYOK (Section 4)
- AI intelligence layer at state boundaries (Section 5)
- SP-G Sidekick capability surface (Section 6)
- SP-H knowledge substrate (Obsidian → RAG) (Section 7)
- SP-A job-close terminal state (Section 8)
- SP-J on-site handover package (Section 9)
- Design principles: no double-handling + BYOK (Section 10)
- SP-B auto-progression (Section 11)
- SP-C Completed tab + admin re-open (Section 12)
- Testing strategy (Section 13)
- Out-of-scope sub-projects (Section 14)
- Roadmap summary (Section 15)
- Verification gate (Section 16)

### 1.4 Success criteria

After the roadmap ships:
- `Inspection.status = COMPLETED` is actually written (no longer enum decay).
- A tradie can close a job, the client receives the full package on-site, and the system records everything with chain-of-custody.
- Setup wizard's BYOK choices (storage, AI, email) are honoured end-to-end.
- AI Sidekick is present during inspection and helps the tech with paperwork, research, suggestions, missing-data prompts, and image analysis.
- Every state transition pulls existing data; admin re-typing is eliminated.

---

## 2. Gap inventory (per stage, severity-graded)

**Severity:** P0 = blocks the journey · P1 = forces work-around · P2 = polish.

| Stage | Top gaps |
|---|---|
| **1 Signup** | P1: no auto-redirect to `/setup` after register. P2: no `AuditLog` row for `USER_REGISTERED`. |
| **2 Setup wizard** | P1: `HydrationJob` status not surfaced — long-running setup can hang silently. **P0: GDrive storage card advertises Drive but `/api/oauth/google-drive/start` doesn't exist** — broken promise on day one. |
| **3 Admin invites tech** | P0: `/dashboard/team` page not found in routes — admins can only invite via API. P1: invite expiry not enforced. P2: no "resend invite" UI. |
| **4 Tech accepts invite + Authorisation** | P1: EngagementLicenceModal can be dismissed without re-trigger. P1: no race-condition guard on accept-after-expiry. P2: no "complete licence later" deferred path. |
| **5 Inspection start** | P1: no status column in list view. P0: no "Start inspection" → "Capture evidence" CTA chain. |
| **6 Capture (photos + readings + sketch + bluetooth + moisture canvas + voice notes)** | P1: no "required photos" validation gate before sign-off. P1: sketch/moisture/voice-notes have no cross-references. P2: bluetooth meter disconnect mid-reading isn't surfaced. **MISSING:** video, LiDAR scan, GeoMap pin view → SP-D candidate. |
| **7 Sign-off** | P1: signed state has no "Hand over to client" CTA — terminal dead-end. P1: `SUBMITTED` is the final inspection status the code ever sets. |
| **8 Invoice + sync** | **P0: no auto-generation from sign-off** — manual click required. P0: `Invoice.status=PAID` has no signal back to inspection. P1: failed `InvoiceSyncJob` rows have no retry CTA in UI. |
| **9 Job close + archive** | **P0: doesn't exist.** `InspectionStatus.COMPLETED` defined, never written. No archive flag. No closure audit-log action. No client-facing "your job is complete" surface. |

---

## 3. Cross-cutting findings & architectural implications

### 3.1 No state machine governs the journey (P0)
Every stage advances by manual click. SP-A + SP-B introduce a lightweight `lib/lifecycle/inspection-state-machine.ts` exporting `canTransition(currentStatus, targetStatus, context)` + `nextSuggestions(currentStatus, context)`. Routes call `canTransition` before any UPDATE; UI calls `nextSuggestions` to render the "Ready to X?" prompts.

### 3.2 Storage BYOK pipeline half-built (P0)
Setup wizard offers GDrive; OAuth start route doesn't exist; photos still only go to Supabase. Affects Stages 5–9. Onboarding hotfix + SP-E.

### 3.3 InspectionStatus enum decay (P0)
`COMPLETED` + `REJECTED` defined but never written. SP-A writes COMPLETED. SP-A migration formalises `IN_BILLING` as a new intermediate state.

### 3.4 Audit log retrofit (P1)
~half the journey events have no `AuditLog` row. SP-A introduces `lib/audit/lifecycle-event.ts` reused by SP-B, SP-C, SP-J. Backfill of historical events is out of scope (no provenance).

### 3.5 Modal-first dismissal recovery (P1)
SP-2 (EngagementLicenceModal) + SP-7 (sign-off) lack re-trigger if dismissed. Documented in inventory; no SP designed — surface-level fix bundled into whichever SP touches each modal next.

### 3.6 Role-gate consolidation (P1)
Junior Technician restrictions live in UI but not server. Out of scope for this audit's SPs — flagged for `lib/auth/rbac.ts` consolidation as SP-F candidate. Each SP-A/B/C/J respects existing role guards; doesn't add new ones.

---

## 4. Foundation: onboarding hotfix + SP-E (ships before everything else)

### 4.1 Onboarding hotfix (patch to sub-project #1)

**Scope:** 1 PR, ~2 days.

- Build `/api/oauth/google-drive/start` (Google OAuth 2.0 PKCE, scopes `drive.file` + `drive.appdata`).
- Build `/api/oauth/google-drive/callback`.
- Add `storageProvider` enum to `Organization`: `LOCAL | GOOGLE_DRIVE | ONEDRIVE`. Default `LOCAL`.
- Add `storageProviderRefreshToken` (AES-256-GCM via `lib/credential-vault.ts`).
- Complete StorageCard wiring: OAuth success → persist provider + tokens → return to `/setup` → card shows [PASS] "Connected as <gmail>".
- Remove the existing `TODO` in `StorageCard.tsx`.

**Verification gate:** new tradie signs up → setup wizard StorageCard "Connect Google Drive" → OAuth grant → return to `/setup` → Organization row has `storageProvider=GOOGLE_DRIVE` + encrypted refresh token.

### 4.2 SP-E: Storage BYOK pipeline

**Scope:** ~1 week.

**Why now:** SP-A (job-close) needs to export a close-package to the client's Drive. SP-J (handover) needs to mirror the handover bundle to Drive at sign-off. Without SP-E both have nowhere to write.

**Components:**
- `lib/storage/google-drive-provider.ts` — implements existing `StorageProvider` interface alongside `s3-provider.ts` and `supabase-provider.ts`
- `lib/storage/index.ts` — `getStorageProvider(orgId)` reads `Organization.storageProvider` and dispatches
- **Dual-write strategy:** when `storageProvider === GOOGLE_DRIVE`, primary write to Supabase (latency + reliability), background mirror to GDrive via `lib/queue/storage-mirror.ts`. Failed mirrors retry with exponential backoff; permanent failures surface in Workspace Health.
- New Prisma model `StorageMirrorJob` (jobId, photoId|reportId|invoiceId, status, attempts, lastError)
- **Close-package export hook:** `exportClosedJobToBYOKStorage(inspectionId)` → builds ZIP of (final report PDF + all photos + invoice PDF + audit log JSON) → uploads to `<gdrive>/<org-name>/<job-date>-<inspection-id>/job-package.zip`
- New `/dashboard/settings/storage` page showing connection status + mirror queue + last-sync timestamps

**Out of scope for SP-E:** OneDrive provider (placeholder card stays "Coming soon"), retroactive mirror of pre-existing photos.

**Schema:** one migration adding `StorageMirrorJob` + indexes on `(orgId, status)` and `(createdAt)`.

---

## 5. AI intelligence layer (cross-cutting, threads every SP)

**Architectural framing:** AI is not a feature — it's a substrate. Every state transition fires a `lib/ai/lifecycle/*` hook that prepares draft content the user confirms.

### 5.1 Lifecycle hooks

| Trigger | Hook | Produces | User action |
|---|---|---|---|
| Photo uploaded | `auto-tag-photo.ts` | damage type · room · severity · S500 §X.Y | Tap to accept/edit |
| Sign-off completed | `draft-invoice.ts` | line items + GST 10% + IICRC citations | "Looks right, send" |
| Invoice PAID detected | `close-summary.ts` | client-facing summary | One-tap accept |
| Close confirmed | `next-action.ts` | follow-up suggestions (30d callback, survey, upsell, warranty) | Schedule or dismiss |
| Anywhere in Completed list | `smart-search.ts` | semantic matches | Click to view |
| GDrive mirror failure | `mirror-recovery.ts` | diagnosis + fix suggestion | "Fix it" → auto-retry |

### 5.2 Implementation pattern

```
lib/ai/lifecycle/
  ├── draft-invoice.ts
  ├── close-summary.ts
  ├── next-action.ts
  ├── auto-tag-photo.ts
  ├── smart-search.ts
  └── _shared.ts           ← subscription gate + credit deduction + model-router wrap
```

Each hook respects: subscription allowlist `["TRIAL","ACTIVE","LIFETIME"]` (rule 8) → 402 on CANCELED with friendly renew CTA; atomic credit deduction (rule 9) — refusal renders manual form, not error; IICRC `S500:2021 §X.Y` citations always include edition + section (rule 14); BYOK fallback — if `Organization.byokAiProvider` set, route through user's own key, skip platform credits; every AI generation writes `AuditLog` (`AI_GENERATED_*`).

### 5.3 Editability invariant

The user always sees a draft. No AI hook auto-commits. Every output lands in a confirmation surface with edit affordance. Reasons: IICRC compliance (humans sign), trust during early adoption, cost control.

### 5.4 Storage of AI artefacts

When `Organization.storageProvider = GOOGLE_DRIVE`, AI drafts are stored alongside the human-edited final in the job folder: `/jobs/<job-id>/drafts/invoice-ai.json` + `/jobs/<job-id>/final/invoice.pdf`. So an admin can later see what the AI proposed vs what was sent.

---

## 6. SP-G — AI Sidekick (Live Teacher) — own brainstorm next

### 6.1 What exists today

`lib/live-teacher/` is substantially built:

- `types.ts` (TeacherContext, TeacherStage, WaterCategory, TeacherTurn)
- `router.ts` (turn routing + tool dispatch)
- `context-engine.ts` (tracks missingFields, capturedPhotoCount, hasLidarScan)
- `claude-cloud.ts` (Claude API)
- 6 tools: `capture-photo.ts`, `check-report-gaps.ts`, `fill-scope-item.ts`, `flag-whs-hazard.ts`, `start-lidar-scan.ts`, `take-reading.ts`

### 6.2 Mapped to user-stated abilities

| Sidekick ability | Mechanism today |
|---|---|
| Do paperwork | `fill-scope-item.ts` + Section 5 `draft-invoice.ts` |
| Research | NEW: `tools/lookup-iicrc.ts` + `tools/find-similar-jobs.ts` |
| Suggest good/better/best methods | NEW: `tools/method-recommendation.ts` |
| Talk and discuss | Router exists; voice mode NEW |
| Ask for missing details | `check-report-gaps.ts` + `capture-photo.ts` + `take-reading.ts` |
| Analyse images | NEW: `tools/analyse-photo.ts` (vision model) |

### 6.3 What's missing (SP-G scope, ~2 weeks build)

1. UI surface: bottom-sheet sidekick panel on inspection detail page (latest turn, suggested next action, push-to-talk, composer)
2. Prisma persistence: `TeacherSession` + `TeacherTurnRecord` models (append-only per rule 22)
3. 3 new tools: `lookup-iicrc.ts`, `method-recommendation.ts`, `analyse-photo.ts`
4. Voice mode: Web Speech API push-to-talk on mobile + browser; text fallback
5. Cost gating: wire `lib/live-teacher/_shared.ts` to subscription + credit (rules 8/9)
6. Audit log: every suggestion writes `AI_SIDEKICK_<action>` row
7. Storage hook: at job close, session transcripts mirror to BYOK Drive in the job folder

### 6.4 Why SP-G needs its own brainstorm

UI questions (drawer vs full-screen vs PiP), voice vs text mode trade-offs, prompt-engineering of new tools, offline behaviour, conversation-context limits, mobile vs desktop UX — each deserves clarifying questions.

---

## 7. SP-H — Knowledge substrate (Obsidian → RAG) — own brainstorm

### 7.1 What it is

A RAG layer that makes the existing 102-note Obsidian wiki + user-added restoration-domain notes queryable by every AI hook (Sidekick tools + Section 5 lifecycle hooks).

### 7.2 Architecture

| Component | Purpose |
|---|---|
| **Ingester** (CLI + scheduled) | Scans `~/2nd Brain/2nd Brain/Wiki/` + future RA-domain folder; chunks by heading; embeds via `text-embedding-3-small`; writes to vector store |
| **Vector store** | Supabase `pgvector` (already on Supabase — no new infra) |
| **Tags** | Frontmatter `ra-domain: true`, `iicrc: S500:2021 §7.1`, `category: water/cat-3` for retrieval filters |
| **Retrieval API** | `lib/knowledge/retrieve.ts` exporting `searchKnowledge(query, filters?, topK = 5)` |
| **Sync mode** | Incremental — file-mtime watch + manual `pnpm knowledge:ingest` for first bulk |
| **Audit** | Every retrieval writes `KnowledgeQuery` row |

### 7.3 Consumers

- Section 5 lifecycle hooks (`close-summary` retrieves similar past closures + IICRC §X.Y; `draft-invoice` retrieves scope-of-work templates)
- SP-G Sidekick tools (`lookup-iicrc`, `find-similar-jobs`, `method-recommendation`)
- Setup wizard hydration (richer state-by-state pricing defaults)

### 7.4 Privacy + multi-tenant

Platform-wide for v1 (single tenant). Schema reserves `tenantId` for per-tenant isolation later. Obsidian vault stays local; ingester is one-direction push (machine → Supabase pgvector). No read-back. Embeddings are product-internal; not subject to SP-E BYOK Drive mirroring.

### 7.5 Open questions for SP-H brainstorm

- Where ingester runs (dev machine? Vercel cron? self-hosted worker?)
- Chunking strategy (per heading vs paragraph vs semantic)
- Embedding cost ceiling
- Retrieval relevance threshold (when to refuse vs return)
- How RA-domain notes enter the wiki (user-written? AI-drafted-then-approved? imported from IICRC PDFs?)
- Re-embed on edit — full file or only changed chunks
- Per-tenant model in v2

---

## 8. SP-A — Job-close terminal state (the original centerpiece)

### 8.1 Status enum extension

```
DRAFT → IN_PROGRESS → SUBMITTED → IN_BILLING → COMPLETED
                                                ↑
                                  ARCHIVED (via SP-C re-open path, optional)
```

`IN_BILLING` is the new intermediate state set after sign-off + invoice generated but not yet PAID. `COMPLETED` is the terminal state SP-A actually writes.

### 8.2 The hybrid trigger surface

When `inspection.status === "IN_BILLING"` AND `invoice.status === "PAID"` AND `report.status === "SENT"` AND `inspection.handoverCompletedAt != null` (post-SP-J), the page renders a Sidekick-styled card with the AI-prepared close summary, "Close job" button, and "Not yet" dismiss.

### 8.3 New API route

`POST /api/inspections/[id]/close` — body `{ closeSummary: string }`.

Server logic (transactional):
1. `getServerSession` + role guard (USER who created OR ADMIN/MANAGER)
2. Re-check preconditions
3. `prisma.inspection.update` → `status: "COMPLETED"`, `completedAt: now()`, `closeSummary`
4. `prisma.auditLog.create` → action `JOB_CLOSED` with diff
5. Call `exportClosedJobToBYOKStorage(inspectionId)` (SP-E hook) — async, fire-and-forget (rule 13)
6. Return `{ inspection }`

### 8.4 Files

**New:** `app/api/inspections/[id]/close/route.ts`, `components/inspection/CloseJobPrompt.tsx`, `lib/lifecycle/inspection-state-machine.ts`, `lib/audit/lifecycle-event.ts`.
**Modified:** `prisma/schema.prisma` (status enum, `closeSummary: String?`, `completedAt: DateTime?`), `app/dashboard/inspections/[id]/page.tsx` (mount `<CloseJobPrompt>`), migration file (additive).

### 8.5 AI integration

`buildCloseSummary({ inspectionId, invoiceId })` from Section 5; renders inline editable; credit deduction at draft-build time; BYOK fallback respected; audit-log row `AI_GENERATED_CLOSE_SUMMARY`.

### 8.6 Tests

Vitest unit on state machine, `nextSuggestions`. Integration on POST happy path + 409 reject when preconditions unmet. E2E walks signup → … → close → asserts Completed tab visible.

---

## 9. SP-J — On-site handover package ($2B-grade deliverable) — own brainstorm

### 9.1 What it is

A single "Hand over to client" flow the tech triggers before leaving site. Composes existing scaffolding (portal + PDFs + change-orders + branding) into one moment producing:

1. Final Inspection Report (branded PDF, IICRC-cited via SP-H)
2. Scope of Works (branded PDF, with any approved on-site variations)
3. Estimate / Invoice (GST per rule 15, AI-drafted line items)
4. Variation / Change-order PDFs (if scope extended on-site)
5. Live client-portal account (pre-populated, accessible immediately)
6. Email/SMS to client (branded, with portal login link + PDFs attached)
7. Client signature (via existing `SignaturePad.tsx`)
8. Co-branded — when the client (insurer/PM) has their own brand, both logos appear

### 9.2 Existing scaffolding

| Requirement | Status |
|---|---|
| Client portal | [PASS] `app/portal/[token]/page.tsx` + `app/dashboard/clients/[id]/portal/page.tsx` + `PortalInvitePanel` |
| Report PDF | [PASS] `ExportPdfButton.tsx` + `lib/pdf-export.ts` + `lib/nir-report-generation.ts` |
| Scope of Works | [PASS] via `/api/inspections/[id]/scope-variations` |
| Estimate | [PASS] `/api/estimates/route.ts` |
| Change-orders / variations | [PASS] `/api/invoices/[id]/variations` |
| Invoice PDF | [PASS] `lib/invoices/pdf-generator.ts` |
| Bulk-export ZIP | [PASS] `bulk-export-zip` route |
| Org-branded documents | [PASS] `Organization.brandingDefaults` |
| **Single "hand over" moment** | [FAIL] — no UI bundles all of these |
| **Client co-brand** | [FAIL] — only org brand today |
| **Portal pre-populated + invite sent at sign-off** | [FAIL] |
| **On-site additional-scope billing UI** | [WARN] API exists; mobile form missing |

### 9.3 The handover screen (Sidekick-led)

Triggered by tech via Sidekick: "Generate handover package". Shows  Report,  Scope of Works,  Estimate, "Add variation" link, portal-invite target, co-brand picker, [Preview as client] + [Send + co-sign].

### 9.4 New components

`components/handover/HandoverPanel.tsx`, `CoBrandPicker.tsx`, `OnSiteVariationModal.tsx`, `ClientCoSignSheet.tsx`, `app/api/inspections/[id]/handover/route.ts` (single transactional POST), `lib/branding/co-brand-resolver.ts`.

### 9.5 Schema deltas

- `Client.brandLogoUrl` + `Client.brandPrimaryColor` (nullable — for co-brand)
- `Inspection.handoverCompletedAt: DateTime?` + `Inspection.handoverPackageStorageKey: String?`
- `ClientPortalAccount` model (clientId, inspectionId, accessToken, createdAt, lastAccessedAt)

### 9.6 How SP-J reshapes SP-A and SP-B

- **SP-A** preconditions add `handoverCompletedAt != null`.
- **SP-B** auto-progression scope shrinks — manual "generate invoice / send report / collect signature" steps collapse into the SP-J handover moment. Auto-progression's job shrinks to: detect client payment → prompt close.

### 9.7 Open questions for SP-J brainstorm

- Co-brand source — manual upload, or auto-derive from email domain (Allianz, IAG, QBE…)?
- Portal access — magic-link email or username/password?
- Offline handover (tech has no signal on site)
- E-sig legal weight — Electronic Transactions Act 1999 wording on screen
- SMS delivery — Twilio? CCW's existing pipeline?
- Payment-at-handover — Stripe Tap-to-Pay on phone?

---

## 10. Design principles (the north star)

### 10.1 No double-handling of administration

If a piece of admin work has been done anywhere (BYOK integration, wiki, prior inspection, public registry, OAuth profile, weather API, imported job), the system **pulls** it. The human never re-types data that's already known.

| Stage | What the system pulls |
|---|---|
| 1 Signup | Name, photo, email from Google OAuth [PASS] |
| 2 Setup | ABN → ABR (legal name, ACN, GST status, address) [PASS]. Logo + colours + about-copy from website [PASS]. Pricing by state [PASS]. |
| 3 Admin invites tech | When admin types an email → pull LinkedIn name/photo/role suggestion to pre-fill |
| 4 Tech accepts | Google profile [PASS]. Licence number from public registry (IICRC public, WHS Card scheme) |
| 5 Inspection start | If imported from ServiceM8/Ascora/Xero — job, customer, address, scope all pre-attached |
| 6 Capture | Weather at capture time+place (BoM/OpenMeteo). Property age from real-estate APIs. EXIF GPS [PASS]. Vision auto-tag [PASS] (Section 5). |
| 7 Sign-off | Tech's current Authorisation [PASS] |
| 8 Invoice | Pricing from `CompanyPricingConfig` [PASS]. Customer from imported job. Scope lines from AI draft. |
| 9 Close | Payment status from Stripe/Xero webhook — NOT a manual "mark as paid" |

**Anti-pattern flag:** anywhere in the audit you find a form field that could be pulled, it's a P0 gap.

### 10.2 We build the system; the business brings the infrastructure (BYOK)

RestoreAssist is the orchestrator. The tenant is the integrator. Setup wizard is the BYOK hub.

| BYOK domain | Status | Completed by |
|---|---|---|
| Storage | [WARN] half-built | Onboarding hotfix + SP-E |
| AI keys | [WARN] partial (OpenAI/Anthropic/Gemini fields exist; routing patchy) | SP-3 (existing brainstorm queue) |
| Email | [FAIL] no per-tenant Resend/SendGrid/SES | SP-6 (existing brainstorm queue) |
| SMS | [FAIL] no per-tenant Twilio/MessageBird | SP-K candidate |
| Accounting | [PASS] Xero/MYOB/QB/Ascora | Audit confirms BYOK story is clean |
| Calendar | [WARN] Google Calendar OAuth exists; full tenant-side check needed | Minor fix |
| Knowledge | [FAIL] no per-tenant wiki ingest | SP-H (platform v1, per-tenant v2) |
| Customer-data warehouse | [WARN] implicit (Supabase only) | covered by SP-E once Drive lands |

The setup wizard is the system's most important surface — it's a living BYOK dashboard, not a one-time wizard. Already partially this way via `/dashboard/settings/health`; this audit elevates it.

### 10.3 Implications for every SP

Each SP design must answer: (a) what does it pull? (b) what infra does it depend on? (c) what's the graceful-degradation path when tenant's BYOK isn't connected?

---

## 11. SP-B — Auto-progression chain (scope-reduced post-SP-J)

### 11.1 What it is

The state machine engine that detects external state changes (invoice PAID via Stripe/Xero webhook, report opened by client via portal) and surfaces "Ready to X?" prompts to advance the journey without human admin work.

### 11.2 Scope

- Webhook handlers for Stripe + Xero + MYOB + QuickBooks → flip `Invoice.status = PAID` automatically
- Lifecycle event bus: `lib/lifecycle/events.ts` emits `INVOICE_PAID`, `REPORT_OPENED`, `HANDOVER_COMPLETED`
- Subscribers in `lib/lifecycle/subscribers/` advance state machine and queue UI prompts
- One source of truth — the inspection detail page's "next action" card reads from `nextSuggestions(currentStatus, context)` (same helper SP-A uses)

### 11.3 What it does NOT do

- It does not auto-COMMIT state transitions to terminal states (close, archive). It SUGGESTS; the user confirms.
- It does not generate invoice content from scratch — that's SP-J (handover) + Section 5 (`draft-invoice.ts`).

### 11.4 Files

**New:** `lib/lifecycle/events.ts`, `lib/lifecycle/subscribers/{invoice-paid,report-opened,handover-completed}.ts`, webhook routes under `app/api/webhooks/{stripe,xero,myob,quickbooks}/route.ts` (extend existing if present).

---

## 12. SP-C — Completed tab + admin re-open

### 12.1 What it is

The retrieval/archive surface for closed jobs.

### 12.2 Scope

- New tab on `/dashboard/inspections` filtering `status === "COMPLETED"`, separate from active list
- Read-only render of inspection detail when status is COMPLETED
- Admin-only "Re-open this job" action → `POST /api/inspections/[id]/reopen` → status flips back to `IN_BILLING` (or `SUBMITTED`); writes `AuditLog` `JOB_REOPENED` with reason; the re-open form requires a free-text reason for compliance
- `smart-search.ts` from Section 5 wires here — search box on Completed tab does semantic + keyword

### 12.3 Files

**New:** `app/dashboard/inspections/completed/page.tsx`, `app/api/inspections/[id]/reopen/route.ts`, `components/inspection/ReopenJobModal.tsx`.
**Modified:** `app/dashboard/inspections/page.tsx` (tab nav).

---

## 13. Testing strategy

### 13.1 Unit (Vitest)
- State machine `canTransition` matrix
- `nextSuggestions` for each (status, context) tuple
- AI hook subscription-gate behaviour (TRIAL/ACTIVE/CANCELED → expected outcomes)
- Credit-deduction atomic semantics

### 13.2 Integration (Vitest + Prisma)
- POST `/api/inspections/[id]/close` happy path + reject paths
- POST `/api/inspections/[id]/handover` transactional integrity
- POST `/api/inspections/[id]/reopen` admin-only + audit-log row
- Webhook flow Stripe → Invoice.PAID → suggestion appears
- BYOK Drive provider dual-write idempotency

### 13.3 E2E (Playwright)
Full happy-path spec: signup → setup (with GDrive BYOK) → admin invites tech → tech accepts → inspection → photos via FAB → sign-off → handover → invoice paid (mock webhook) → close → Completed tab → admin re-open.

### 13.4 CI gates
`pnpm type-check` · `pnpm lint` · `npx vitest run` · `npx playwright test e2e/signin-to-close.spec.ts` · `npx prisma migrate diff = no drift` · visual snapshot diff = 0 on new surfaces.

### 13.5 Subscription regression
TRIAL user with 0 credits: AI hooks degrade to manual draft form (NOT error). Hotfix + SP-E + SP-A still function (no AI calls). Confirms platform doesn't become unusable mid-journey when credits run out.

### 13.6 Verification Gate (per `.claude/rules/verification-gate.md`)
Each SP ships with its own manual gate. The overall gate: end-to-end on staging using real Google OAuth, real Stripe test mode, real Supabase, with screenshots of: setup BYOK Drive connected · banner gone · FAB capture · sign-off · handover screen · client portal as the client sees it · close prompt · Completed tab.

---

## 14. Out-of-scope sub-projects (flagged for separate brainstorms)

### 14.1 SP-D — Evidence-capture expansion
Add video, LiDAR (RoomPlan/ARKit on iOS, web fallback), GeoMap pin view for photos with GPS. Substantial mobile UX work; brainstorm cycle should explore: voice annotations, AI room-shape extraction, multi-photo batch capture.

### 14.2 SP-F — Role-gate consolidation
Server-side enforcement of Junior Technician restrictions. Refactor `lib/auth/rbac.ts` + add transition-route guards. Compliance / regulatory risk reduction.

### 14.3 SP-K — SMS BYOK
Per-tenant Twilio / MessageBird credentials for handover SMS and customer reminders. May be folded into SP-6 (Email BYOK) as "Outbound BYOK" if scope permits.

---

## 15. Roadmap summary

| # | SP | Approx | Brainstorm? | Depends on |
|---|---|---|---|---|
| 1 | Onboarding hotfix (sub-project #1 patch) | ~2 days | No — direct fix | — |
| 2 | SP-E: Storage BYOK pipeline | ~1 week | No (designed here) | Hotfix |
| 3 | SP-H: Knowledge substrate | ~1 week build | Yes (own cycle) | — |
| 4 | SP-G: AI Sidekick surface | ~2 weeks build | Yes (own cycle) | SP-H |
| 5 | SP-J: On-site handover package | ~2 weeks build | Yes (own cycle) | SP-E + SP-G + Section 5 |
| 6 | SP-A: Job-close terminal state | ~3-4 days | No (designed here) | SP-J + SP-E + Section 5 |
| 7 | SP-B: Auto-progression (shrunk scope) | ~3 days | No (designed here) | SP-A |
| 8 | SP-C: Completed tab + admin re-open | ~3 days | No (designed here) | SP-A |
| 9 | SP-3: AI BYOK upgrades | already-queued | Yes (existing queue) | — |
| 10 | SP-6: Email BYOK | already-queued | Yes (existing queue) | — |
| ⏭ | SP-D, SP-F, SP-K | TBD | Yes (own cycles) | — |

**Critical path to close-the-loop:** Hotfix → SP-E → SP-H → SP-G → SP-J → SP-A → SP-B → SP-C. ~8 weeks if each is sequential; parallelisable where dependencies don't conflict.

---

## 16. Verification

After all in-scope sub-projects ship:

1. **Unit + integration tests pass** in CI for every SP
2. **Full E2E spec** `e2e/signin-to-close.spec.ts` green on sandbox
3. **GDrive BYOK end-to-end** verified — new tenant signs up, connects Drive, photos mirror, close-package lands in Drive
4. **Sidekick conversation** — tech-role session on staging captures a photo via voice command, asks "what's the IICRC method for cat-3 on engineered timber?", receives a citation-backed answer
5. **Handover package** — staging tradie completes a job, hands over to a test "client" account, that client receives email + portal access showing all 4 docs
6. **Close + reopen** — admin closes a job, then re-opens with reason → both audit-log rows present, status transitions correct
7. **No regressions** — existing sub-project #1 (setup), sub-project #2 (invited-tech), sub-project #7 (capture) all still pass their own E2Es

---

## 17. Out of scope (this audit)

- Marketing-site rewrites
- Billing-plan / pricing-tier changes
- Native mobile app feature work (PWA / Capacitor wraps the web app — that path stays as-is)
- Multi-region deploys (`AU` only for v1)
- Dispute / claims-defense workflows
- Sub-project #4 — platform-wide feature-health telemetry (cross-tenant sysadmin views)

---

## 18. DR/NRPG strategic context — RestoreAssist as the parent-business CRM

### 18.1 Positioning

RestoreAssist is not just a SaaS product the user sells to other tradies — it's the **CRM the user's own restoration business (Disaster Recovery / NRPG) will run on**. Every design decision in this audit must support:

- **User as tenant zero** — DR/NRPG is the first paying customer. Their workflow is the golden path; if the system isn't good enough for them, it isn't shippable.
- **DR/NRPG as upstream job source** — DR/NRPG dispatches jobs into RestoreAssist via the existing `DrNrpgIntegration` + webhook pipeline. Imported jobs pre-populate Stages 5 (inspection start) — customer, address, scope, claim reference, insurer name — eliminating Stage 5 double-handling entirely.
- **DR/NRPG as the productionised IICRC reference** — the restoration-domain notes added to the Obsidian wiki (SP-H) come from DR/NRPG's own job library, training materials, and IICRC-cited methodology. The user's expertise becomes the platform's expertise.

### 18.2 Existing DR/NRPG scaffolding

| Component | Status |
|---|---|
| `DrNrpgIntegration` Prisma model | [PASS] (apiKey, baseUrl, webhookSecret, isActive, lastSyncAt) |
| `DrNrpgJobSync` Prisma model | [PASS] (inspection ↔ DR/NRPG job link) |
| `/api/dr-nrpg/connect/route.ts` | [PASS] (connection setup) |
| `/api/webhooks/dr-nrpg/route.ts` | [PASS] (inbound jobs from DR/NRPG) |
| `/api/cron/dr-nrpg-liveness/route.ts` | [PASS] (health probe) |
| `lib/cron/dr-nrpg-liveness.ts` | [PASS] |

The integration ships; what's missing is the **job-import UX** that takes inbound DR/NRPG jobs and lands them as ready-to-inspect rows on `/dashboard/inspections`. This is implicit in Stage 5's P0 gap ("no Start inspection → Capture evidence CTA chain") and should be elevated to: "imported DR/NRPG jobs auto-populate the inspection list with one-tap 'Start' action."

### 18.3 Cross-cutting implications

**For Section 10.1 (no double-handling):** DR/NRPG-sourced jobs are the canonical example of data-pulling — the customer, address, scope, claim ref all arrive via webhook. The system must consume them, not re-ask.

**For Section 5 (AI lifecycle hooks):** When a job is imported with insurer = "Allianz" (or QBE, IAG, RACQ), the AI close-summary draft and the SP-J handover package can auto-select the insurer's brand tokens for co-branding (Section 9.3 picker defaults to detected insurer).

**For SP-E (storage BYOK):** DR/NRPG's tenant likely uses the same Google Drive as the user — the close-package folder structure becomes `<gdrive>/RestoreAssist/<DR-NRPG-job-id>-<inspection-id>/`. The folder convention should be tenant-configurable in setup.

**For SP-H (knowledge substrate):** Per-tenant-knowledge isolation matters now. DR/NRPG's wiki ingestion is the v1 platform tenant; v2 supports other RestoreAssist customers each with their own per-tenant vault.

### 18.4 New cross-cutting finding

**P0:** No surface today says "this inspection came from DR/NRPG" or shows the upstream job's claim reference / insurer / contact. Adding `Inspection.upstreamSource: "DR_NRPG" | "MANUAL" | "ASCORA" | …` + a small badge on inspection detail closes this. Scope is small (~half a day) and folds into SP-A (which already touches `Inspection` schema).

---

## 19. Post-approval handoff

After user reviews and approves this spec:

1. Invoke `superpowers:writing-plans` skill to produce an implementation plan for the **first shippable unit** — Onboarding hotfix (~2 days). That plan gets executed via SDD; subsequent SPs get their own plan cycles in dependency order.
2. SP-H, SP-G, SP-J each enter a separate brainstorm cycle before their plan is written.

No implementation actions are authorised before this approval gate clears.
