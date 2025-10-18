# RestoreAssist Documentation Generator Skill

## Overview

This skill enhances Claude's ability to generate professional, Australian-compliant damage assessment documentation for the RestoreAssist platform. It ensures all generated reports meet industry standards, comply with NCC 2022, and follow Australian building codes.

## Purpose

Generate comprehensive, accurate, and professionally formatted damage assessment reports for disaster restoration projects across Australia, with specific focus on:

- Australian building standards (NCC 2022)
- State-specific regulations (NSW, VIC, QLD, WA, SA, TAS, ACT, NT)
- Insurance industry requirements
- Professional restoration terminology
- Accurate cost estimation in AUD
- Compliance documentation

## Capabilities

### 1. Report Generation
- Generate detailed damage assessment reports
- Create itemized cost estimates
- Produce scope of work documentation
- Generate Authority to Proceed documents

### 2. Compliance Verification
- Ensure NCC 2022 compliance
- Verify state-specific building regulations
- Include appropriate safety standards
- Document required permits and approvals

### 3. Cost Estimation
- Australian market-accurate pricing
- Labor cost calculations
- Material cost breakdowns
- Equipment and disposal costs
- GST calculations

### 4. Technical Documentation
- Detailed scope of work
- Material specifications
- Work methodology
- Timeline estimates
- Risk assessments

## Input Requirements

The skill expects structured input with the following fields:

```json
{
  "propertyAddress": "string (required)",
  "damageType": "water | fire | storm | flood | mold (required)",
  "damageDescription": "string (required, detailed description)",
  "state": "NSW | VIC | QLD | WA | SA | TAS | ACT | NT (required)",
  "clientName": "string (optional)",
  "insuranceCompany": "string (optional)",
  "claimNumber": "string (optional)"
}
```

## Output Format

The skill generates a structured report with:

1. **Executive Summary**
   - Concise overview of damage
   - Total estimated cost
   - Urgency assessment
   - Recommended immediate actions

2. **Scope of Work**
   - Detailed work breakdown
   - Sequential task ordering
   - Estimated timeframes
   - Required trades/specialists

3. **Itemized Estimate**
   - Line-by-line cost breakdown
   - Quantities and unit costs
   - Material specifications
   - Labor rates
   - Equipment costs
   - Subtotals by category

4. **Compliance Notes**
   - NCC 2022 references
   - State-specific requirements
   - Required permits
   - Safety standards
   - Building codes

5. **Authority to Proceed**
   - Professional ATP document
   - Liability disclaimers
   - Scope limitations
   - Payment terms
   - Signature blocks

## Australian Standards Reference

### NCC 2022 Compliance
- Volume One: Class 2-9 buildings
- Volume Two: Class 1 and 10 buildings
- Section J: Energy efficiency
- Part 3.7: Fire safety
- Part 3.8: Health and amenity

### State-Specific Regulations

**NSW**
- Environmental Planning and Assessment Act 1979
- Building Code of Australia (BCA)
- NSW Building Professionals Act 2005

**VIC**
- Building Act 1993
- Building Regulations 2018
- Victorian Building Authority requirements

**QLD**
- Queensland Building and Construction Commission Act
- Building Act 1975
- Plumbing and Drainage Act 2018

**WA**
- Building Act 2011
- Building Regulations 2012
- Western Australian Building Services Board

**SA**
- Development Act 1993
- Building Work Contractors Act 1995
- SA Building Rules

**TAS**
- Building Act 2016
- Building Regulations 2016
- Tasmanian Building Regulations

**ACT**
- Building Act 2004
- Building (General) Regulation 2008

**NT**
- Building Act 1993
- Building Regulations

## Damage Type Specific Knowledge

### Water Damage
- Emergency water extraction
- Structural drying protocols
- Moisture testing requirements
- Mold prevention measures
- Material replacement standards
- Typical costs: $2,000 - $15,000+

### Fire Damage
- Structural integrity assessment
- Smoke and soot removal
- HVAC cleaning
- Odor elimination
- Material disposal
- Typical costs: $10,000 - $100,000+

### Storm Damage
- Roof and structural repairs
- Water ingress prevention
- Emergency boarding
- Tree removal
- Temporary protection
- Typical costs: $5,000 - $50,000+

### Flood Damage
- Category 3 water protocols
- Contamination assessment
- Complete material removal
- Sanitization requirements
- Foundation assessment
- Typical costs: $15,000 - $150,000+

### Mold Damage
- Air quality testing
- Containment procedures
- Remediation protocols
- Source elimination
- Post-remediation verification
- Typical costs: $3,000 - $30,000+

## Cost Database (2024 Australian Market)

### Labor Rates (per hour, excl GST)
- General laborer: $45 - $65
- Carpenter: $65 - $95
- Plumber: $80 - $120
- Electrician: $85 - $125
- Painter: $50 - $75
- Restoration specialist: $75 - $110

### Material Costs (common items, excl GST)
- Gyprock (standard): $8 - $15 per sqm
- Paint (quality): $35 - $65 per liter
- Carpet (mid-range): $35 - $85 per sqm
- Timber flooring: $65 - $150 per sqm
- Insulation: $8 - $25 per sqm

### Equipment (daily hire rates, excl GST)
- Dehumidifier (commercial): $45 - $85
- Air mover: $25 - $45
- Moisture meter: $15 - $30
- HEPA vacuum: $35 - $65
- Air scrubber: $55 - $95

## Quality Standards

### Report Must Include:
- ✓ Accurate property identification
- ✓ Comprehensive damage description
- ✓ Realistic cost estimates
- ✓ Appropriate NCC references
- ✓ State-specific compliance
- ✓ Professional terminology
- ✓ Clear scope of work
- ✓ Itemized breakdown
- ✓ Timeline estimates
- ✓ Safety considerations

### Report Must Avoid:
- ✗ Vague or generic descriptions
- ✗ Unrealistic pricing
- ✗ Missing compliance references
- ✗ Unclear scope
- ✗ Incomplete itemization
- ✗ Non-Australian standards
- ✗ Spelling/grammar errors
- ✗ Inconsistent formatting

## Tone and Style

- **Professional**: Industry-standard terminology
- **Authoritative**: Based on codes and standards
- **Clear**: Easy to understand for clients and insurers
- **Detailed**: Comprehensive without being verbose
- **Objective**: Factual assessment without bias

## Examples

See the accompanying `examples.json` file for sample inputs and expected outputs.

## Integration

This skill is automatically invoked for all report generation requests in the RestoreAssist system. It can be used via:

1. **Backend API**: POST /api/reports
2. **SDK**: `client.reports.generate()`
3. **Direct integration**: Via Claude service with skill attachment

## Version

- **Version**: 1.0.0
- **Last Updated**: 2024-01
- **Compatible with**: Claude Opus 4, Sonnet 4
- **NCC Version**: 2022
- **Market Data**: Q1 2024

## Maintenance

This skill should be updated:
- Annually: NCC updates, building code changes
- Quarterly: Cost database updates, market rates
- As needed: State regulation changes, new compliance requirements
