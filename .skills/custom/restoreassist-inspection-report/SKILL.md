---
name: restoreassist-inspection-report
description: >-
  Generate IICRC S500/S520-compliant water damage inspection reports from job
  details, moisture readings, and site photos. Outputs structured reports with
  damage classification, affected areas, moisture mapping, and recommended actions.
license: MIT
metadata:
  author: RestoreAssist
  version: '1.0.0'
  locale: en-AU
---

# RestoreAssist — Inspection Report Generator

Generate IICRC S500-compliant water damage inspection reports for restoration contractors. Reports follow the standard structure expected by insurers and loss adjusters in Australia.

## When to Apply

### Positive Triggers

- Generating a water damage inspection report
- Documenting moisture readings and damage classification
- Creating initial site assessment documentation
- User mentions: "inspection report", "moisture report", "site assessment", "water damage report", "S500 report"

### Negative Triggers

- Writing a scope of works (use `restoreassist-scope-of-works`)
- Summarising for insurance submission (use `restoreassist-insurance-summary`)
- Checking compliance of existing documentation (use `restoreassist-iicrc-compliance-check`)

---

## Core Principles

### Three Laws of Inspection Reporting

1. **Classify First**: Every water damage event must be classified by IICRC category (1/2/3) and class (1–4) before any remediation plan is written. Classification drives the entire response.
2. **Measure Everything**: Moisture readings, relative humidity, temperature, and affected area dimensions must be recorded with instrument type and calibration status noted.
3. **Document for the File**: Reports are legal documents. Every observation, measurement, and recommendation must be defensible and traceable.

---

## Report Structure

### Required Sections (IICRC S500 Compliance)

```markdown
# Water Damage Inspection Report

## 1. Job Information
- **Job Number**: RA-XXXXX
- **Date of Inspection**: DD/MM/YYYY
- **Inspector**: [Name, IICRC Cert #]
- **Property Address**: [Full address]
- **Property Type**: [Residential / Commercial]
- **Client / Insurer**: [Name]
- **Claim Number**: [If applicable]
- **Date of Loss**: DD/MM/YYYY
- **Source of Loss**: [e.g., Burst pipe, storm, overflow]

## 2. Damage Classification
- **IICRC Water Category**: [1 / 2 / 3]
  - Category 1: Clean water (supply line, rainwater)
  - Category 2: Grey water (washing machine, dishwasher, toilet overflow with urine)
  - Category 3: Black water (sewage, flood water, toilet overflow with faeces)
- **IICRC Class**: [1 / 2 / 3 / 4]
  - Class 1: <5% of floor area, low permeance materials
  - Class 2: Entire room affected, carpet and underlay wet
  - Class 3: Ceilings, walls, insulation, carpet, subfloor saturated
  - Class 4: Deep pockets — wet hardwood, plaster, concrete, stone

## 3. Affected Areas
| Room / Area | Dimensions (m) | Floor Type | Wall Type | Ceiling | Affected |
|-------------|-----------------|------------|-----------|---------|----------|
| [Room]      | [L x W]         | [Type]     | [Type]    | [Type]  | [Y/N]    |

## 4. Moisture Readings
| Location          | Material     | Instrument       | Reading | Dry Standard | Status    |
|-------------------|-------------|------------------|---------|--------------|-----------|
| [Room - surface]  | [Material]  | [Meter type]     | [Value] | [Threshold]  | [Wet/Dry] |

- **Ambient Conditions**: [Temp °C] / [RH %]
- **External Conditions**: [Temp °C] / [RH %]

## 5. Photo Log
| Photo # | Location          | Description                     | Timestamp        |
|---------|-------------------|---------------------------------|------------------|
| 1       | [Room / area]     | [What the photo shows]          | DD/MM/YYYY HH:MM |

## 6. Observations & Findings
- [Detailed narrative of damage observed]
- [Secondary damage — mould, structural, electrical hazards]
- [Pre-existing conditions noted]

## 7. Recommended Actions
- [ ] Immediate containment measures
- [ ] Equipment required (dehumidifiers, air movers, air scrubbers)
- [ ] Antimicrobial treatment required (Y/N)
- [ ] Contents manipulation required (Y/N)
- [ ] Structural drying plan
- [ ] Monitoring schedule (daily / every 48 hrs)

## 8. Disclaimer & Certification
This report was prepared by [Inspector Name], IICRC Certified [WRT/AMRT/FSRT #],
in accordance with IICRC S500 Standard and Reference Guide for Professional
Water Damage Restoration. Findings are based on visual inspection and moisture
readings taken at the time of assessment. Concealed damage may exist behind
walls, under flooring, or in other inaccessible areas.

Date: DD/MM/YYYY
Signature: _______________
```

