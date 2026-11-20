# RestoreAssist — Full Functionality Program

**Owner:** Engineering (Rana + Phil)  
**Created:** 2026-11-19  
**Source:** CTO roadmap assessment (Phil) + RA-8184 journey audit

This document is the **execution tracker** for making RestoreAssist a complete, trustworthy restoration platform. Update checkboxes as epics merge.

---

## Wave 0 — Foundations (complete)

| ID | Deliverable | Status | Verification |
|----|-------------|--------|----------------|
| W0-1 | Map all 10 Prisma `ClaimType` values → `JobType` workflow keys | ✅ | `lib/evidence/__tests__/claim-type.test.ts` |
| W0-2 | HVAC + CARPET workflow templates | ✅ | `getWorkflowTemplate("HVAC")` / `"CARPET"` |
| W0-3 | ODOUR stamps `Inspection.claimType = ODOUR` (not FIRE) | ✅ | `stampClaimType` on fire-smoke + NIR panel |
| W0-4 | ASBESTOS stamps `Inspection.claimType = ASBESTOS` on compliance save | ✅ | australian-compliance POST |
| W0-5 | Integration health: zero connected = unverified token check | ✅ | `Token Validity` check in health route |
| W0-6 | Auto-init guided workflow when claim type is stamped | ✅ | `ensureInspectionWorkflowFromClaimType` on all NIR POST routes |

---

## Wave 1 — Trust layer (RA-8184) — complete (W1-5 = staging script + manual checklist)

| ID | Deliverable | Status | Verification |
|----|-------------|--------|----------------|
| W1-1 | Evidence completeness uses authoritative rows (moisture, psych) | ✅ | `submission-gate` + supplementary counts |
| W1-2 | Capture-time metadata (not sync time) on photos/readings | ✅ | `parseFieldCaptureTime` on photo/moisture/env POST |
| W1-3 | Manager approval before client/insurer send | ✅ | `USER` → 403 on `POST /api/reports/[id]/send` |
| W1-4 | Submit honest when AI pipeline fails (S4-6) | ✅ | `processingComplete` + audit warning |
| W1-5 | Staging demo org + five-stage journey retest | ✅ | `scripts/w1-5-staging-journey.sh` (runbook in stacked PR) |

---

## Wave 2 — Field UX differentiation — complete

| ID | Deliverable | Status | Verification |
|----|-------------|--------|----------------|
| W2-1 | Technician Pathway panel (`compose-pathway` → UI) | ✅ | `GET …/pathway` + `ClaimPathwayPanel` on job hub |
| W2-2 | Manager drying dashboard (psych + equipment trend) | ✅ | `GET …/drying-snapshot` + `DryingSnapshotPanel` |
| W2-3 | Handoff package (PDF + photo index + JSON zip) | ✅ | Existing `HandoverPackagePanel` + `POST …/handover` |
| W2-4 | Before-you-leave panel on all claim types | ✅ | `FieldEvidenceChecklistPanel` on job hub + capture |

---

## Wave 3 — Connectors (pilot-gated) — complete (W3-1 pilot receipt = manual sign-off)

| ID | Deliverable | Status | Verification |
|----|-------------|--------|----------------|
| W3-1 | Xero golden path documented + one pilot customer | ✅ | Pilot runbook (stacked PR); receipt pending |
| W3-2 | Ascora migration runbook (honest “import not live CRM”) | ✅ | Stacked PR runbook |
| W3-3 | Enable **one** of ServiceM8 / QBO after pilot sync | ✅ | `NEXT_PUBLIC_*_ENABLED` + stacked PR flags doc |
| W3-4 | OneDrive mirror ship (RA-8078) | ✅ | Catalog on when `MICROSOFT_*` set + token refresh |
| W3-5 | OAuth health live probe (optional ping) | ✅ | `oauth-live-probe.ts` → Integrations health |

---

## Wave 4 — Market parity (demand-led) — complete (Zapier marketplace = post-pilot)

| ID | Deliverable | Status | Verification |
|----|-------------|--------|----------------|
| W4-1 | Scope CSV / adjuster-friendly export | ✅ | `GET …/export-scope-csv` + report package tab |
| W4-2 | Job margin view (labour + equip + invoice) | ✅ | `JobMarginPanel` + `GET …/job-margin` |
| W4-3 | Xactimate / ESX — partner only | ✅ | Stacked PR partner note (no ESX ship) |
| W4-4 | Zapier app (jobs, clients, inspection status) | ✅ | `/api/automation/v1/*` + stacked PR automation doc |

---

## Wave 5 — Operations excellence — complete

| ID | Deliverable | Status | Verification |
|----|-------------|--------|----------------|
| W5-1 | RA-8184 stall metrics (blocker + ageing summary) | ✅ | `inbox-stall-summary` + inbox API `summary` |
| W5-2 | Integration failure visibility in ops hub | ✅ | `program-status` + links to sync-errors/health |
| W5-3 | Program status API for leadership | ✅ | `GET /api/operations/program-status` |
| W5-4 | Operations smoke script | ✅ | `scripts/wave-5-operations-smoke.sh` |
| W5-5 | Scale / SLO load harness | ✅ | `scripts/slo-load-harness.ts` + stacked PR harness doc |

---

## Wave 6 — Production readiness — in progress

| ID | Deliverable | Status | Verification |
|----|-------------|--------|----------------|
| W6-1 | Org audit trail CSV export | ✅ | `GET /api/operations/audit-export` + `audit-export-csv` |
| W6-2 | SLO targets on program-status + ops panel | ✅ | `slo.targets` / `slo.lastRun` in program-status |
| W6-3 | Invoice send rate limit | ✅ | `applyRateLimit` on `POST …/invoices/[id]/send` |
| W6-4 | RLS + strict build gate (roadmap) | ⬜ | See `docs/production-grade-implementation/IMPLEMENTATION_ROADMAP.md` phase 6 |
| W6-5 | Wave program verify + API hardening | ✅ | `scripts/wave-program-verify.sh` (88 tests) |

---

## How Phil reads progress

1. **This file** — wave checkboxes.  
2. **Linear** — epics tagged `wave-0` … `wave-6`.  
3. **RA-8184 stall map** — `GET /api/operations/program-status` (stall metrics runbook in stacked PR).  
4. **Completeness inbox** — ageing jobs by blocker type (`summary.byBlocker` / `byAge`).

---

## Architecture note

Claim-type normalisation lives in `lib/evidence/claim-type.ts` — single boundary for completeness, field-evidence audit, insurer profiles, and pathway engine.