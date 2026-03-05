---
name: RestoreAssist Skill Evals
version: 1.0.0
skills_tested:
  - restoreassist-inspection-report
  - restoreassist-scope-of-works
  - restoreassist-insurance-summary
  - restoreassist-iicrc-compliance-check
---

# RestoreAssist — Skill Evaluation Test Cases

Evaluation scenarios for RestoreAssist restoration documentation skills. Each test case defines an input scenario and expected output characteristics for automated or manual review.

---

## Eval 1: Water Damage Cat 1 — Burst Pipe (Residential)

**Skill**: `restoreassist-inspection-report`

### Input Scenario
```
Job: RA-20001
Property: 22 Jacaranda Ave, Castle Hill NSW 2154 (residential)
Date of loss: 01/03/2026
Source: Burst copper pipe in bathroom wall cavity
Category: 1 (clean water — supply line)
Class: 2 (carpet and underlay wet, wall wicking to 200mm)
Affected areas: Bathroom (6m²), adjacent bedroom (12m²)
Moisture readings: Bathroom wall 74, bedroom carpet 52, bedroom wall base 31 (dry std 17, Tramex ME5)
Ambient: 22°C, 68% RH
Photos: 8 photos taken
Inspector: David Chen, IICRC WRT #301822
```

### Expected Output Characteristics
- [ ] Report contains all 8 required sections per SKILL.md template
- [ ] Category 1 and Class 2 correctly stated with justification
- [ ] All moisture readings include instrument type (Tramex ME5) and dry standard (17)
- [ ] Ambient conditions (22°C, 68% RH) recorded
- [ ] Photo log references 8 photos with locations
- [ ] Recommended actions include dehumidifiers and air movers with quantities
- [ ] Inspector IICRC credentials included in certification section
- [ ] Dates in DD/MM/YYYY format
- [ ] Australian spelling throughout (e.g., "metre" not "meter")

---

## Eval 2: Water Damage Cat 2 — Washing Machine Overflow

**Skill**: `restoreassist-scope-of-works`

### Input Scenario
```
Job: RA-20002
Property: Unit 4/18 Elm St, Parramatta NSW 2150 (apartment)
Category: 2 (grey water — washing machine)
Class: 2
Affected: Laundry (4m²), kitchen (10m²), hallway (5m²)
Findings: Vinyl plank saturated in laundry, tile grout discoloured in kitchen,
carpet wet in hallway, plasterboard wicking 100mm in laundry
Mould: Not present
Insurer: Allianz
```

### Expected Output Characteristics
- [ ] Scope traces every line item to an inspection finding
- [ ] Antimicrobial treatment included (required for Cat 2)
- [ ] Enhanced PPE noted (N95 respirator for Cat 2)
- [ ] Equipment schedule with daily rates and days
- [ ] Cost summary includes GST at 10%
- [ ] Rates within NRPG boundary ranges
- [ ] Timeline with phases and expected durations
- [ ] Exclusions section present (rebuild works excluded)
- [ ] No lump-sum line items — all tasks itemised with unit/qty/rate

---

## Eval 3: Water Damage Cat 3 — Sewage Backup

**Skill**: `restoreassist-iicrc-compliance-check`

### Input Scenario
```
Job: RA-20003
Documentation provided:
- Category: 3 (black water — sewage)
- Class: 3
- Affected: Bathroom, hallway, bedroom (total 30m²)
- Moisture readings: "All areas wet" (no specific readings)
- Equipment: "Dehumidifiers and fans deployed"
- Antimicrobial: "Treated all areas"
- PPE: Not documented
- Containment: Not documented
- Photos: 2 photos
- Final readings: Not provided
- Inspector: "Mike" (no credentials)
```

### Expected Output Characteristics
- [ ] Overall rating: NON-COMPLIANT
- [ ] CRITICAL non-conformances flagged:
  - No specific moisture readings (instrument, location, dry standard missing)
  - No final dry-out readings
  - No containment documented (required for Cat 3)
- [ ] HIGH non-conformances flagged:
  - PPE not documented (full PPE required for Cat 3)
  - Antimicrobial lacks product, concentration, method
  - Equipment lacks type, quantity, placement
  - Inspector credentials missing (IICRC cert number)
  - Only 2 photos (minimum 10 recommended)
- [ ] S520 matrix automatically checked (Cat 3 has mould risk)
- [ ] Specific remediation actions for every non-conformance
- [ ] Severity counts accurate in summary table

---

## Eval 4: Mould Remediation — Full Containment

**Skill**: `restoreassist-inspection-report` + `restoreassist-iicrc-compliance-check`

### Input Scenario
```
Job: RA-20004
Property: 8 Wattle Lane, Hornsby NSW 2077 (residential)
Date of loss: Ongoing moisture ingress — roof leak
Source: Chronic roof leak over 6+ months
Damage: Visible mould growth on plasterboard ceiling (12m²),
wall surfaces (8m²), and inside wall cavity
Mould type: Suspected Aspergillus/Penicillium (pending lab results)
Affected: Master bedroom (16m²), ensuite (6m²)
Moisture readings: Ceiling 88, wall 72, ensuite wall 45 (dry std 17, Protimeter MMS2)
Ambient: 26°C, 78% RH
Containment: Full containment required (>10m² mould, wall cavity involved)
Inspector: Lisa Park, IICRC AMRT #445102
```

