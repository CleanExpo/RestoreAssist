---
name: restoreassist-scope-of-works
description: >-
  Generate detailed scope of works for water, fire, and mould restoration jobs.
  Input: inspection findings. Output: itemised scope with labour, materials,
  equipment, and timeline aligned to IICRC standards and NRPG rates.
license: MIT
metadata:
  author: RestoreAssist
  version: '1.0.0'
  locale: en-AU
---

# RestoreAssist — Scope of Works Generator

Generate itemised scope of works documents for restoration contractors. Scopes break down the remediation plan into discrete tasks with labour, materials, equipment, and timeline estimates based on IICRC standards and NRPG rate boundaries.

## When to Apply

### Positive Triggers

- Writing a scope of works from inspection findings
- Itemising restoration tasks with labour and materials
- Creating a remediation plan for insurer approval
- User mentions: "scope of works", "SOW", "remediation plan", "work schedule", "restoration scope"

### Negative Triggers

- Writing an inspection report (use `restoreassist-inspection-report`)
- Summarising for insurance (use `restoreassist-insurance-summary`)
- Checking compliance (use `restoreassist-iicrc-compliance-check`)

---

## Core Principles

### Three Laws of Scope Writing

1. **Inspection Drives Scope**: Every line item must trace back to a finding in the inspection report. No scope item exists without documented evidence.
2. **Itemise, Don't Lump**: Each task is a separate line item with its own labour, materials, and equipment. Lumped items get rejected by loss adjusters.
3. **Rate Boundaries Are Hard**: All rates must fall within NRPG-published boundaries. Rates outside boundaries require written justification.

---

## Scope Structure

### Required Sections

```markdown
# Scope of Works — [Job Number]

## 1. Job Summary
- **Job Number**: RA-XXXXX
- **Property Address**: [Address]
- **Date Prepared**: DD/MM/YYYY
- **Prepared By**: [Name, IICRC Cert #]
- **Insurer / Client**: [Name]
- **Claim Number**: [If applicable]
- **Damage Classification**: Category [1/2/3], Class [1–4]
- **Source of Loss**: [Description]

## 2. Scope Overview
[Brief narrative describing the full remediation scope — 2-3 paragraphs maximum]

## 3. Emergency / Make Safe Works
| # | Task Description | Unit | Qty | Rate | Total |
|---|-----------------|------|-----|------|-------|
| 1 | [Task]          | [hr/m²/ea] | [X] | $[X] | $[X] |

## 4. Water Extraction & Drying
| # | Task Description | Unit | Qty | Rate | Total |
|---|-----------------|------|-----|------|-------|
| 1 | [Task]          | [hr/m²/ea] | [X] | $[X] | $[X] |

## 5. Demolition & Removal
| # | Task Description | Unit | Qty | Rate | Total |
|---|-----------------|------|-----|------|-------|
| 1 | [Task]          | [hr/m²/ea] | [X] | $[X] | $[X] |

## 6. Antimicrobial Treatment
| # | Task Description | Unit | Qty | Rate | Total |
|---|-----------------|------|-----|------|-------|
| 1 | [Task]          | [hr/m²/ea] | [X] | $[X] | $[X] |

## 7. Contents Manipulation
| # | Task Description | Unit | Qty | Rate | Total |
|---|-----------------|------|-----|------|-------|
| 1 | [Task]          | [hr/m²/ea] | [X] | $[X] | $[X] |

## 8. Equipment Schedule
| Equipment | Qty | Daily Rate | Days | Total |
|-----------|-----|------------|------|-------|
| [Type]    | [X] | $[X]      | [X]  | $[X]  |

## 9. Monitoring & Documentation
| # | Task Description | Unit | Qty | Rate | Total |
|---|-----------------|------|-----|------|-------|
| 1 | [Task]          | [hr/visit] | [X] | $[X] | $[X] |

## 10. Cost Summary
| Section | Subtotal |
|---------|----------|
| Emergency / Make Safe | $[X] |
| Water Extraction & Drying | $[X] |
| Demolition & Removal | $[X] |
| Antimicrobial Treatment | $[X] |
| Contents Manipulation | $[X] |
| Equipment | $[X] |
| Monitoring & Documentation | $[X] |
| **Subtotal (ex GST)** | **$[X]** |
| **GST (10%)** | **$[X]** |
| **Total (inc GST)** | **$[X]** |

## 11. Timeline
| Phase | Duration | Start | Completion |
|-------|----------|-------|------------|
| Emergency / Make Safe | [X] hrs | Day 1 | Day 1 |
| Extraction & Drying Setup | [X] hrs | Day 1 | Day 1 |
| Structural Drying | [X] days | Day 1 | Day [X] |
| Monitoring | [X] visits | Day 2 | Day [X] |
| Demolition & Removal | [X] hrs | Day [X] | Day [X] |

## 12. Exclusions
- [Items explicitly excluded from this scope]
- Rebuild / reinstatement works (separate scope)
- Contents cleaning (separate scope if applicable)

## 13. Assumptions
- [Key assumptions underpinning the scope]
- Access to all affected areas will be provided
- Power supply available for equipment operation
```

