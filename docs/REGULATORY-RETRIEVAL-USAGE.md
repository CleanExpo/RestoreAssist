# Regulatory Retrieval Service - Usage Guide

## Overview

The regulatory retrieval service (`lib/regulatory-retrieval.ts`) retrieves Australian regulatory documents and citations from the Prisma database for inclusion in restoration reports. It provides:

- **Feature flag control** via `ENABLE_REGULATORY_CITATIONS` environment variable
- **Graceful degradation** - returns empty context on errors (never throws)
- **State-specific regulations** - QLD, NSW, VIC, SA, WA, TAS, ACT, NT
- **Multi-source citations** - Building codes, electrical, plumbing, HVAC, consumer law, insurance
- **Backward compatibility** - works seamlessly with existing report generation

## Quick Start

### Basic Usage

```typescript
import { retrieveRegulatoryContext, RegulatoryQuery } from '@/lib/regulatory-retrieval'

// 1. Create a query with optional regulatory context
const query: RegulatoryQuery = {
  reportType: 'water',
  waterCategory: '1',
  state: 'QLD',
  postcode: '4000',
  materials: ['drywall', 'carpet'],
  requiresElectricalWork: true,
}

// 2. Retrieve regulatory context (feature flag checked automatically)
const context = await retrieveRegulatoryContext(query, apiKey)

// 3. Check if retrieval was successful
if (context.retrievalSuccess) {
  console.log('Building Code Requirements:', context.buildingCodeRequirements)
  console.log('Electrical Requirements:', context.electricalRequirements)
  console.log('Insurance Requirements:', context.insuranceRequirements)
} else {
  console.log('Regulatory feature disabled or retrieval failed')
  // Report generation continues normally - graceful degradation
}
```

### Feature Flag Control

The service respects the `ENABLE_REGULATORY_CITATIONS` environment variable:

```bash
# Development (disabled by default for safety)
ENABLE_REGULATORY_CITATIONS=false

# Production rollout (enable when tested)
ENABLE_REGULATORY_CITATIONS=true
```

When disabled, `retrieveRegulatoryContext()` returns an empty context immediately:

```typescript
{
  documents: [],
  summary: '',
  applicableLaws: [],
  buildingCodeRequirements: [],
  electricalRequirements: [],
  plumbingRequirements: [],
  hvacRequirements: [],
  insuranceRequirements: [],
  consumerProtections: [],
  retrievalSuccess: false,
  retrievalMethod: 'failed',
  errors: ['Regulatory citations feature is disabled']
}
```

## Query Parameters

### RegulatoryQuery Interface

```typescript
interface RegulatoryQuery {
  // Required - report type
  reportType: 'water' | 'mould' | 'fire' | 'commercial'

  // Optional - water damage context
  waterCategory?: '1' | '2' | '3'
  materials?: string[]
  affectedAreas?: string[]

  // Optional - regulatory context (NEW)
  state?: string                    // QLD, NSW, VIC, SA, WA, TAS, NT, ACT
  postcode?: string
  insurerName?: string
  propertyType?: 'residential' | 'commercial'
  requiresElectricalWork?: boolean
  keywords?: string[]
}
```

### All Parameters Optional

All parameters are optional for backward compatibility:

```typescript
// Minimal query (IICRC standards only)
const minimalQuery: RegulatoryQuery = {
  reportType: 'water'
}

// Full query (with regulatory context)
const fullQuery: RegulatoryQuery = {
  reportType: 'water',
  waterCategory: '2',
  state: 'NSW',
  postcode: '2000',
  materials: ['wood', 'concrete'],
  requiresElectricalWork: true,
  insurerName: 'IAG',
  propertyType: 'residential'
}
```

## Response Structure

### RegulatoryContext

```typescript
interface RegulatoryContext {
  // Document references with citations
  documents: Array<{
    name: string                    // e.g., "NCC 2025"
    documentType: string            // e.g., "BUILDING_CODE_NATIONAL"
    documentCode?: string           // e.g., "NCC 2025"
    relevantSections: string[]      // Section references
    citations: Array<{
      reference: string             // "NCC 2025 Sec 3.2.1"
      text: string                  // Citation text
      type: string                  // 'building_code', 'electrical', etc.
    }>
    jurisdiction?: string           // State code if applicable
  }>

  // Unified summaries by category
  summary: string
  applicableLaws: string[]
  buildingCodeRequirements: string[]
  electricalRequirements: string[]
  plumbingRequirements: string[]
  hvacRequirements: string[]
  insuranceRequirements: string[]
  consumerProtections: string[]

  // State-specific notes
  stateRequirements?: string

  // Status tracking
  retrievalSuccess: boolean
  retrievalMethod: 'database' | 'google_drive' | 'hybrid' | 'failed'
  errors?: string[]
}
```

## Usage Examples

### Water Damage - Queensland