### Expected Output Characteristics (Inspection Report)
- [ ] Report references both S500 and S520 standards
- [ ] Mould extent documented with area measurements
- [ ] Full containment noted as required with justification (>10m²)
- [ ] Moisture source (roof leak) identified as requiring rectification before remediation
- [ ] AMRT credentials noted (not just WRT)
- [ ] Recommended actions include: containment setup, HEPA filtration, negative air, PPE Level 3+
- [ ] Post-remediation clearance testing recommended

### Expected Output Characteristics (Compliance Check)
- [ ] S520 matrix applied (mould job)
- [ ] Checks containment type matches area (full containment for >10m²)
- [ ] Checks negative air requirement
- [ ] Checks HEPA filtration
- [ ] Checks PPE level appropriate for mould
- [ ] Checks moisture source resolution documented
- [ ] Flags if post-remediation verification plan is missing

---

## Eval 5: Fire Damage — Smoke and Soot

**Skill**: `restoreassist-scope-of-works`

### Input Scenario
```
Job: RA-20005
Property: 55 Eucalyptus Dr, Penrith NSW 2750 (residential)
Date of loss: 25/02/2026
Source: Kitchen grease fire — contained to stovetop but smoke damage throughout
Affected areas:
- Kitchen (14m²): Heavy soot on ceiling/walls, heat damage to cabinetry
- Living room (25m²): Light smoke film on walls and ceiling
- Hallway (8m²): Moderate smoke film
- 3 bedrooms (each 12m²): Light smoke odour, minimal visible soot
Total affected: ~95m²
Insurer: IAG / NRMA
Contents: Significant — open-plan kitchen/living with soft furnishings
```

### Expected Output Characteristics
- [ ] Scope sections cover: emergency make-safe, soot removal, odour treatment, contents
- [ ] Different cleaning methods specified per damage level (heavy, moderate, light)
- [ ] Air scrubbers / HEPA equipment in equipment schedule
- [ ] Thermal fogging or ozone treatment for odour in scope
- [ ] Contents pack-out and cleaning as separate section
- [ ] Timeline reflects multi-phase approach (clean before odour treatment)
- [ ] Cost summary with all sections totalled, GST applied
- [ ] Exclusions list structural repairs and cabinetry replacement

---

## Eval 6: Insurance Summary — Completed Cat 1 Job

**Skill**: `restoreassist-insurance-summary`

### Input Scenario
```
Job: RA-20006
Claim: CLM-2026-991205 (Suncorp)
Insured: Rachel Thompson
Property: 3/42 Boronia Rd, Greenacre NSW 2190
Date of loss: 20/02/2026
Inspection: 21/02/2026
Completion: 27/02/2026
Cause: Dishwasher supply line failure
Category: 1, Class: 2
Affected: Kitchen (12m²), dining (8m²)
Works: Extraction, carpet removal (dining), structural drying 6 days,
antimicrobial, daily monitoring (5 visits)
Equipment: 2x LGR dehum, 3x air movers, 6 days
Initial readings: Kitchen floor 71, dining carpet 58, kitchen wall 42
Final readings: Kitchen floor 13, dining subfloor 11, kitchen wall 9
Dry standard: 17 (Tramex)
Cost: Labour $890, Materials $195, Equipment $1,380 = $2,465 ex GST
```

### Expected Output Characteristics
- [ ] All header fields populated (job, claim, insured, property, dates)
- [ ] Cause of loss is specific and factual
- [ ] IICRC Category 1, Class 2 stated
- [ ] Affected areas listed with m²
- [ ] Works listed in chronological order
- [ ] Equipment table with qty and duration
- [ ] Moisture comparison table: initial vs final vs dry standard, all show "Dry"
- [ ] Outcome states drying achieved within standard
- [ ] Cost breakdown: labour, materials, equipment, subtotal, GST, total
- [ ] Supporting documentation checklist present
- [ ] Compliance section references IICRC S500

---

## Eval 7: Compliance Check — Well-Documented Job (Passes)

**Skill**: `restoreassist-iicrc-compliance-check`

### Input Scenario
```
Job: RA-20007
Standard: S500
Documentation provided (all complete):
- Category: 1, Class: 2, justified
- Escalation assessed: Yes (within 24 hours, no escalation)
- Moisture readings: 12 points, Tramex ME5, dry standards noted
- Ambient: 23°C/65% RH at every visit
- Photos: 28 with captions and timestamps
- Drying goals: All materials below dry standard
- Equipment: 2x LGR dehum, 4x air movers with placement diagram
- Monitoring: 5 daily logs with consistent points
- Antimicrobial: Benefect Decon 30, applied undiluted via ULV fogger to subfloor
- PPE: Safety glasses, nitrile gloves (appropriate for Cat 1)
- Contents: No contents affected
- Pre-existing: Noted — minor cracking in ceiling plaster, unrelated
- Final readings: All below dry standard with comparison table
- Inspector: Jane Liu, IICRC WRT #287650
```

