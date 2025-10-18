# Australian English Style Guide

This document outlines the Australian English spelling and terminology used throughout the RestoreAssist application.

## Spelling Differences from US English

### Common Words

| US English | Australian English | Usage in RestoreAssist |
|------------|-------------------|------------------------|
| labor | **labour** | labour rates, labour costs |
| color | **colour** | colour scheme |
| center | **centre** | business centre |
| meter | **metre** | square metre, cubic metre |
| fiber | **fibre** | fibre cement, fibre board |
| mold | **mould** | mould damage, mould remediation |
| gray | **grey** | grey water |
| aluminum | **aluminium** | aluminium windows |
| analyze | **analyse** | analyse damage |
| organize | **organise** | organise reports |
| recognize | **recognise** | recognise patterns |
| realize | **realise** | realise cost savings |
| optimize | **optimise** | optimise processes |
| itemize | **itemise** | itemised estimates |
| categorize | **categorise** | categorised by type |
| finalize | **finalise** | finalise reports |

### Building & Construction Terms

| US English | Australian English | Context |
|------------|-------------------|---------|
| drywall | **plasterboard / gyprock** | Wall materials |
| lumber | **timber** | Building materials |
| hardware store | **hardware shop** | Supplier reference |
| apartment | **unit / flat** | Residential property |
| sidewalk | **footpath** | Property access |
| trash | **rubbish / waste** | Disposal |
| garbage | **rubbish** | Waste removal |
| check (noun) | **cheque** | Payment |
| program | **programme** (some contexts) | Work programme |

### Professional Terms

| US English | Australian English | RestoreAssist Usage |
|------------|-------------------|---------------------|
| defense | **defence** | defence against water |
| offense | **offence** | - |
| license (noun) | **licence** | building licence |
| license (verb) | **license** | licensed contractor |
| practice (noun) | **practice** | best practice |
| practice (verb) | **practise** | practise safety |

## Currency & Measurements

### Currency
- Always use **AUD** not USD
- Format: **$8,750 AUD** or **$8,750 (excl. GST)**
- Include GST status where applicable

### Measurements
- Use **metric system** exclusively
  - Square metres (sqm or m²)
  - Cubic metres (m³)
  - Millimetres (mm)
  - Centimetres (cm)
  - Metres (m)
  - Kilometres (km)
  - Kilograms (kg)
  - Litres (L)

## Australian-Specific Terminology

### States & Territories
Always use official abbreviations:
- **NSW** - New South Wales
- **VIC** - Victoria
- **QLD** - Queensland
- **WA** - Western Australia
- **SA** - South Australia
- **TAS** - Tasmania
- **ACT** - Australian Capital Territory
- **NT** - Northern Territory

### Building Standards
- **NCC** - National Construction Code (not IBC)
- **BCA** - Building Code of Australia
- **AS/NZS** - Australian/New Zealand Standards

### Government Bodies
- **QBCC** - Queensland Building and Construction Commission
- **VBA** - Victorian Building Authority
- **NSW Fair Trading** - Not "Department of Consumer Affairs"

### Insurance Terms
- **Excess** (not deductible)
- **Claim** (same)
- **Policy holder** (same)
- **Contents insurance** (not "personal property insurance")
- **Building insurance** (not "dwelling insurance")

## Date & Time Formats

### Dates
- **DD/MM/YYYY** (e.g., 15/01/2025)
- **15 January 2025** (written format)
- Never use MM/DD/YYYY

### Time
- **24-hour format** preferred: 14:30
- **12-hour format** acceptable: 2:30 PM (with space before PM)

## RestoreAssist-Specific Terminology

### Reports
- **Itemised estimate** (not itemized)
- **Labour costs** (not labor)
- **Scope of work** (same)
- **Authority to Proceed** (ATP) - capitalised

### Damage Types
- **Water damage**
- **Fire damage**
- **Storm damage**
- **Flood damage**
- **Mould damage** (not mold)

### Professional Roles
- **Restoration specialist**
- **Building inspector**
- **Loss adjuster** (insurance)
- **Claims assessor**
- **Licensed builder**
- **Registered building practitioner**

## Code Style Guide

### Frontend (React/TypeScript)

```typescript
// ✅ Correct - Australian English
const labourCosts = calculateLabour();
const itemisedEstimate = generateItemisedList();
const mouldRemediation = assessMould();

// ❌ Incorrect - US English
const laborCosts = calculateLabor();
const itemizedEstimate = generateItemizedList();
const moldRemediation = assessMold();
```

### Backend (Node.js/TypeScript)

```typescript
// ✅ Correct - Australian English
interface LabourRate {
  description: string;
  hourlyRate: number; // AUD per hour
}

interface ItemisedEstimate {
  items: ReportItem[];
  totalCost: number; // AUD
}

// ❌ Incorrect - US English
interface LaborRate {
  description: string;
  hourlyRate: number; // USD per hour
}
```