```typescript
const query: RegulatoryQuery = {
  reportType: 'water',
  waterCategory: '1',
  state: 'QLD',
  postcode: '4000',
  materials: ['drywall', 'carpet', 'plumbing'],
  requiresElectricalWork: true,
}

const context = await retrieveRegulatoryContext(query, apiKey)

// Returns:
// - NCC 2025 (National Construction Code)
// - QDC 4.5 (Queensland Development Code - state-specific)
// - AS/NZS 3000 (Electrical standards)
// - AS/NZS 3500 (Plumbing standards)
// - AS 1668 (Ventilation standards)
// - Consumer Law requirements
// - Insurance compliance notes
// - Climate-specific drying times (subtropical Queensland)
```

### Mould Remediation - New South Wales

```typescript
const query: RegulatoryQuery = {
  reportType: 'mould',
  state: 'NSW',
  postcode: '2000',
  materials: ['wood', 'insulation'],
}

const context = await retrieveRegulatoryContext(query, apiKey)

// Returns:
// - NSW Building Code
// - Work Health & Safety requirements
// - HVAC standards for dehumidification
// - Consumer protection guidelines
// - State-specific climate notes
```

### Commercial Fire Restoration - Victoria

```typescript
const query: RegulatoryQuery = {
  reportType: 'fire',
  state: 'VIC',
  postcode: '3000',
  propertyType: 'commercial',
  requiresElectricalWork: true,
}

const context = await retrieveRegulatoryContext(query, apiKey)

// Returns:
// - VIC Building Regulations
// - Electrical safety standards (AS/NZS 3000)
// - Insurance requirements for commercial properties
// - Consumer protection obligations
// - OH&S compliance requirements
```

## Formatting for Report Generation

### Convert Context to Prompt Text

Use the helper function to format context for AI integration:

```typescript
import { formatRegulatoryContextForPrompt } from '@/lib/regulatory-retrieval'

const context = await retrieveRegulatoryContext(query, apiKey)
const promptText = formatRegulatoryContextForPrompt(context)

// Use in report generation prompt:
const prompt = `
Generate restoration scope based on these regulations:

${promptText}

${existingPromptContent}
`
```

### Extract Citations for PDF

Use the helper function to get citations formatted for PDF:

```typescript
import { extractCitationsFromContext } from '@/lib/regulatory-retrieval'

const context = await retrieveRegulatoryContext(query, apiKey)
const citations = extractCitationsFromContext(context)

// Format for PDF scope items:
citations.forEach(citation => {
  console.log(`${citation.reference}: ${citation.text}`)
})

// Output:
// NCC 2025 Sec 3.2.1: Moisture content shall not exceed 15%
// QDC 4.5 Sec 3.2.1: Subtropical climate drying: 5-14 days standard
// AS/NZS 3000 Sec 2.4: Equipment testing after water damage
// ...
```

## Integration with Report Generation

### In API Route

```typescript
// app/api/reports/[id]/generate-forensic-pdf/route.ts

import { retrieveRegulatoryContext } from '@/lib/regulatory-retrieval'

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  // ... existing code ...

  // Get existing standards context (unchanged)
  const standardsContext = await retrieveRelevantStandards(...)

  // Get optional regulatory context (feature flag controlled)
  let regulatoryContext = null
  if (process.env.ENABLE_REGULATORY_CITATIONS === 'true') {
    try {
      const regulatoryQuery: RegulatoryQuery = {
        reportType: retrievalReportType,
        waterCategory: report.waterCategory,
        state: getStateCodeFromPostcode(report.propertyPostcode),
        postcode: report.propertyPostcode,
        insurerName: report.insurerName,
        requiresElectricalWork: report.electricalWorkRequired
      }

      regulatoryContext = await retrieveRegulatoryContext(
        regulatoryQuery,
        integration.apiKey
      )
    } catch (error) {
      console.error('Regulatory context failed, continuing:', error)
      // Graceful degradation - report generation continues
    }
  }

  // Merge contexts (regulatory is optional)
  const completeContext = {
    ...standardsContext,
    ...(regulatoryContext || {})
  }

  // Generate PDF with merged context
  const pdf = await generateForensicReportPDF(reportData, completeContext)

  return new Response(pdf)
}
```

## State-Specific Behavior

### Climate-Aware Drying Times

The service includes climate-specific drying time standards for each state:

| State | Climate | Standard Drying | Dense Materials |
|-------|---------|-----------------|-----------------|
| QLD | Subtropical (70%+ RH) | 5-14 days | 14-28 days |
| NSW | Coastal/Inland (40-70% RH) | 7-14 days | 14-28 days |
| VIC | Temperate (35-65% RH) | 10-18 days | 18-35 days |
| SA | Arid (25-50% RH) | 5-10 days | 10-20 days |
| WA | Regional (varies) | 7-28 days | 14-35 days |
| TAS | Cool/Wet (50-75% RH) | 14-21 days | 21-40+ days |
| ACT | Temperate Inland (30-60% RH) | 8-15 days | 15-28 days |
| NT | Extreme Variation | 3-30 days | 8-40+ days |