---

## Example Input

```json
{
  "job_number": "RA-10042",
  "property_address": "14 Banksia Crescent, Epping NSW 2121",
  "insurer": "NRMA Insurance",
  "claim_number": "CLM-2026-884712",
  "category": 1,
  "class": 2,
  "source_of_loss": "Burst flexi-hose under kitchen sink",
  "affected_areas": [
    { "room": "Kitchen", "area_m2": 15.96, "floor": "Vinyl plank", "walls_affected_lm": 3.8, "wall_height_affected_m": 0.15 },
    { "room": "Hallway", "area_m2": 7.2, "floor": "Carpet", "walls_affected_lm": 0, "wall_height_affected_m": 0 }
  ],
  "findings": {
    "carpet_saturated": true,
    "underlay_saturated": true,
    "subfloor_wet": true,
    "plasterboard_wicking": true,
    "mould_present": false,
    "structural_damage": false,
    "contents_affected": false
  }
}
```

---

## Example Output

```markdown
# Scope of Works — RA-10042

## 1. Job Summary
- **Job Number**: RA-10042
- **Property Address**: 14 Banksia Crescent, Epping NSW 2121
- **Date Prepared**: 05/03/2026
- **Prepared By**: Sarah Mitchell, IICRC WRT #219847
- **Insurer / Client**: NRMA Insurance
- **Claim Number**: CLM-2026-884712
- **Damage Classification**: Category 1, Class 2
- **Source of Loss**: Burst flexi-hose under kitchen sink

## 2. Scope Overview
Remediation of Category 1, Class 2 water damage affecting the kitchen (15.96 m²)
and hallway (7.2 m²). Works include water extraction, carpet and underlay uplift
and disposal in the hallway, structural drying of subfloor and wall bases, and
antimicrobial treatment of exposed surfaces. Total affected area approximately
23.16 m².

## 3. Emergency / Make Safe Works
| # | Task Description | Unit | Qty | Rate | Total |
|---|-----------------|------|-----|------|-------|
| 1 | Initial site attendance and assessment | hr | 1.5 | $85.00 | $127.50 |
| 2 | Isolate water supply to affected area | ea | 1 | $0.00 | $0.00 |

## 4. Water Extraction & Drying
| # | Task Description | Unit | Qty | Rate | Total |
|---|-----------------|------|-----|------|-------|
| 1 | Carpet extraction — hallway | m² | 7.2 | $6.50 | $46.80 |
| 2 | Hard floor extraction — kitchen | m² | 15.96 | $5.00 | $79.80 |
| 3 | Subfloor cavity extraction — kitchen | hr | 2 | $85.00 | $170.00 |

## 5. Demolition & Removal
| # | Task Description | Unit | Qty | Rate | Total |
|---|-----------------|------|-----|------|-------|
| 1 | Uplift and dispose carpet — hallway | m² | 7.2 | $8.50 | $61.20 |
| 2 | Uplift and dispose underlay — hallway | m² | 7.2 | $4.50 | $32.40 |
| 3 | Remove vinyl plank skirting — kitchen (for drying access) | lm | 3.8 | $12.00 | $45.60 |
| 4 | Waste disposal and tip fees | ea | 1 | $85.00 | $85.00 |

## 6. Antimicrobial Treatment
| # | Task Description | Unit | Qty | Rate | Total |
|---|-----------------|------|-----|------|-------|
| 1 | Apply antimicrobial to exposed subfloor — kitchen | m² | 15.96 | $6.00 | $95.76 |
| 2 | Apply antimicrobial to wall base — kitchen | lm | 3.8 | $5.00 | $19.00 |
| 3 | Apply antimicrobial to exposed subfloor — hallway | m² | 7.2 | $6.00 | $43.20 |

## 8. Equipment Schedule
| Equipment | Qty | Daily Rate | Days | Total |
|-----------|-----|------------|------|-------|
| LGR Dehumidifier | 2 | $65.00 | 5 | $650.00 |
| Centrifugal Air Mover | 4 | $25.00 | 5 | $500.00 |
| Moisture Meter (on-site) | 1 | $0.00 | 5 | $0.00 |

## 9. Monitoring & Documentation
| # | Task Description | Unit | Qty | Rate | Total |
|---|-----------------|------|-----|------|-------|
| 1 | Daily moisture monitoring and logging | visit | 4 | $85.00 | $340.00 |
| 2 | Progress photo documentation | ea | 4 | $0.00 | $0.00 |
| 3 | Final dry-out confirmation and report | hr | 1.5 | $85.00 | $127.50 |

## 10. Cost Summary
| Section | Subtotal |
|---------|----------|
| Emergency / Make Safe | $127.50 |
| Water Extraction & Drying | $296.60 |
| Demolition & Removal | $224.20 |
| Antimicrobial Treatment | $157.96 |
| Contents Manipulation | $0.00 |
| Equipment | $1,150.00 |
| Monitoring & Documentation | $467.50 |
| **Subtotal (ex GST)** | **$2,423.76** |
| **GST (10%)** | **$242.38** |
| **Total (inc GST)** | **$2,666.14** |

## 11. Timeline
| Phase | Duration | Start | Completion |
|-------|----------|-------|------------|
| Emergency / Make Safe | 1.5 hrs | Day 1 | Day 1 |
| Extraction & Drying Setup | 3 hrs | Day 1 | Day 1 |
| Structural Drying | 5 days | Day 1 | Day 5 |
| Monitoring | 4 visits | Day 2 | Day 5 |
| Demolition & Removal | 4 hrs | Day 1 | Day 1 |

## 12. Exclusions
- Rebuild / reinstatement works (separate builder's scope)
- Replacement of carpet, underlay, and vinyl plank flooring
- Plumbing repairs (completed by plumber prior to restoration)
- Contents cleaning or restoration

## 13. Assumptions
- Category remains Category 1 throughout drying period
- Access to all affected areas provided during business hours
- Power supply available for equipment operation
- No concealed damage behind walls (if found, scope variation required)
```

