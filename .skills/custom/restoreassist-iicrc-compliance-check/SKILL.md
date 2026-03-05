---
name: restoreassist-iicrc-compliance-check
description: >-
  Check restoration job documentation against IICRC S500/S520 compliance
  requirements. Flags gaps in classification, moisture documentation, PPE,
  containment, antimicrobial treatment, and reporting standards.
license: MIT
metadata:
  author: RestoreAssist
  version: '1.0.0'
  locale: en-AU
---

# RestoreAssist — IICRC Compliance Checker

Audit restoration job documentation against IICRC S500 (water damage) and S520 (mould remediation) standards. Produces a compliance report flagging gaps, missing documentation, and non-conformances.

## When to Apply

### Positive Triggers

- Reviewing a restoration job for IICRC compliance
- Auditing documentation before insurer submission
- Checking if a job description meets S500/S520 requirements
- User mentions: "compliance check", "IICRC audit", "S500 compliance", "S520 compliance", "documentation gaps"

### Negative Triggers

- Writing an inspection report (use `restoreassist-inspection-report`)
- Writing a scope of works (use `restoreassist-scope-of-works`)
- Preparing an insurance summary (use `restoreassist-insurance-summary`)

---

## Core Principles

### Three Laws of Compliance Checking

1. **Standard Is Law**: IICRC S500/S520 defines the minimum requirements. If the standard says it must be documented, its absence is a non-conformance — no exceptions.
2. **Evidence Over Intent**: "We did antimicrobial treatment" is not evidence. Date, product name, concentration, application method, and affected area must be recorded.
3. **Flag, Don't Fix**: The compliance checker identifies gaps. It does not fabricate missing data or assume compliance.

---

## Compliance Matrix — IICRC S500 (Water Damage)

### Mandatory Documentation Requirements

| # | Requirement | S500 Reference | Severity | Check |
|---|------------|----------------|----------|-------|
| 1 | Water category classification (1/2/3) | S500 §6 | CRITICAL | Is the water source classified with justification? |
| 2 | Damage class (1–4) | S500 §7 | CRITICAL | Is the damage class specified based on affected materials and area? |
| 3 | Category escalation assessment | S500 §6.4 | HIGH | Was time-based escalation assessed (Cat 1 > Cat 2 after 48 hrs)? |
| 4 | Moisture readings with instrument | S500 §10 | CRITICAL | Are readings recorded with instrument type, location, and dry standard? |
| 5 | Ambient conditions (temp, RH) | S500 §10 | HIGH | Are temperature and relative humidity recorded at each visit? |
| 6 | Photo documentation | S500 §12 | HIGH | Are dated, captioned photos provided for all affected areas? |
| 7 | Drying goals established | S500 §11 | HIGH | Are target moisture levels defined based on dry standards? |
| 8 | Equipment type and placement | S500 §11 | MEDIUM | Are dehumidifiers and air movers specified with quantities and locations? |
| 9 | Daily monitoring logs | S500 §10.3 | HIGH | Are moisture readings taken at consistent points across drying period? |
| 10 | Antimicrobial treatment record | S500 §9 | HIGH | Is product, concentration, and application method documented? |
| 11 | PPE appropriate to category | S500 §8 | MEDIUM | Is PPE level appropriate for the water category? |
| 12 | Contents inventory | S500 §14 | MEDIUM | Are affected contents listed with condition and disposition? |
| 13 | Pre-existing conditions noted | S500 §12 | MEDIUM | Are any pre-existing damage conditions documented? |
| 14 | Completion criteria met | S500 §11.5 | CRITICAL | Do final readings confirm all materials at or below dry standard? |
| 15 | Inspector credentials | S500 §4 | HIGH | Is the inspector IICRC certified (WRT/AMRT) with credential number? |

### Category-Specific Requirements

#### Category 1 (Clean Water)
- [ ] Source confirmed as clean water supply
- [ ] 48-hour escalation clock documented
- [ ] Standard PPE (gloves, safety glasses)

#### Category 2 (Grey Water)
- [ ] Source identified and classified
- [ ] Antimicrobial treatment applied to all affected porous materials
- [ ] Enhanced PPE (N95 respirator, gloves, safety glasses)
- [ ] Porous materials saturated >48 hours treated as Category 3

#### Category 3 (Black Water)
- [ ] Containment established (negative air if applicable)
- [ ] All porous materials in contact zone removed and disposed
- [ ] Full PPE (Tyvek suit, N95/P100, gloves, boot covers)
- [ ] Antimicrobial treatment to all structural surfaces
- [ ] Third-party clearance testing recommended
- [ ] Disposal manifest for contaminated materials

