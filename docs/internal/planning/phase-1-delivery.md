# Phase 1 delivery — alignment with founder plan (Oct 2026)

**Direction:** RestoreAssist as a **connected CRM** — each job on a **client record**, field data flowing back reliably.

**Process:** All changes via **pull request → CI → founder merge** (`main` deploys production). See `CLAUDE.md`.

---

## Shipped via PR (merged to `main`)

| PR | Branch | Merged focus |
| --- | --- | --- |
| **#2447** | `phase-1/ra-8043-tenancy` | RA-8043c/d — platform admin gates, firm-scoped claims board, Drive claims staff-only |
| **#2448** | `phase-1/indooroopilly-attendance` | Attendance helpers; job list/header/portal shell — no `createdAt` as attendance |
| **#2449** | `phase-1/offline-field-docs` | Field offline copy + `/offline` link; this doc + Indooroopilly checklist |

**Also on `main` (post Phase 1 PRs):** RA-8043e claims batch source (#2450), RA-7656 sketch empty-save (#2456), P1-MNY-01 Stripe Connect (#2454), and related billing/claims hardening.

---

## Priority map

| # | Founder priority | Status on `main` | Verification |
| --- | --- | --- | --- |
| 1 | **Indooroopilly** — moisture, invented date, frontend | **#2448 merged**; **round-2** on branch `feat/phase1-attendance-hardening-round2` (awaiting founder merge to `origin/main`) | Golden DB test + checklist |
| 2 | **Firm isolation** (RA-8043) | **#2447 + #2444 + #2450** | `ra-8043c-platform-gates`, `ra-8043d-drive-gates`, batch source integration test |
| 3 | **Offline capture** | **UX merged** (#2449); device proof pending | Airplane-mode script; `lib/offline/*` |

---

## Round 2 — attendance hardening (PR pending)

Branch: **`feat/phase1-attendance-hardening-round2`** → open/compare PR → CI green → founder merge.

Closes **createdAt-as-attendance** leaks after #2448:

- `GET /api/portal/[token]` public `inspectionDate`  
- Token + JWT client PDF `attendanceDate`  
- Job **print** view + list **date filter**  
- Staff **export PDF** header + team member recent-jobs row  

Regression: `phase1-attendance-display-regression.test.ts`, `consumer-report-attendance.test.ts`, portal PDF/download route tests.

---

## Indooroopilly — definition of done

- [x] Dashboard list/header attendance display (#2448)
- [ ] Golden integration test green on CI DB
- [ ] Round-2 merged on **`origin/main`** (PR + CI; not local-only)
- [ ] Founder trace on sanitised prod/staging IDs
- [ ] iPhone photo attach re-test (`escaped-defects.md` 2026-10-02)

---

## RA-8043 — definition of done

- [x] RA-8043c/d on main (#2447, #2444)
- [x] RA-8043e batch source (#2450)
- [ ] Reconcile Mac Mini `feat/claim-intake-core` when published — no duplicate tenancy logic

---

## Recommended PR order (ongoing)

1. Tenancy / security (8043*)  
2. Attendance / Indooroopilly UI + APIs  
3. Offline UX + docs  
4. Moisture trace + device evidence (separate PR once IDs available)
