# Task Brief

[HIGH] M3 — Scope Engine: Mould remediation deterministic pathway (IICRC S520)

Description:

## Objective

Build the S520 deterministic scope engine for mould remediation jobs. Currently only `mouldRemediationTreatmentRate` exists — no structured scope, no IICRC references beyond what AI generates.

## IICRC S520 Scope Categories

### Containment

- Containment barrier erection (polyethylene sheeting) — S520:2015 §7.3
- Negative air pressure establishment — S520:2015 §7.4
- Decontamination chamber setup — S520:2015 §7.5

### Remediation

- HEPA vacuuming of mould-affected surfaces — S520:2015 §8.2
- Damp wipe with antimicrobial solution — S520:2015 §8.3
- Structural drying (if moisture source unresolved) — S500:2025 §7.1
- Mould-affected material removal (drywall, insulation) — S520:2015 §9.1
- Encapsulation (if full removal not practical) — S520:2015 §9.3

### Air treatment

- HEPA air filtration during work — S520:2015 §8.4
- Post-remediation clearance test — S520:2015 §12.1 (subcontractor pass-through)

### Waste

- Bagged mould-contaminated material disposal — S520:2015 §11.2

## Input parameters

- `mouldAffectedArea` (m²)
- `mouldSeverity`: Class 1 / 2 / 3 (light surface / penetrating / widespread)
- `materialsToRemove`: boolean
- `moistureSourceActive`: boolean

## Equipment ratios (S520)

- Negative air machine: 1 per 50m²
- HEPA vacuum: 1 per 75m²
- AFD: 1 per 100m²

## Files

- `lib/nir-scope-determination.ts` — add `determineMouldScopeItems()`
- `lib/iicrc-checklists.ts` — expand mould template to full S520 coverage
- `lib/equipment-calculator.ts` — add mould equipment ratios

## Acceptance criteria

- Mould inspection generates containment → remediation → clearance scope sequence
- Every item has S520 clause reference
- Negative air machine quantity appears in scope (currently missing from equipment calc)
- Pass-through clearance test uses `taxType: INPUT`

Linear ticket: RA-852 — https://linear.app/unite-group/issue/RA-852/m3-scope-engine-mould-remediation-deterministic-pathway-iicrc-s520
Triggered automatically by Pi-CEO autonomous poller.

## Session: 91b9d7f7766c