---

## Example Input

```json
{
  "job_number": "RA-10042",
  "inspection_date": "05/03/2026",
  "inspector": "Sarah Mitchell, IICRC WRT #219847",
  "property_address": "14 Banksia Crescent, Epping NSW 2121",
  "property_type": "Residential",
  "client": "NRMA Insurance",
  "claim_number": "CLM-2026-884712",
  "date_of_loss": "03/03/2026",
  "source_of_loss": "Burst flexi-hose under kitchen sink",
  "category": 1,
  "class": 2,
  "affected_areas": [
    {
      "room": "Kitchen",
      "dimensions": "4.2 x 3.8",
      "floor_type": "Vinyl plank",
      "wall_type": "Plasterboard",
      "ceiling": "Plasterboard",
      "affected": true
    },
    {
      "room": "Hallway",
      "dimensions": "6.0 x 1.2",
      "floor_type": "Carpet",
      "wall_type": "Plasterboard",
      "ceiling": "Plasterboard",
      "affected": true
    }
  ],
  "moisture_readings": [
    { "location": "Kitchen - subfloor", "material": "Particleboard", "instrument": "Tramex ME5", "reading": 82, "dry_standard": 17, "status": "Wet" },
    { "location": "Kitchen - wall base (north)", "material": "Plasterboard", "instrument": "Tramex ME5", "reading": 64, "dry_standard": 17, "status": "Wet" },
    { "location": "Hallway - carpet", "material": "Carpet/underlay", "instrument": "Tramex ME5", "reading": 45, "dry_standard": 17, "status": "Wet" },
    { "location": "Hallway - wall base", "material": "Plasterboard", "instrument": "Tramex ME5", "reading": 28, "dry_standard": 17, "status": "Wet" }
  ],
  "ambient_conditions": { "temp_c": 24, "rh_percent": 72 },
  "external_conditions": { "temp_c": 28, "rh_percent": 65 },
  "observations": "Water tracked from kitchen through hallway over approximately 24 hours. Vinyl plank flooring in kitchen is cupping. Carpet and underlay in hallway saturated. Plasterboard wicking visible to 150mm on north kitchen wall. No mould growth observed. No electrical hazards identified.",
  "photos": [
    { "number": 1, "location": "Kitchen - under sink", "description": "Failed flexi-hose connection", "timestamp": "05/03/2026 09:15" },
    { "number": 2, "location": "Kitchen - floor", "description": "Cupping visible in vinyl plank", "timestamp": "05/03/2026 09:18" },
    { "number": 3, "location": "Hallway - carpet", "description": "Visible saturation of carpet", "timestamp": "05/03/2026 09:22" }
  ]
}
```

---

## Example Output