### Multi-State Queries

Query multiple states to compare requirements:

```typescript
const states = ['QLD', 'NSW', 'VIC']

for (const state of states) {
  const query: RegulatoryQuery = {
    reportType: 'water',
    state,
    waterCategory: '2',
  }

  const context = await retrieveRegulatoryContext(query, apiKey)
  console.log(`${state} requirements:`, context.stateRequirements)
}
```

## Error Handling

### Graceful Degradation

The service never throws errors. Instead, it returns a context with `retrievalSuccess: false`:

```typescript
try {
  const context = await retrieveRegulatoryContext(query, apiKey)

  if (context.retrievalSuccess) {
    // Use regulatory context
    console.log('Building Code:', context.buildingCodeRequirements)
  } else {
    // Regulatory feature not available
    console.log('Using IICRC standards only')
    // Report continues with existing IICRC standards
  }
} catch (error) {
  // Should never reach here - service handles all errors gracefully
  console.error('Unexpected error:', error)
}
```

### Common Scenarios

```typescript
// Feature flag disabled
retrieveRegulatoryContext(query)
// → context.errors: ['Regulatory citations feature is disabled']

// Database unavailable (during seeding or connection issues)
retrieveRegulatoryContext(query)
// → context.errors: ['Error retrieving regulatory documents from database: ...']
// → context.retrievalSuccess: false
// → context.documents: []

// Invalid state provided
retrieveRegulatoryContext({ reportType: 'water', state: 'INVALID' })
// → Returns empty context (valid structure, no documents)
// → context.retrievalSuccess: false
```

## Testing

### Run Test Suite

```bash
# Run all regulatory retrieval tests
npm test -- regulatory-retrieval.test.ts

# Run specific test
npm test -- regulatory-retrieval.test.ts -t "water damage"

# Watch mode
npm test -- regulatory-retrieval.test.ts --watch
```

### Sample Test Queries

The test file includes sample queries for manual testing:

```typescript
import { SAMPLE_QUERIES } from '@/lib/regulatory-retrieval.test'

// Use in manual testing
const waterDamage = SAMPLE_QUERIES.waterDamageQLD
const context = await retrieveRegulatoryContext(waterDamage, apiKey)
```

## Performance Considerations

### Database Queries

The service uses efficient Prisma queries:

- Limits to top 8 documents per query
- Limits to top 3 sections per document
- Limits to top 2 citations per document
- Uses proper indexes on documentType, jurisdiction, keywords

### Caching Strategy (Future)

For production optimization:

```typescript
// Future: Add Redis/memory caching
const cachedContext = await cache.get(`regulatory-${query.state}-${query.reportType}`)

if (cachedContext) {
  return cachedContext
}

const context = await retrieveRegulatoryContext(query)

// Cache for 24 hours
await cache.set(`regulatory-${query.state}-${query.reportType}`, context, { ttl: 86400 })
```

## Troubleshooting

### No Regulatory Documents Found

**Cause:** Database not seeded
**Fix:** Run seeding script
```bash
npm run db:seed:regulatory
```

### Feature Flag Not Working

**Cause:** Environment variable not set
**Fix:** Check .env.local
```bash
ENABLE_REGULATORY_CITATIONS=true
```

### AI Summary Missing

**Cause:** Anthropic API key not provided
**Fix:** Pass API key or set environment variable
```typescript
const context = await retrieveRegulatoryContext(query, apiKey)
```

### Performance Issues

**Cause:** Too many documents retrieved
**Fix:** Add more specific filters in determineRelevantRegulations()

## Migration Path

### Phase 1: Feature Flag OFF (Current)
- Database seeded with 17 regulatory documents
- Retrieval service created
- Feature flag disabled by default
- **Zero impact** on existing reports

### Phase 2: Feature Flag ON for Testing
- Enable in development environment
- Test with sample reports
- Verify citation accuracy (target: 95%+)

### Phase 3: Gradual Production Rollout
- Enable for specific test users
- Monitor error rates and performance
- Collect feedback on citations

### Phase 4: Full Rollout
- Enable for all users
- Monitor usage and citation quality
- Prepare Phase 6 update system

## Next Steps

1. **Phase 4:** Create citation engine (`lib/citation-engine.ts`)
2. **Phase 5:** Integrate with report PDF generation
3. **Phase 6:** Implement update system for regulatory documents
4. **Phase 7:** Test across all states and scenarios
5. **Phase 8:** Create production documentation

## Support

For issues or questions:
- Check `docs/REGULATORY-INTEGRATION.md` for architecture
- Review `lib/regulatory-retrieval.test.ts` for examples
- See `CLAUDE.md` for quick reference
