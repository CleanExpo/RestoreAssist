---
name: restoreassist-insurance-summary
description: >-
  Summarise restoration job details for insurance claim submission. Produces
  concise, professional summaries matching insurer expectations with damage
  classification, works performed, costs, and compliance references.
license: MIT
metadata:
  author: RestoreAssist
  version: '1.0.0'
  locale: en-AU
---

# RestoreAssist — Insurance Summary Generator

Generate concise insurance claim summaries from restoration job data. Summaries are formatted for loss adjusters and insurance assessors — factual, structured, and compliant with IICRC documentation standards.

## When to Apply

### Positive Triggers

- Preparing a claim summary for insurer submission
- Writing a job completion summary for the insurance file
- Summarising restoration works for a loss adjuster
- User mentions: "insurance summary", "claim summary", "insurer report", "loss adjuster", "claim submission"

### Negative Triggers

- Writing a full inspection report (use `restoreassist-inspection-report`)
- Writing a detailed scope of works (use `restoreassist-scope-of-works`)
- Checking IICRC compliance (use `restoreassist-iicrc-compliance-check`)

---

## Core Principles

### Three Laws of Insurance Summaries

1. **Facts, Not Opinions**: Every statement must be supported by documented evidence — moisture readings, photos, inspection findings. No subjective language.
2. **Concise, Not Brief**: Include all material facts but eliminate unnecessary detail. Loss adjusters review dozens of claims daily — respect their time.
3. **Compliance Forward**: Reference applicable IICRC standards and classification in the first paragraph. This signals professionalism and reduces queries.

---

## Summary Structure

### Required Format

```markdown
# Insurance Claim Summary

**Job Number**: RA-XXXXX
**Claim Number**: [Insurer claim ref]
**Insured**: [Property owner name]
**Property**: [Full address]
**Date of Loss**: DD/MM/YYYY
**Date Notified**: DD/MM/YYYY
**Inspection Date**: DD/MM/YYYY
**Completion Date**: DD/MM/YYYY (or "In Progress")

---

## Cause of Loss
[1-2 sentences describing the source of the loss event]

## Damage Classification (IICRC S500)
- **Water Category**: [1/2/3] — [brief description]
- **Damage Class**: [1–4] — [brief description]
- **Category Escalation**: [Yes/No — if category changed during works]

## Affected Areas
[Bullet list of affected rooms with area in m² and key damage]

## Works Performed
[Numbered list of remediation activities completed, in chronological order]

## Equipment Deployed
[Table: equipment type, quantity, duration]

## Moisture Readings Summary
| Point | Initial | Final | Dry Standard | Status |
|-------|---------|-------|--------------|--------|
| [Location] | [X] | [X] | [X] | [Dry/In Progress] |

## Outcome
[1-2 sentences: was drying achieved? Any outstanding works?]

## Cost Summary
| Item | Amount (ex GST) |
|------|-----------------|
| Labour | $[X] |
| Materials | $[X] |
| Equipment | $[X] |
| **Subtotal** | **$[X]** |
| **GST** | **$[X]** |
| **Total** | **$[X]** |

## Supporting Documentation
- [ ] Inspection report (attached)
- [ ] Scope of works (attached)
- [ ] Daily moisture logs (attached)
- [ ] Photo evidence ([X] photos attached)
- [ ] Certificate of completion

## Compliance
Works performed in accordance with:
- IICRC S500 Standard and Reference Guide for Professional Water Damage Restoration
- [IICRC S520 if mould involved]
- [AS/NZS standards if applicable]

---

Prepared by: [Name], [IICRC Cert #]
Company: [Company name]
Date: DD/MM/YYYY
Contact: [Phone] / [Email]
```

---

## Example Input

```json
{
  "job_number": "RA-10042",
  "claim_number": "CLM-2026-884712",
  "insured": "James & Patricia Wong",
  "property": "14 Banksia Crescent, Epping NSW 2121",
  "date_of_loss": "03/03/2026",
  "date_notified": "03/03/2026",
  "inspection_date": "05/03/2026",
  "completion_date": "10/03/2026",
  "cause": "Burst braided flexi-hose under kitchen sink. Failure at compression fitting. Water ran for approximately 24 hours before discovery.",
  "category": 1,
  "class": 2,
  "category_escalation": false,
  "affected_areas": [
    { "room": "Kitchen", "area_m2": 15.96, "damage": "Subfloor saturated, vinyl plank cupping, plasterboard wicking to 150mm" },
    { "room": "Hallway", "area_m2": 7.2, "damage": "Carpet and underlay saturated throughout" }
  ],
  "works_performed": [
    "Emergency attendance and site assessment",
    "Water extraction from kitchen and hallway",
    "Carpet and underlay uplift and disposal — hallway",
    "Vinyl plank skirting removal — kitchen (drying access)",
    "Antimicrobial treatment to exposed subfloor and wall bases",
    "Structural drying with 2x LGR dehumidifiers and 4x air movers over 5 days",
    "Daily moisture monitoring (4 visits)",
    "Final dry-out confirmation and report"
  ],
  "equipment": [
    { "type": "LGR Dehumidifier", "qty": 2, "days": 5 },
    { "type": "Centrifugal Air Mover", "qty": 4, "days": 5 }
  ],
  "readings": [
    { "location": "Kitchen subfloor", "initial": 82, "final": 14, "dry_std": 17, "status": "Dry" },
    { "location": "Kitchen wall base", "initial": 64, "final": 12, "dry_std": 17, "status": "Dry" },
    { "location": "Hallway subfloor", "initial": 45, "final": 15, "dry_std": 17, "status": "Dry" }
  ],
  "cost": {
    "labour": 762.50,
    "materials": 157.96,
    "equipment": 1150.00,
    "subtotal": 2070.46,
    "gst": 207.05,
    "total": 2277.51
  }
}
```

