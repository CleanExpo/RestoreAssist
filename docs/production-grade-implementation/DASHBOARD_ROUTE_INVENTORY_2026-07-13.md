# Dashboard route inventory — 2026-07-13

**Scope:** all `app/dashboard/**/page.tsx` (139 routes).  
**Method:** code audit (fetch targets, MOCK_/Coming Soon, silent `!res.ok`, toast-only stubs, missing APIs).  
**Still deferred:** iCloud (requires Apple CloudKit — no public upload API).

## Wave verification

| Wave | Status | Notes |
|------|--------|-------|
| 1 Trust & honesty | **PASS** | Mocks removed; WHS APIs live; export/mobile CTAs honest |
| 2 Core job loop | **PASS** | Load/error/rollback/toast fixes on reports, invoices, field, inspections |
| 3 Claim-type evidence | **PASS** | Locked NIR panel; water-only moisture; mould/fire schema-aligned |
| 4 BYOK + ZIP | **PASS** | OpenAI/Gemini via ProviderConnection; real `application/zip` |
| 5 LoadError + Retry banners | **PASS** | Schedule, contractors profile/reviews, sync-history, claims-analysis, interview, admin (users/stats/workflows/cron/blocked), clients, cost-libraries; PARTIAL batch closed |
| 6 Deferred closure | **PASS** | Word DOCX export; admin RAG ops; Resend email BYOK; OneDrive (env-gated); portal content hub. iCloud remains DEFER |

## Totals

| Status | Count |
|--------|------:|
| PASS | ~100 |
| FAIL (pre-fix) | 2 → **0 hard FAILs after this pass** |
| PARTIAL | ~31 → ~24 after P1 batch → **closed in Wave 5** |
| DEFER | iCloud only (Apple CloudKit) |

## FAIL (must fix)

| Route | Issue | Priority | Status |
|-------|-------|----------|--------|
| `/dashboard/contractors/equipment` | UI calls missing equipment API | P0 | **FIXED** — honest unavailable page |
| `/dashboard/team/[id]` | Invite always succeeds; profile save local-only | P0 | **FIXED** — role PATCH + invite CTA → Team page |

## PARTIAL (P1 batch in this pass)

| Route | Issue | Status |
|-------|-------|--------|
| `/dashboard/subscription` | Check CTA → missing `/api/subscription/check` | **FIXED** — uses `GET ?refresh=true` |
| `/dashboard/restoration-documents` | Silent fail looks like empty list | **FIXED** |
| `/dashboard/margot` | Fake recent-thread stub | **FIXED** |
| `/dashboard/inspections/[id]/sketch-preview` | Silent meta load failure | **FIXED** |
| `/dashboard/inspections/[id]/contents` | Silent load failure | **FIXED** |
| `/dashboard/invoices/credit-notes` | Silent empty on error | **FIXED** |

Fixes from this inventory land in follow-up commits on the same branch.


## Post-fix summary (this engagement)

Hard FAILs from the inventory are closed. Wave 5 closed the remaining PARTIAL
batch of missing loadError + Retry banners on admin/contractor list pages
(sync-history, claims-analysis latest, interview view-only, admin surfaces,
clients, cost-libraries).
