# Task Brief

[HIGH] M3 — Scope Engine: Fire/smoke deterministic pathway (IICRC S700)

Description:

## Objective

Build a deterministic scope generation engine for fire and smoke damage jobs, equivalent to what exists for water damage. Currently fire jobs use AI narrative only — no IICRC references, no structured scope items, no costed line items.

## IICRC S700 Scope Categories to implement

### Structural fire/smoke

- Smoke odour treatment (ozone/hydroxyl) — S700 §6.3
- Soot removal — dry ice blasting / chemical sponge — S700 §6.1
- HEPA vacuuming of surfaces — S700 §6.2
- Encapsulation of smoke-affected surfaces — S700 §6.4
- Thermal fogging — S700 §7.2
- Structural drying if water present (fire suppression) — S500:2025 §7.1

### Contents

- Gross debris removal — S700 §5.2
- Contents inventory / pack-out — S760 §4.1
- Ozone chamber treatment for salvageable items — S700 §8.1

### Air quality

- Air filtration device deployment — S700 §9.1
- Clearance air quality test (subcontractor pass-through) — S700 §10.2

## Input parameters (from inspection)

- `affectedArea` (m²)
- `smokeCategory`: light / medium / heavy
- `waterPresent`: boolean (fire suppression water)
- `contentsAffected`: boolean

## Output: structured ScopeItem rows

Each item should have:

- `itemType`, `description`, `quantity`, `unit`
- `suggestedRate` from CostDatabase
- `xeroAccountCode` from XeroAccountCodeMapping
- `justification` citing S700 clause

## Equipment requirements

- Ozone generator: 1 per 200m² (S700 ratio)
- Hydroxyl unit: 1 per 150m²
- HEPA vacuum: 1 per 100m²
- AFD: 1 per 150m²

## Files

- `lib/nir-scope-determination.ts` — add `determineFireSmokeScopeItems()`
- `lib/iicrc-checklists.ts` — add S700 checklist template
- `lib/equipment-calculator.ts` — add fire equipment ratios

## Acceptance criteria

- Fire inspection with `claimType: fire_smoke` generates structured scope
- Every item has S700 clause reference
- Equipment quantities calculated from affected area
- Rates populated from CostDatabase

Linear ticket: RA-851 — https://linear.app/unite-group/issue/RA-851/m3-scope-engine-firesmoke-deterministic-pathway-iicrc-s700
Triggered automatically by Pi-CEO autonomous poller.

## Session: 10af68d04c23