---

## Compliance Matrix — IICRC S520 (Mould Remediation)

### Mandatory Documentation Requirements

| # | Requirement | S520 Reference | Severity | Check |
|---|------------|----------------|----------|-------|
| 1 | Mould assessment by qualified assessor | S520 §8 | CRITICAL | Was mould assessment performed by an IICRC AMRT or equivalent? |
| 2 | Moisture source identified and resolved | S520 §9 | CRITICAL | Has the water source causing mould growth been identified and rectified? |
| 3 | Containment type documented | S520 §12 | CRITICAL | Is containment level specified (limited / full) with method? |
| 4 | Negative air pressure maintained | S520 §12.3 | HIGH | Is negative air documented for full containment scenarios? |
| 5 | HEPA filtration used | S520 §13 | HIGH | Are HEPA vacuums and air scrubbers specified? |
| 6 | PPE level appropriate | S520 §11 | HIGH | Is PPE level (1/2/3/4) appropriate for contamination level? |
| 7 | Removal method documented | S520 §14 | HIGH | Are removal methods specified (abrasive, wire brush, demolition)? |
| 8 | Disposal procedures followed | S520 §15 | MEDIUM | Are contaminated materials bagged and disposed per regulations? |
| 9 | Post-remediation verification | S520 §16 | CRITICAL | Was visual clearance and/or air sampling performed? |
| 10 | Clearance criteria met | S520 §16.3 | CRITICAL | Do post-remediation results meet clearance standards? |

### Containment Levels

| Level | When Required | Requirements |
|-------|--------------|--------------|
| **Limited** | < 10 m² affected, no HVAC contamination | Poly sheeting, HEPA vacuum, dust suppression |
| **Full** | > 10 m², HVAC involved, or immuno-compromised occupants | Sealed poly enclosure, negative air, HEPA air scrubber, decontamination chamber |

---

## Compliance Report Format

```markdown
# IICRC Compliance Audit Report

**Job Number**: RA-XXXXX
**Audit Date**: DD/MM/YYYY
**Auditor**: [Name]
**Standard**: [S500 / S520 / Both]

## Overall Compliance Score

**Score**: [X] / [Total] requirements met
**Rating**: [COMPLIANT / PARTIALLY COMPLIANT / NON-COMPLIANT]

| Severity | Passed | Failed | Total |
|----------|--------|--------|-------|
| CRITICAL | [X]    | [X]    | [X]   |
| HIGH     | [X]    | [X]    | [X]   |
| MEDIUM   | [X]    | [X]    | [X]   |

## Non-Conformances

### CRITICAL

| # | Requirement | Finding | Remediation |
|---|------------|---------|-------------|
| [X] | [Requirement] | [What is missing/wrong] | [What needs to be done] |

### HIGH

| # | Requirement | Finding | Remediation |
|---|------------|---------|-------------|
| [X] | [Requirement] | [What is missing/wrong] | [What needs to be done] |

### MEDIUM

| # | Requirement | Finding | Remediation |
|---|------------|---------|-------------|
| [X] | [Requirement] | [What is missing/wrong] | [What needs to be done] |

## Passed Requirements

| # | Requirement | Evidence |
|---|------------|----------|
| [X] | [Requirement] | [Where the evidence is documented] |

## Recommendations
1. [Prioritised list of actions to achieve compliance]

## Summary
[2-3 sentence summary of compliance status and critical actions required]
```

---

## Example Input

```json
{
  "job_number": "RA-10038",
  "standard": "S500",
  "documentation": {
    "category": 2,
    "class": null,
    "category_justification": "Washing machine overflow — grey water",
    "escalation_assessed": false,
    "moisture_readings": [
      { "location": "Laundry floor", "reading": 65, "instrument": null, "dry_standard": null }
    ],
    "ambient_conditions": null,
    "photos": 3,
    "drying_goals": null,
    "equipment": ["2 fans"],
    "monitoring_logs": false,
    "antimicrobial": "Applied spray",
    "ppe_documented": false,
    "contents_inventory": false,
    "pre_existing_noted": false,
    "final_readings": null,
    "inspector_credentials": "John Smith"
  }
}
```

---

## Example Output