---

## Example Output

```markdown
# Insurance Claim Summary

**Job Number**: RA-10042
**Claim Number**: CLM-2026-884712
**Insured**: James & Patricia Wong
**Property**: 14 Banksia Crescent, Epping NSW 2121
**Date of Loss**: 03/03/2026
**Date Notified**: 03/03/2026
**Inspection Date**: 05/03/2026
**Completion Date**: 10/03/2026

---

## Cause of Loss
Burst braided flexi-hose under kitchen sink. Failure occurred at the compression
fitting. Water ran for approximately 24 hours before discovery by the homeowner.

## Damage Classification (IICRC S500)
- **Water Category**: 1 — Clean water from supply line
- **Damage Class**: 2 — Entire room affected, carpet and underlay wet
- **Category Escalation**: No

## Affected Areas
- **Kitchen** (15.96 m²) — Subfloor saturated, vinyl plank cupping, plasterboard wicking to 150 mm
- **Hallway** (7.2 m²) — Carpet and underlay saturated throughout

## Works Performed
1. Emergency attendance and site assessment (05/03/2026)
2. Water extraction from kitchen hard floor and hallway carpet
3. Carpet and underlay uplift and disposal — hallway
4. Vinyl plank skirting removal — kitchen (for drying access)
5. Antimicrobial treatment to exposed subfloor and wall bases
6. Structural drying — 2x LGR dehumidifiers, 4x air movers, 5 days
7. Daily moisture monitoring — 4 site visits
8. Final dry-out confirmation and report (10/03/2026)

## Equipment Deployed
| Equipment | Qty | Duration |
|-----------|-----|----------|
| LGR Dehumidifier | 2 | 5 days |
| Centrifugal Air Mover | 4 | 5 days |

## Moisture Readings Summary
| Point | Initial | Final | Dry Std | Status |
|-------|---------|-------|---------|--------|
| Kitchen subfloor | 82 | 14 | 17 | Dry |
| Kitchen wall base | 64 | 12 | 17 | Dry |
| Hallway subfloor | 45 | 15 | 17 | Dry |

## Outcome
All affected areas dried to below IICRC dry standard within 5 days. No mould
growth detected. Property cleared for reinstatement works.

## Cost Summary
| Item | Amount (ex GST) |
|------|-----------------|
| Labour | $762.50 |
| Materials | $157.96 |
| Equipment | $1,150.00 |
| **Subtotal** | **$2,070.46** |
| **GST** | **$207.05** |
| **Total** | **$2,277.51** |

## Supporting Documentation
- [x] Inspection report (attached)
- [x] Scope of works (attached)
- [x] Daily moisture logs (attached)
- [x] Photo evidence (42 photos attached)
- [x] Certificate of completion

## Compliance
Works performed in accordance with:
- IICRC S500 Standard and Reference Guide for Professional Water Damage Restoration

---

Prepared by: Sarah Mitchell, IICRC WRT #219847
Company: RestoreAssist Pty Ltd
Date: 10/03/2026
Contact: 0412 345 678 / sarah@restoreassist.com.au
```

---

## Tone Guidelines

| Do | Don't |
|----|-------|
| "Water ran for approximately 24 hours" | "There was a terrible flood" |
| "Subfloor saturated — readings of 82 (dry standard 17)" | "The floor was very wet" |
| "Category 1 — clean water from supply line" | "Luckily it was clean water" |
| "All areas dried to below dry standard" | "We did a great job drying it out" |
| "No mould growth detected at time of inspection" | "There is no mould" |

---

## Anti-Patterns

| Pattern | Problem | Correct Approach |
|---------|---------|------------------|
| Subjective language ("severe damage") | Unprofessional, challengeable | Use measurements and classifications |
| Missing classification | Assessor must request — delays claim | Always lead with Cat/Class |
| No moisture comparison (initial vs final) | Cannot prove drying was achieved | Show before/after readings |
| Costs without breakdown | Cannot be assessed | Break down by labour, materials, equipment |
| No supporting docs checklist | Assessor chases missing documents | Include checklist with attachment status |

---

## Checklist

- [ ] All header fields populated (job #, claim #, dates)
- [ ] Cause of loss is factual and specific
- [ ] IICRC Category and Class stated
- [ ] Affected areas listed with m² and damage description
- [ ] Works listed in chronological order
- [ ] Equipment table with quantities and duration
- [ ] Moisture readings show initial, final, dry standard, status
- [ ] Cost summary with GST
- [ ] Supporting documentation checklist
- [ ] Compliance standards referenced
- [ ] Preparer credentials included

---

## Response Format

```
[AGENT_ACTIVATED]: RestoreAssist Insurance Summary
[PHASE]: {Data Review | Summary Generation | Review}
[STATUS]: {in_progress | complete}

{insurance summary output}

[NEXT_ACTION]: {what to do next}
```