### Database Schema

```sql
-- ✅ Correct
CREATE TABLE labour_rates (
  id SERIAL PRIMARY KEY,
  trade VARCHAR(100),
  hourly_rate DECIMAL(10,2), -- AUD
  state VARCHAR(3) -- NSW, VIC, etc.
);

-- ✅ Correct
CREATE TABLE itemised_estimates (
  id SERIAL PRIMARY KEY,
  report_id VARCHAR(50),
  description TEXT,
  total_cost DECIMAL(10,2) -- AUD
);
```

### Comments & Documentation

```typescript
/**
 * Calculate total labour costs for restoration work
 * @param hours - Number of hours worked
 * @param rate - Hourly rate in AUD
 * @returns Total labour cost in AUD (excl. GST)
 */
function calculateLabourCost(hours: number, rate: number): number {
  return hours * rate;
}

/**
 * Generate itemised estimate for damage assessment
 * @param items - Array of report items
 * @returns Itemised estimate with GST calculations
 */
function generateItemisedEstimate(items: ReportItem[]): ItemisedEstimate {
  // Implementation
}
```

## User-Facing Content

### UI Labels
- "Labour Costs" (not "Labor Costs")
- "Itemised Estimate" (not "Itemized Estimate")
- "Mould Remediation" (not "Mold Remediation")
- "Analyse Report" (not "Analyze Report")
- "Optimise Workflow" (not "Optimize Workflow")

### Error Messages
```typescript
// ✅ Correct
"Please enter a valid Australian state (NSW, VIC, QLD, WA, SA, TAS, ACT, NT)"
"Labour rates must be in AUD"
"Itemised estimate is required"

// ❌ Incorrect
"Please enter a valid US state"
"Labor rates must be in USD"
"Itemized estimate is required"
```

### Success Messages
```typescript
// ✅ Correct
"Report generated successfully with NCC 2022 compliance"
"Itemised estimate calculated: $8,750 AUD (excl. GST)"
"Mould assessment complete"

// ❌ Incorrect
"Report generated successfully with IBC compliance"
"Itemized estimate calculated: $8,750 USD"
"Mold assessment complete"
```

## Compliance & Legal

### Building Codes
- Always reference **NCC 2022** (National Construction Code)
- State-specific codes (e.g., NSW Building Code)
- **AS/NZS standards** (Australian/New Zealand Standards)

### Professional Licensing
- "Licensed builder" (not "general contractor")
- "Registered building practitioner"
- "Qualified tradesperson"

### Insurance
- "Excess" (not "deductible")
- "Policy schedule" (not "declaration page")
- "Sum insured" (not "coverage limit")

## Marketing & Communications

### Website Content
- Use Australian English consistently
- Reference Australian locations (Sydney, Melbourne, Brisbane)
- Use AUD for all pricing
- Reference Australian regulations and standards

### Email Templates
```
Subject: Your Damage Assessment Report - $8,750 AUD

Dear [Client],

Your itemised damage assessment report is now ready. The total estimated cost for restoration work is $8,750 AUD (excluding GST).

The report includes:
- Detailed scope of work
- Itemised labour and material costs
- NCC 2022 compliance notes
- State-specific building regulations

Best regards,
RestoreAssist Team
```

## Quality Assurance Checklist

Before releasing any content, verify:

- [ ] All spelling uses Australian English
- [ ] Currency is in AUD
- [ ] Measurements are metric
- [ ] Dates use DD/MM/YYYY format
- [ ] "Mould" not "mold"
- [ ] "Labour" not "labor"
- [ ] "Itemised" not "itemized"
- [ ] "Analyse" not "analyze"
- [ ] "Optimise" not "optimize"
- [ ] "Recognise" not "recognize"
- [ ] State abbreviations are correct (NSW, VIC, etc.)
- [ ] Building codes reference NCC 2022
- [ ] Professional terms are Australian

## Tools & Resources

### Spell Checkers
- Set language to **English (Australia)** or **en-AU**
- VS Code: Set `"cSpell.language": "en-AU"`
- macOS: System Preferences → Keyboard → Text → Spelling → Australian English

### References
- Macquarie Dictionary (Australian standard)
- Australian Government Style Manual
- National Construction Code (NCC) 2022
- Building Code of Australia (BCA)

## Exceptions

Some technical terms remain in US English:
- Programming terms: `color` in CSS/hex codes
- Framework names: React, Node.js (proper nouns)
- Technical specifications: SQL, API, JSON
- Brand names: Claude, Anthropic

---

**Note**: Consistency is key. Always use Australian English throughout the application for a professional, localised experience.
