# V1 Phase 6 — Release readiness (P6-2)

Implementation-complete for Phases 3–6 is **not** the same as production release. Before any prod cutover:

## Evidence checklist

1. **P6-1** — `e2e/v1-reference-claim.spec.ts` (`@v1-exit`) green in CI with `ALLOW_TEST_HELPERS=true` and ephemeral Postgres (see `.github/workflows/sketch-e2e.yml`). Covers Owner/Manager/Technician/Customer portal, plus API path: equipment matrix, SWMS, disposal authority, estimate approval, sign-off, invoice, EFT payment, Xero reconciliation marker (`POST /api/test/v1-reference-claim/finalize-exit`), and job close.
2. **Migrations** — `20261012180000_v1_phase3_canonical_spine` applied on staging + prod with rollback plan.
3. **P3 backfill** — dry-run counts reviewed; ambiguous client pairs manually triaged.
4. **Security** — field-assist and completeness inbox enforce session tenancy; appointments POST/PATCH role boundaries verified.
5. **BYOK** — field assist returns 412 without workspace Anthropic key (no platform-key fallback).

## Founder gate (D-018)

- Security review sign-off
- Migration + rollback runbook acknowledged
- Controlled release decision recorded

## Known non-blockers (full §39)

The complete §39 scenario (Xero reconciliation, all five roles, full equipment lifecycle) remains the long-running V1 exit gate; this phase delivers the **spine + Margot/completeness + scheduling + seeded subset** with named automated evidence.