```markdown
# Water Damage Inspection Report

## 1. Job Information
- **Job Number**: RA-10042
- **Date of Inspection**: 05/03/2026
- **Inspector**: Sarah Mitchell, IICRC WRT #219847
- **Property Address**: 14 Banksia Crescent, Epping NSW 2121
- **Property Type**: Residential
- **Client / Insurer**: NRMA Insurance
- **Claim Number**: CLM-2026-884712
- **Date of Loss**: 03/03/2026
- **Source of Loss**: Burst flexi-hose under kitchen sink

## 2. Damage Classification
- **IICRC Water Category**: 1 (Clean water — supply line)
- **IICRC Class**: 2 (Entire room affected, carpet and underlay wet)

## 3. Affected Areas
| Room / Area | Dimensions (m) | Floor Type    | Wall Type     | Ceiling       | Affected |
|-------------|-----------------|---------------|---------------|---------------|----------|
| Kitchen     | 4.2 x 3.8      | Vinyl plank   | Plasterboard  | Plasterboard  | Yes      |
| Hallway     | 6.0 x 1.2      | Carpet        | Plasterboard  | Plasterboard  | Yes      |

## 4. Moisture Readings
| Location                     | Material        | Instrument  | Reading | Dry Std | Status |
|------------------------------|-----------------|-------------|---------|---------|--------|
| Kitchen — subfloor           | Particleboard   | Tramex ME5  | 82      | 17      | Wet    |
| Kitchen — wall base (north)  | Plasterboard    | Tramex ME5  | 64      | 17      | Wet    |
| Hallway — carpet             | Carpet/underlay | Tramex ME5  | 45      | 17      | Wet    |
| Hallway — wall base          | Plasterboard    | Tramex ME5  | 28      | 17      | Wet    |

- **Ambient Conditions**: 24°C / 72% RH
- **External Conditions**: 28°C / 65% RH

## 5. Photo Log
| Photo # | Location              | Description                      | Timestamp        |
|---------|-----------------------|----------------------------------|------------------|
| 1       | Kitchen — under sink  | Failed flexi-hose connection     | 05/03/2026 09:15 |
| 2       | Kitchen — floor       | Cupping visible in vinyl plank   | 05/03/2026 09:18 |
| 3       | Hallway — carpet      | Visible saturation of carpet     | 05/03/2026 09:22 |

## 6. Observations & Findings
Water tracked from kitchen through hallway over approximately 24 hours following
failure of a braided flexi-hose connection under the kitchen sink. Vinyl plank
flooring in the kitchen is exhibiting cupping consistent with prolonged moisture
exposure. Carpet and underlay in the hallway are saturated throughout. Plasterboard
wicking visible to 150 mm height on the north kitchen wall. No mould growth
observed at time of inspection. No electrical hazards identified. No pre-existing
damage noted.

## 7. Recommended Actions
- [ ] Isolate water supply to failed flexi-hose (completed by plumber prior to inspection)
- [ ] Extract standing water from kitchen subfloor cavity
- [ ] Uplift and dispose of carpet and underlay in hallway (saturated beyond salvage)
- [ ] Install 2x LGR dehumidifiers (kitchen, hallway)
- [ ] Install 4x air movers (2 kitchen, 2 hallway) for structural drying
- [ ] Apply antimicrobial treatment to exposed subfloor and wall bases
- [ ] Monitor moisture daily — target readings below dry standard within 5 days
- [ ] Reassess at 48-hour intervals for Category 1 > Category 2 escalation

## 8. Disclaimer & Certification
This report was prepared by Sarah Mitchell, IICRC WRT #219847, in accordance with
IICRC S500 Standard and Reference Guide for Professional Water Damage Restoration.
Findings are based on visual inspection and moisture readings taken at the time of
assessment. Concealed damage may exist behind walls, under flooring, or in other
inaccessible areas.

Date: 05/03/2026
Signature: _______________
```

---

## Moisture Reading Reference

| Material        | Dry Standard (Tramex) | Concern Level | Action Required |
|-----------------|----------------------|---------------|-----------------|
| Plasterboard    | < 17                 | 17–40         | Monitor + dry   |
| Timber framing  | < 15                 | 15–25         | Structural dry  |
| Concrete slab   | < 4% (CM)            | 4–6%          | Extended drying  |
| Carpet/underlay | < 17                 | > 17          | Extract/remove  |
| Particleboard   | < 17                 | > 40          | Replace         |

---

## Anti-Patterns

| Pattern | Problem | Correct Approach |
|---------|---------|------------------|
| No category/class specified | Insurer will reject — classification drives scope | Always classify Cat 1/2/3 and Class 1–4 |
| Readings without instrument type | Not defensible if challenged | Always note instrument make/model |
| Missing photo log | No visual evidence for claim | Minimum 10 photos per inspection |
| Vague observations | "Water damage observed" — useless | Describe extent, height, material impact specifically |
| No dry standard comparison | Readings are meaningless without baseline | Always include dry standard for each material |

---

## Checklist

- [ ] Job number and all header fields populated
- [ ] IICRC Category (1/2/3) and Class (1–4) specified with justification
- [ ] All affected areas listed with dimensions
- [ ] Moisture readings with instrument type and dry standard
- [ ] Ambient and external conditions recorded
- [ ] Photo log with numbered photos, locations, and timestamps
- [ ] Observations are specific and defensible
- [ ] Recommended actions include equipment quantities
- [ ] Inspector certification and IICRC credentials included

---

## Response Format

```
[AGENT_ACTIVATED]: RestoreAssist Inspection Report
[PHASE]: {Data Collection | Report Generation | Review}
[STATUS]: {in_progress | complete}

{inspection report output}

[NEXT_ACTION]: {what to do next}
```