```markdown
# IICRC Compliance Audit Report

**Job Number**: RA-10038
**Audit Date**: 05/03/2026
**Auditor**: RestoreAssist Compliance Engine
**Standard**: IICRC S500

## Overall Compliance Score

**Score**: 3 / 15 requirements met
**Rating**: NON-COMPLIANT

| Severity | Passed | Failed | Total |
|----------|--------|--------|-------|
| CRITICAL | 1      | 3      | 4     |
| HIGH     | 1      | 5      | 6     |
| MEDIUM   | 1      | 4      | 5     |

## Non-Conformances

### CRITICAL

| # | Requirement | Finding | Remediation |
|---|------------|---------|-------------|
| 2 | Damage class (1–4) | No damage class specified | Assess and document damage class based on affected materials and area percentage |
| 4 | Moisture readings with instrument | Instrument type not recorded; no dry standard specified | Record instrument make/model and include dry standard for each material |
| 14 | Completion criteria met | No final moisture readings provided | Take final readings at all monitoring points and confirm below dry standard |

### HIGH

| # | Requirement | Finding | Remediation |
|---|------------|---------|-------------|
| 3 | Category escalation assessment | Not assessed — Cat 2 may escalate if >48 hrs | Document time elapsed and reassess category |
| 5 | Ambient conditions | No temperature or RH recorded | Record ambient and external temp/RH at each visit |
| 7 | Drying goals established | No target moisture levels defined | Set drying goals based on dry standards for each material |
| 9 | Daily monitoring logs | No monitoring logs provided | Implement daily moisture logging at consistent points |
| 10 | Antimicrobial treatment record | "Applied spray" — no product name, concentration, or method | Document product name, dilution ratio, application method, and areas treated |

### MEDIUM

| # | Requirement | Finding | Remediation |
|---|------------|---------|-------------|
| 8 | Equipment type and placement | "2 fans" — no equipment type, model, or placement documented | Specify equipment type (dehumidifier, air mover), quantity, and placement |
| 11 | PPE appropriate to category | No PPE documentation for Category 2 job | Cat 2 requires N95 respirator, gloves, safety glasses — document PPE used |
| 12 | Contents inventory | No contents inventory | List affected contents with condition and disposition |
| 13 | Pre-existing conditions | Not documented | Note whether pre-existing conditions were observed or not |

## Passed Requirements

| # | Requirement | Evidence |
|---|------------|----------|
| 1 | Water category classification | Category 2 specified with justification (washing machine overflow) |
| 6 | Photo documentation | 3 photos provided (recommend minimum 10) |
| 15 | Inspector credentials | Inspector name provided (recommend adding IICRC cert number) |

## Recommendations
1. **Immediate**: Add damage class, take and document final moisture readings with instrument details
2. **Immediate**: Document antimicrobial product, concentration, and application method
3. **Before submission**: Add ambient conditions, drying goals, and daily monitoring logs
4. **Process improvement**: Implement RestoreAssist inspection report template to prevent future gaps

## Summary
Job RA-10038 is NON-COMPLIANT with IICRC S500. Three critical non-conformances
require immediate remediation: missing damage class, incomplete moisture readings,
and no final dry-out confirmation. Five high-severity gaps in ambient conditions,
escalation assessment, drying goals, monitoring, and antimicrobial documentation
must be addressed before insurer submission.
```

---

## Severity Definitions

| Severity | Definition | Action |
|----------|-----------|--------|
| **CRITICAL** | Missing documentation that will cause claim rejection or regulatory issue | Must remediate before submission |
| **HIGH** | Missing documentation that will trigger assessor queries and delays | Should remediate before submission |
| **MEDIUM** | Best practice gaps that may affect professional credibility | Recommended to remediate |

---

## Anti-Patterns

| Pattern | Problem | Correct Approach |
|---------|---------|------------------|
| "Looks compliant" without checking each item | False confidence, gaps missed | Check every requirement in the matrix |
| Assuming compliance from partial data | "Category specified" does not mean classification is complete | Check for justification, class, and escalation |
| Accepting vague documentation as evidence | "Applied treatment" is not evidence | Require specific product, method, area, date |
| Skipping S520 for Cat 3 jobs | Mould risk requires S520 compliance check | Always run S520 matrix for Cat 3 and mould jobs |

---

## Checklist

- [ ] Correct standard identified (S500, S520, or both)
- [ ] Every requirement in the matrix checked
- [ ] Non-conformances categorised by severity
- [ ] Specific remediation actions provided for each gap
- [ ] Passed requirements documented with evidence reference
- [ ] Overall compliance rating calculated
- [ ] Category-specific requirements checked

---

## Response Format

```
[AGENT_ACTIVATED]: RestoreAssist IICRC Compliance Check
[PHASE]: {Audit | Report Generation | Review}
[STATUS]: {in_progress | complete}

{compliance report output}

[NEXT_ACTION]: {what to do next}
```