### Expected Output Characteristics
- [ ] Overall rating: COMPLIANT
- [ ] 15/15 requirements passed
- [ ] Zero CRITICAL or HIGH non-conformances
- [ ] Each passed requirement lists where the evidence is found
- [ ] Summary confirms full compliance with IICRC S500
- [ ] May include minor recommendations (e.g., "consider thermal imaging for verification")

---

## Eval 8: Multi-Skill Workflow — Full Job Lifecycle

**Skill**: All four skills in sequence

### Input Scenario
```
Job: RA-20008
Property: 100 Spotted Gum Ct, Kellyville NSW 2155 (new build, 18 months old)
Source: Upstairs bathroom waterproofing failure — slow leak over 3 months
Category: 2 (grey water — shower/bath water with soap, body oils)
Class: 3 (walls, ceiling below, insulation saturated)
Affected:
- Upstairs bathroom (8m²): Tile grout failure, subfloor wet
- Downstairs living room ceiling (20m²): Plasterboard ceiling saturated, sagging
- Downstairs living room walls (2 walls, 12 lm): Wicking to 400mm
Mould: Yes — visible mould on downstairs ceiling plasterboard (approx 4m²)
Insurer: QBE
Inspector: Tom Bradley, IICRC WRT/AMRT #198744
```

### Expected Output Characteristics

**Step 1 — Inspection Report**
- [ ] Both S500 and S520 referenced (water + mould)
- [ ] Category 2 with mould flagged
- [ ] Class 3 justified (ceiling, walls, insulation)
- [ ] Mould extent documented (4m², downstairs ceiling)
- [ ] Recommended: containment for mould area, waterproofing repair before remediation

**Step 2 — Scope of Works**
- [ ] Separate sections for water remediation and mould remediation
- [ ] Containment for mould area (limited — <10m²)
- [ ] HEPA air scrubber in equipment schedule
- [ ] Ceiling plasterboard removal (saturated + mould)
- [ ] Insulation removal and disposal
- [ ] Cat 2 antimicrobial treatment throughout
- [ ] Waterproofing repair listed as exclusion (builder responsibility)

**Step 3 — Compliance Check**
- [ ] Both S500 and S520 matrices applied
- [ ] Containment level verified against mould area
- [ ] PPE level appropriate for Cat 2 + mould
- [ ] Post-remediation clearance included for mould area

**Step 4 — Insurance Summary**
- [ ] Summarises both water and mould remediation
- [ ] Mould noted as secondary damage from waterproofing failure
- [ ] Builder defect noted as root cause
- [ ] Cost summary includes all phases

---

## Eval 9: Edge Case — Category Escalation

**Skill**: `restoreassist-iicrc-compliance-check`

### Input Scenario
```
Job: RA-20009
Category initially documented as: 1 (clean water)
Time elapsed before remediation started: 72 hours
Temperature during delay: 30°C average
Humidity: 82% RH
No escalation assessment documented
Current documentation treats job as Category 1 throughout
```

### Expected Output Characteristics
- [ ] CRITICAL flag: Category escalation not assessed
- [ ] Finding notes: Cat 1 water >48 hours in warm/humid conditions (30°C, 82% RH) must be reassessed — likely Cat 2
- [ ] Remediation: Reassess category, update all documentation, apply Cat 2 protocols if escalated
- [ ] S500 §6.4 referenced for escalation rules
- [ ] Impact noted: If Cat 2, antimicrobial treatment required, PPE level increases

---

## Eval 10: Edge Case — Minimal Input

**Skill**: `restoreassist-inspection-report`

### Input Scenario
```
Job: RA-20010
"Water damage in kitchen from leaking tap. Floor is wet."
```

### Expected Output Characteristics
- [ ] Skill does NOT generate a complete report from insufficient data
- [ ] Requests missing information:
  - Property address and type
  - Date of loss
  - Specific moisture readings with instrument
  - Water category classification
  - Damage class
  - Affected area dimensions
  - Photo documentation
  - Inspector credentials
- [ ] May provide a partial template with [REQUIRED] placeholders
- [ ] Does NOT fabricate readings, dimensions, or classifications

---

## Scoring Guide

### Per-Eval Scoring

| Score | Criteria |
|-------|----------|
| **PASS** | All expected characteristics met |
| **PARTIAL** | >75% of expected characteristics met, no CRITICAL misses |
| **FAIL** | <75% met, or any CRITICAL characteristic missed |

### Critical Characteristics (automatic FAIL if missed)

- IICRC Category/Class specified where required
- Moisture readings include instrument type and dry standard
- No fabricated data
- Australian locale (DD/MM/YYYY, metric, en-AU spelling)
- Cost totals include GST at 10%

### Overall Skill Health

| Rating | Criteria |
|--------|----------|
| **Healthy** | 8+ evals PASS |
| **Degraded** | 6-7 evals PASS |
| **Broken** | <6 evals PASS |
