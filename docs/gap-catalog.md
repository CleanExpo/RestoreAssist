# RestoreAssist Gap Catalog
## Structured inventory of known gaps, priorities, and implementation status

**Source:** RA-164 [GAP-001] — compiled from CLAUDE.md milestone status, Linear backlog, and codebase audit
**Last updated:** 2026-03-31
**Format:** Gap ID · Title · Priority · Status · Blocked by

---

## Legend

| Priority | Meaning |
|----------|---------|
| P0 | Blocker — prevents production use |
| P1 | High — materially degrades user value |
| P2 | Medium — meaningful improvement |
| P3 | Low — nice to have |

| Status | Meaning |
|--------|---------|
| ✅ Done | Implemented and in a PR/merged |
| 🔶 In Review | PR open, awaiting merge |
| 🔵 In Progress | Active development |
| ⏸ Blocked | Requires human action or external dependency |
| ⬜ Open | Not started |

---

## Category 1: Infrastructure & Build

| Gap ID | Title | P | Status | Notes |
|--------|-------|---|--------|-------|
| INF-001 | Stripe lazy-init singleton — build failure at module eval | P0 | ✅ Done | Applied to all 9 branches (PR #25–#33) |
| INF-002 | pnpm lockfile out of sync with package.json | P0 | ✅ Done | `fabric ^6.9.1`, `lightningcss` synced (PR #33) |
| INF-003 | `@remotion/lambda` + `qrcode` missing from package.json | P0 | ✅ Done | Added to package.json (PR #30) |
| INF-004 | `DIRECT_URL` env var warning in Prisma migrate | P2 | ⏸ Blocked | Needs Vercel env var — human action |
| INF-005 | `NODE_TLS_REJECT_UNAUTHORIZED=0` for Ascora SSL | P1 | ⏸ Blocked | Needs Vercel env var — human action |
| INF-006 | `npx prisma migrate deploy` against prod DB | P1 | ⏸ Blocked | Human action — includes 8 pending migrations |
| INF-007 | `npx prisma generate` after migrate deploy | P1 | ⏸ Blocked | Follows INF-006 |

## Category 2: Authentication & Security

| Gap ID | Title | P | Status | Notes |
|--------|-------|---|--------|-------|
| AUTH-001 | Google OAuth credential verification | P1 | ⏸ Blocked | RA-247 — human login required |
| AUTH-002 | Social account creation (LinkedIn, YouTube, Instagram) | P0 | ⏸ Blocked | RA-4 — Phill human action |
| AUTH-003 | Supabase bucket `sketch-media` not created | P2 | ⏸ Blocked | RA-90 — SQL in `lib/sketch-storage.ts` header |

## Category 3: Core Platform (V2)

| Gap ID | Title | P | Status | Notes |
|--------|-------|---|--------|-------|
| CORE-001 | Fabric.js sketch tool (multi-floor, undo/redo, tools) | P1 | ✅ Done | M2 complete — RA-93–RA-101 |
| CORE-002 | Property data scraper (OnTheHouse) | P2 | ✅ Done | M3 complete — RA-102–RA-108 |
| CORE-003 | Moisture mapping SVG canvas | P1 | ✅ Done | M4 complete — RA-110–RA-113 |
| CORE-004 | Equipment calculator (IICRC S500 ratios) | P1 | ✅ Done | RA-260 integrated |
| CORE-005 | Scope narrative generator (Claude SSE streaming) | P1 | ✅ Done | RA-264, ANTHROPIC_API_KEY set in Vercel |
| CORE-006 | Drying goal validation (§11.4 EMC targets) | P1 | ✅ Done | RA-27 |
| CORE-007 | Sketch PNG/SVG export for Xactimate | P2 | ✅ Done | RA-122 |
| CORE-008 | PDF report generation | P1 | ✅ Done | RA-120, RA-121 |
| CORE-009 | E-signature capture | P2 | ✅ Done | Prisma model + migration |
| CORE-010 | `lossDescription` field on Inspection | P2 | ✅ Done | Schema + migration + PATCH endpoint + NIR form |

## Category 4: Integrations

| Gap ID | Title | P | Status | Notes |
|--------|-------|---|--------|-------|
| INT-001 | Ascora API sync (job import with price uplift) | P1 | ⏸ Blocked | INF-005 (TLS) needed; `/invoicedetails` endpoint missing — contact Ascora |
| INT-002 | DR-NRPG webhook inbound (job.dispatched events) | P1 | ✅ Done | HMAC-verified — RA-27 |
| INT-003 | Xero OAuth integration | P2 | ✅ Done | Write scopes + offline_access |
| INT-004 | Ascora line items via `/invoicedetails` | P2 | ⏸ Blocked | Correct endpoint unknown — contact Ascora support |

## Category 5: Mobile App

| Gap ID | Title | P | Status | Notes |
|--------|-------|---|--------|-------|
| MOB-001 | React Native field inspection capture | P1 | ✅ Done | 1,098 lines — RA-241 |
| MOB-002 | Offline SQLite sync queue | P1 | ✅ Done | 437 lines — RA-241 |
| MOB-003 | BYOK SecureStore API key management | P1 | ✅ Done | RA-241 |
| MOB-004 | Jobs + Reports screens with live data | P1 | ✅ Done | RA-241 |
| MOB-005 | Push notifications (calibration, approval) | P2 | ✅ Done | RA-241 |
| MOB-006 | EAS Project ID + Supabase env config | P0 | ⏸ Blocked | RA-246 — Phill human action |
| MOB-007 | TestFlight internal testing | P1 | ⏸ Blocked | Follows MOB-006 |
| MOB-008 | App Store + Google Play submission | P1 | ⏸ Blocked | Follows MOB-007 |
| MOB-009 | Bluetooth moisture meter BLE integration | P3 | ⬜ Open | V2 feature — post-launch |
| MOB-010 | Photo OCR for meter readings | P3 | ⬜ Open | V2 feature — post-launch |

## Category 6: AI Lab / Autoresearch

| Gap ID | Title | P | Status | Notes |
|--------|-------|---|--------|-------|
| AI-001 | Scope quality evaluator (0–100 deterministic scorer) | P2 | ✅ Done | 28/28 tests passing — PR #33 |
| AI-002 | Evaluation harness (batch against test cases) | P2 | ✅ Done | PR #33 |
| AI-003 | Prompt variant DB (PromptVariant + EvaluationRun) | P2 | ✅ Done | Prisma models + migration — PR #33 |
| AI-004 | Prompt optimizer loop (meta-Claude edits prompts) | P2 | ✅ Done | PR #33 |
| AI-005 | Admin evaluation UI (`/api/admin/evaluation`) | P2 | ✅ Done | PR #33 |
| AI-006 | Content automation pipeline (Claude→ElevenLabs→HeyGen) | P3 | 🔶 In Review | PR #34 — RA-158 |

## Category 7: Support & Operations

| Gap ID | Title | P | Status | Notes |
|--------|-------|---|--------|-------|
| SUP-001 | Customer support ticket system with Claude drafts | P2 | 🔶 In Review | PR #35 — RA-163 |
| SUP-002 | Mobile app status dashboard + beta signup | P2 | 🔶 In Review | PR #36 — RA-162 |

## Category 8: Content & Marketing

| Gap ID | Title | P | Status | Notes |
|--------|-------|---|--------|-------|
| CNT-001 | YouTube platform hypothesis test (3 videos) | P1 | 🔶 In Review | PR #37 — RA-295 (scripts ready, Phill records) |
| CNT-002 | 90-day YouTube curriculum structure + CPD mapping | P2 | 🔶 In Review | PR #38 — RA-297 |
| CNT-003 | RIA 2026 Conference attendance plan + demo prep | P3 | 🔶 In Review | PR #39 — RA-296 |
| CNT-004 | CARSI/NRPG CPD endorsement partnership | P2 | ⬜ Open | Blocked on CNT-001 audience validation |
| CNT-005 | LMS build (CPD certificate platform) | P2 | ⬜ Open | Month 6 target — after YouTube validates |

## Category 9: Business Configuration

| Gap ID | Title | P | Status | Notes |
|--------|-------|---|--------|-------|
| BIZ-001 | Multi-business profile data scoping | P2 | ✅ Done | BusinessProfile model — PR #32 |
| BIZ-002 | Stripe checkout + subscription flows | P1 | ✅ Done | RA-12 — session_id, webhook secret |
| BIZ-003 | Contractor insurance + licence tracking | P2 | ✅ Done | RA-77 — ContractorInsurance + ContractorLicence |
| BIZ-004 | WHS incident + corrective action tracking | P2 | ✅ Done | RA-80 — WHSIncident + WHSCorrectiveAction |

---

## Summary Counts

| Category | Total Gaps | Done | In Review | Blocked | Open |
|----------|-----------|------|-----------|---------|------|
| Infrastructure | 7 | 3 | 0 | 4 | 0 |
| Auth & Security | 3 | 0 | 0 | 3 | 0 |
| Core Platform | 10 | 10 | 0 | 0 | 0 |
| Integrations | 4 | 2 | 0 | 2 | 0 |
| Mobile App | 10 | 5 | 0 | 3 | 2 |
| AI Lab | 6 | 5 | 1 | 0 | 0 |
| Support & Ops | 2 | 0 | 2 | 0 | 0 |
| Content & Marketing | 5 | 0 | 3 | 0 | 2 |
| Business Config | 4 | 4 | 0 | 0 | 0 |
| **Total** | **51** | **29** | **6** | **12** | **4** |

**57% Done · 12% In Review · 24% Blocked (human action) · 8% Open**

---

## Critical Path to Production Launch

1. **INF-006** — Run `npx prisma migrate deploy` (human)
2. **INF-005** — Set `NODE_TLS_REJECT_UNAUTHORIZED=0` in Vercel (human)
3. **MOB-006** — Configure EAS + Supabase env (human) → unblocks MOB-007, MOB-008
4. **AUTH-002** — Create social accounts (human) → unblocks CNT-001

All P0/P1 code gaps are resolved. All remaining blockers are human actions.
