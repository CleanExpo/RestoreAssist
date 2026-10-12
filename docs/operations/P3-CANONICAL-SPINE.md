# V1 Phase 3 — Canonical data spine (operations)

## Scope

- **P3-1** `Inspection.reportId` FK — list/filter by report; no address-string join in `GET /api/inspections?reportId=`.
- **P3-2** `Inspection.clientId` — invoice resolver + canonical PATCH + backfill script.
- **P3-3** `insurerProfileId`, `insurerTemplateId`, `claimNumber` on `Inspection`.
- **P3-4** `ScopeItem.sketchRoomId` validated against job sketch rooms; metrics helper in `lib/sketch/room-derived-metrics.ts`.
- **P3-5** Field ownership documented in `lib/reports/canonical-field-owners.ts`; PDF moisture from relational rows.

## Backfill

```bash
npx tsx scripts/backfill/p3-canonical-spine.ts --dry-run
npx tsx scripts/backfill/p3-canonical-spine.ts
```

## Migration

`prisma/migrations/20261012180000_v1_phase3_canonical_spine`

Apply with your standard `db:migrate:local` / deploy pipeline when Postgres is available.

## Verification

- Unit: `lib/canonical/__tests__`, `lib/sketch/__tests__/room-derived-metrics.test.ts`
- E2E: `e2e/v1-reference-claim.spec.ts` (with `ALLOW_TEST_HELPERS=true`)
