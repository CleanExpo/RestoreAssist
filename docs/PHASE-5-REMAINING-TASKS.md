# Phase 5: Remaining Tasks (5b, 5c, 5d)

## Overview

Phase 5a is complete (enhanced buildScopeItems with regulatory citations). The remaining tasks require:

1. **5b:** Add "Regulatory Compliance Summary" section to PDF rendering
2. **5c:** Update API route to retrieve regulatory context
3. **5d:** Test with feature flag OFF for backward compatibility

## Phase 5b: Regulatory Compliance Summary Section

### What to Build

A new optional PDF section that appears when `regulatoryContext.retrievalSuccess === true`:

```
┌─────────────────────────────────────────────┐
│  REGULATORY COMPLIANCE SUMMARY              │
├─────────────────────────────────────────────┤
│  Applicable Standards & Requirements        │
│                                             │
│  Building Code (National):                  │
│  - NCC 2025 Section 3.2.1 (Moisture Mgmt)   │
│                                             │
│  State-Specific (QLD):                      │
│  - QDC 4.5 Section 3.2 (Subtropical Climate)│
│  - Recommended Drying Time: 5-14 days       │
│                                             │
│  Electrical Standards:                      │
│  - AS/NZS 3000 Section 2.4 (Safety Post-   │
│    Water Damage)                            │
│                                             │
│  Consumer Protection:                       │
│  - Australian Consumer Law (Schedule 2)     │
│  - General Insurance Code of Practice       │
│                                             │
│  Safety Requirements:                       │
│  - Work Health & Safety Act 2011            │
└─────────────────────────────────────────────┘
```

### Implementation Steps

1. **Create helper function to render compliance section:**

```typescript
// In lib/generate-forensic-report-pdf.ts

function buildRegulatoryComplianceSectionData(
  regulatoryContext: any,
  report: any
): string {
  if (!regulatoryContext?.retrievalSuccess) {
    return ''
  }

  const sections: string[] = []

  // National building code
  if (regulatoryContext.buildingCodeRequirements) {
    sections.push(`Building Codes: ${regulatoryContext.buildingCodeRequirements.slice(0, 2).join(', ')}`)
  }

  // State-specific
  if (regulatoryContext.stateRequirements) {
    sections.push(`State Requirements: ${regulatoryContext.stateRequirements}`)
  }

  // Electrical
  if (regulatoryContext.electricalRequirements) {
    sections.push(`Electrical: ${regulatoryContext.electricalRequirements.slice(0, 1).join(', ')}`)
  }

  // Consumer protection
  if (regulatoryContext.consumerProtections) {
    sections.push(`Consumer Protection: ${regulatoryContext.consumerProtections.slice(0, 1).join(', ')}`)
  }

  // Safety
  if (regulatoryContext.applicableLaws) {
    sections.push(`Safety Requirements: ${regulatoryContext.applicableLaws.slice(0, 1).join(', ')}`)
  }

  return sections.join('\n')
}
```

2. **Add section to PDF rendering (after scope items, before moisture data):**

```typescript
// In generateForensicReportPDF function

// Add Regulatory Compliance Summary if available
const regulatoryComplianceData = buildRegulatoryComplianceSectionData(
  data.regulatoryContext,
  report
)

if (regulatoryComplianceData) {
  // Render new section
  // Use existing PDF styling (darkBlue header, light gray background)
  // Keep consistent formatting with scope items section
}
```

3. **Styling Guidelines:**
   - Use existing color scheme: darkBlue for headers, lightGray for background
   - Match font sizing with scope items section
   - Add 12pt spacing before/after section
   - Include left margin (50pt) like other sections

### Where in PDF

Current PDF structure:
1. Header (Logo, job ref, dates)
2. Inspection Details
3. **Scope of Work** (scope items)
4. **[NEW] Regulatory Compliance Summary** ← INSERT HERE
5. Moisture Data
6. Psychrometric Assessment
7. Footer

## Phase 5c: Update API Route

File: `app/api/reports/[id]/generate-forensic-pdf/route.ts`

### Current Implementation (Already Updated)

```typescript
// Line 104: buildScopeItems already passes regulatoryContext
const scopeItems = buildScopeItems(data, standardsContext || '', data.regulatoryContext)
```

### What Needs to Be Added (After line 102)

```typescript
// Existing standards retrieval (unchanged)
const standardsContext = await retrieveRelevantStandards(...)

// NEW: Add regulatory context retrieval (feature flag controlled)
let regulatoryContext = null

if (process.env.ENABLE_REGULATORY_CITATIONS === 'true') {
  try {
    const { retrieveRegulatoryContext } = await import('@/lib/regulatory-retrieval')
    const stateCode = getStateCodeFromPostcode(report.propertyPostcode)

    const regulatoryQuery = {
      reportType: retrievalReportType,
      waterCategory: report.waterCategory,
      state: stateCode,
      postcode: report.propertyPostcode,
      insurerName: report.insurerName,
      requiresElectricalWork: report.electricalWorkRequired
    }

    regulatoryContext = await retrieveRegulatoryContext(
      regulatoryQuery,
      integration?.apiKey
    )
  } catch (error) {
    console.error('Failed to retrieve regulatory context:', error)
    // Continue without regulatory context (graceful degradation)
  }
}

// Pass to PDF generator
const pdf = await generateForensicReportPDF({
  ...data,
  regulatoryContext  // NEW
})
```

