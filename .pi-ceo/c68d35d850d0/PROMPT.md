# Task Brief

[HIGH] scope-storm.ts — storm damage scope pathway

Description:

## Overview

Create `lib/scope-storm.ts` — deterministic scope generation for storm damage jobs. Storm jobs combine structural water intrusion + potential contamination + debris removal. Currently no storm-specific scope is generated.

## File to create

`lib/scope-storm.ts`

## Scope logic

Storm damage is categorised by entry point (roof, window, below-grade, stormwater):

| Entry Type         | Additional Items                                         |
| ------------------ | -------------------------------------------------------- |
| Roof penetration   | Temporary weatherproof covering, structural inspection   |
| Stormwater ingress | Category 3 water treatment + sanitation (S500:2025 §6.3) |
| Wind-driven rain   | Structural dry-out                                       |
| Flash flooding     | Category 3 protocol, mud/silt removal                    |

Base items always included:

- Water extraction
- Structural drying
- Moisture mapping
- Debris removal

## IICRC reference

- S500:2025 §3.1 — Water category classification
- S500:2025 §6.3 — Category 3 (grossly contaminated) treatment
- Building code references via `lib/nir-building-codes.ts`

## Interface

```ts
export function generateStormScope(params: {
  entryType: StormEntryType;
  waterCategory: 1 | 2 | 3;
  affectedAreaM2: number;
  estimatedDays: number;
  pricingConfig: CompanyPricingRates;
}): ScopeItemDraft[];
```

## Acceptance criteria

- Category 3 water always adds sanitation line items
- Flash flood adds mud/silt removal
- Base items always present regardless of entry type
- pnpm type-check passes

Linear ticket: RA-865 — https://linear.app/unite-group/issue/RA-865/scope-stormts-storm-damage-scope-pathway
Triggered automatically by Pi-CEO autonomous poller.

## Session: c68d35d850d0
