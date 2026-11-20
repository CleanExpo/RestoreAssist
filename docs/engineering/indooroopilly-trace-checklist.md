# Indooroopilly trace checklist (Phase 1)

Founder priority **#1** (Oct 2026): trace **lost moisture readings**, **invented attendance dates**, and **frontend mismatches** after field capture.

Use this when reproducing issues. No live customer PII in tickets — use synthetic golden tests for CI. Delivery process: **`docs/internal/planning/phase-1-delivery.md`** (PR-only merges).

## Automated replay (required before merge)

```bash
npm run test:db -- app/api/inspections/__tests__/indooroopilly.golden.integration.test.ts
npm run test:db -- app/api/inspections/__tests__/route.report-linked.scenarios.integration.test.ts
npm run test:unit -- lib/inspections/__tests__/format-attendance-date.test.ts
npm run test:unit -- lib/inspections/__tests__/phase1-attendance-display-regression.test.ts
npm run test:unit -- components/__tests__/NIRTechnicianInputForm.draft-base-ids.b23.test.tsx
```

Golden case asserts: linked inspection (no duplicate), **no invented attendance date**, MC 11.8 / 13.9 % persist, RH stays environmental, NIR draft `baseIds` keep 13.9 %.

## UI rules (regression)

| Surface | Rule |
| --- | --- |
| Job list / job header | Show `inspectionDate` or **Attendance not recorded** — never `createdAt` as attendance |
| Job list date filter | Filter on `inspectionDate` only; jobs without attendance excluded when range set |
| Job print view | Same attendance rule as list/header |
| Client portal job shell | Only show date when `inspectionDate` is set |
| `GET /api/portal/[token]` | Public `inspectionDate` = DB field, not `createdAt` |
| Client PDF (token + JWT) | **Site attendance:** recorded date or **Not recorded** |
| Field dashboard | Uses `inspectionDate` or “Attendance unknown” |
| Staff export PDF (`lib/pdf-export.ts`) | Header date from `inspectionDate` or **Attendance not recorded** |
| Team member recent jobs | Same as job list row |

## Production trace (founder / support)

1. Identify report + linked inspection IDs (sanitised).
2. DB: moisture rows for inspection — locations, values, `sketchRoomId`.
3. API: `GET /api/inspections/[id]` as owner — compare to dashboard.
4. Device: iPhone library + camera upload with same-job GET readback (see `docs/engineering/escaped-defects.md` 2026-10-02).

## Escaped defect reference

Photo attach / HEIC / false success: `docs/engineering/escaped-defects.md` (2026-10-02).
