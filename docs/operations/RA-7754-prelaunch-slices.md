# RA-7754 — Prelaunch bundle (shippable slices)

Parent: [RA-7754](https://linear.app/unite-group/issue/RA-7754). Code merged via CleanExpo/RestoreAssist#2319; production migrations tracked on RA-7652 / activity on RA-7754.

Run local verification:

```bash
npm run script:verify-ra-7754
```

## Slice 1 — D-021 Cross-firm invoice links (tenancy)

**Outcome:** Cannot attach another business’s client, report, or estimate to an invoice; GET must not leak foreign PII.

| Area | Location |
|------|----------|
| Link gate | `lib/auth/assert-tenancy.ts` → `canLinkRecord` |
| Invoice create | `app/api/invoices/route.ts` |
| Recurring templates | `app/api/invoices/recurring/route.ts` |
| Report create client link | `app/api/reports/route.ts` |

**Proof:** `app/api/invoices/__tests__/prelaunch-tenancy-numbering.integration.test.ts` (D-021 cases), `app/api/invoices/__tests__/technician-money-gate.test.ts`.

## Slice 2 — D-022 Per-business invoice numbers

**Outcome:** Two businesses can both hold `RA-{year}-0001`; no platform-wide unique collision.

| Area | Location |
|------|----------|
| Schema / sequence | `prisma/schema.prisma` (invoice numbering comments) |
| Migration | `prisma/migrations/20260926090000_d022_invoice_number_unique_per_owner/` |

**Proof:** D-022 section in `prelaunch-tenancy-numbering.integration.test.ts`.

## Slice 3 — D-025 Concurrent invoice edits

**Outcome:** PUT replaces line items atomically; row lock prevents merged line sets / wrong totals.

| Area | Location |
|------|----------|
| Invoice PUT | `app/api/invoices/[id]/route.ts` (row lock before line replace) |

**Proof:** D-025 section in `prelaunch-tenancy-numbering.integration.test.ts` (uses `pg_stat_activity` when `DATABASE_URL` set).

## Slice 4 — D-030 Scope regenerate preserves technician rows

**Outcome:** Regenerate deletes only `source = ai_generate_scope`; manual / calculator rows remain.

| Area | Location |
|------|----------|
| AI marker | `app/api/inspections/[id]/generate-scope/route.ts` → `AI_SCOPE_SOURCE` |
| Equipment calculator | `app/api/inspections/[id]/equipment-calculator/route.ts` |
| Migration | `prisma/migrations/20260926090100_d030_scope_item_source/` |

**Proof:** `app/api/inspections/[id]/generate-scope/__tests__/regenerate-keeps-manual-items.integration.test.ts`.

## Close RA-7754 when

1. `npm run script:verify-ra-7754` passes on `main`.
2. Production migration ledger matches main (both migrations applied) — owner-gated; see RA-7754 Linear activity (Oct 2026).
3. Owner smoke: `/dashboard/inspections` → 200, no Prisma P2022 on `ScopeItem.source`.