---

## Common Equipment Reference

| Equipment | Typical Use | NRPG Daily Rate Range |
|-----------|-------------|-----------------------|
| LGR Dehumidifier | Structural drying | $55–$75/day |
| Centrifugal Air Mover | Evaporation assistance | $20–$30/day |
| Axial Air Mover | Large area ventilation | $15–$25/day |
| Air Scrubber / Negative Air | Mould / Cat 3 containment | $75–$110/day |
| HEPA Vacuum | Mould / asbestos work | $45–$65/day |
| Thermal Imaging Camera | Moisture mapping | $80–$120/day |
| Desiccant Dehumidifier | Low-temperature / deep drying | $85–$120/day |

---

## Anti-Patterns

| Pattern | Problem | Correct Approach |
|---------|---------|------------------|
| Lumped line items ("Restoration works — $5,000") | Loss adjusters reject — cannot verify | Itemise every task with unit, qty, rate |
| Equipment without daily rate and days | Cannot audit equipment costs | Always show daily rate x days |
| No timeline | Insurer cannot plan | Include phase-based timeline |
| Missing exclusions | Disputes over what is "included" | Explicitly list exclusions |
| Rates outside NRPG boundaries | Claim rejected or reduced | Stay within published rate ranges |

---

## Checklist

- [ ] Every line item traces to an inspection finding
- [ ] Tasks itemised with unit, quantity, rate, and total
- [ ] Equipment schedule with daily rate and duration
- [ ] Cost summary with GST calculated at 10%
- [ ] Timeline with phases and expected durations
- [ ] Exclusions clearly stated
- [ ] Assumptions documented
- [ ] Rates within NRPG boundaries

---

## Response Format

```
[AGENT_ACTIVATED]: RestoreAssist Scope of Works
[PHASE]: {Analysis | Scope Generation | Review}
[STATUS]: {in_progress | complete}

{scope of works output}

[NEXT_ACTION]: {what to do next}
```