### Key Points

- Feature flag check prevents even calling retrieval if disabled
- Try-catch ensures API errors don't break report generation
- Graceful degradation: missing context doesn't break anything
- All function signatures already support this change

## Phase 5d: Test Backward Compatibility

### Test Scenarios

**Test 1: Feature Flag OFF**
```bash
# Set env var
ENABLE_REGULATORY_CITATIONS=false

# Generate report
npm run dev
# Access: /dashboard/reports/[id]/generate-forensic-pdf

# Verify:
✓ PDF generates successfully
✓ No regulatory section in PDF
✓ Scope items show ONLY IICRC standards
✓ No errors in console
✓ PDF looks identical to pre-integration version
```

**Test 2: Feature Flag ON, No Database**
```bash
# Set env var
ENABLE_REGULATORY_CITATIONS=true

# Seeding not run (no data in DB)

# Generate report
# Verify:
✓ PDF generates successfully
✓ No regulatory section (no DB data)
✓ Graceful degradation works
✓ No errors in console
```

**Test 3: Feature Flag ON, With Database**
```bash
# Run seeding first
npm run db:seed:regulatory

# Generate report with ENABLE_REGULATORY_CITATIONS=true
# Verify:
✓ Regulatory Compliance Summary section appears
✓ Building codes shown: NCC 2025, QDC 4.5, etc.
✓ State-specific notes included
✓ Citations in proper AGLC4 format
✓ Scope items enhanced with regulatory citations
```

### Automated Test Command

```typescript
// tests/backward-compatibility.test.ts

describe('Backward Compatibility', () => {
  it('generates PDF with feature flag OFF (existing behavior)', async () => {
    process.env.ENABLE_REGULATORY_CITATIONS = 'false'

    const pdf = await generateForensicReportPDF(testData)

    expect(pdf).toBeDefined()
    expect(pdf.length).toBeGreaterThan(0)
    // Verify no regulatory section in PDF
    const pdfText = await extractTextFromPDF(pdf)
    expect(pdfText).not.toContain('Regulatory Compliance')
  })

  it('generates PDF with feature flag ON and valid context', async () => {
    process.env.ENABLE_REGULATORY_CITATIONS = 'true'

    const testDataWithContext = {
      ...testData,
      regulatoryContext: mockRegulatoryContext
    }

    const pdf = await generateForensicReportPDF(testDataWithContext)

    expect(pdf).toBeDefined()
    const pdfText = await extractTextFromPDF(pdf)
    expect(pdfText).toContain('Regulatory Compliance')
  })
})
```

## Dependencies Already in Place

✅ All supporting services are complete and tested:

- `lib/regulatory-retrieval.ts` - Retrieves regulatory context
- `lib/citation-engine.ts` - Generates citations
- `lib/citation-formatter.ts` - AGLC4 formatting
- Database seeding script - 17 documents ready
- Feature flag system - ENABLE_REGULATORY_CITATIONS
- Test suite - Sample queries available

## Estimated Implementation Time

| Task | Effort | Notes |
|------|--------|-------|
| 5b - PDF section | 2-3 hours | Rendering code mostly straightforward |
| 5c - API route | 0.5 hour | Already partially done, just needs to be tied together |
| 5d - Testing | 1-2 hours | Manual tests + automated test suite |
| **Total** | **3.5-5.5 hours** | Straightforward implementation |

## Rollout Strategy

### Week 1: Development
- Implement 5b-5d changes
- Thorough testing with feature flag OFF
- Verify backward compatibility

### Week 2: Staging
- Enable feature flag in staging environment
- Test with multiple reports
- Verify citation accuracy (target: 95%+)

### Week 3: Production
- Keep feature flag OFF by default
- Deploy to production (no visible changes)
- Monitor error rates

### Week 4: Gradual Rollout
- Enable for 10% of users (feature flag A/B test)
- Monitor usage and accuracy
- If stable, enable for all users

## Success Criteria

✅ Phase 5 Complete When:
- PDF section renders correctly when data available
- No PDF rendering when feature flag OFF
- All backward compatibility tests pass
- Citation accuracy validated (95%+)
- No errors in production logs
- Performance impact <100ms per PDF

## Notes for Next Developer

If implementing Phase 5b-5d, use this checklist:

- [ ] Read PHASE-5-INTEGRATION-SUMMARY.md for context
- [ ] Understand enhanced ScopeItem interface
- [ ] Test with feature flag OFF before ON
- [ ] Use graceful degradation pattern
- [ ] Add comprehensive error handling
- [ ] Test with actual database seeding
- [ ] Verify AGLC4 citation format
- [ ] Run backward compatibility tests
- [ ] Update CLAUDE.md after completion
