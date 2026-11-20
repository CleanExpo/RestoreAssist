# W4-3 — Xactimate / ESX (partner-only)

**Status:** Not shipped in-product. RestoreAssist does **not** emit ESX or Xactimate import files.

## What we ship instead

- Machine-readable **claims** export: `lib/export/claims-contract.ts` + `GET /api/inspections/[id]/guidewire`
- **Scope JSON** contract: `lib/export/scope-contract.ts` via sketch scope export
- **Adjuster scope CSV** (Wave 4): `GET /api/reports/[id]/export-scope-csv`

## Partner path

1. Signed partner agreement (Verisk / Cotality ANZ channel).
2. Map `ScopeItem` + `CostEstimate` rows to partner SKU catalog (separate project).
3. List on partner marketplace only after legal + field validation.

## Sales line

> “We deliver insurer-ready JSON, Guidewire-shaped payloads, and adjuster CSV today. Xactimate/ESX is a partner integration — not a self-serve checkbox.”