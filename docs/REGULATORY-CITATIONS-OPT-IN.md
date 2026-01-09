# Regulatory Citations - Client Opt-In Guide

## Overview

Regulatory citations are now **completely optional** for clients. Users can choose whether to include Australian building codes, electrical standards, and compliance requirements in their forensic reports via a simple "Tick and Flick" toggle.

**Key Principle:** IICRC standards (S500, S520) are always included. Regulatory citations are an optional enhancement that clients can choose to add.

---

## User Experience

### Toggle Component (3 Variations)

#### 1. Full Expanded View (Primary Report Generation)
```
┌─ Include Regulatory Citations ✓ ──────────────────┐
│                                                    │
│ Add Australian building codes, electrical         │
│ standards, and compliance requirements             │
│                                                    │
│ What's Included:                                   │
│ • Building Codes: NCC 2025 + state-specific       │
│ • Electrical Standards: AS/NZS 3000               │
│ • Consumer Protection: Australian Consumer Law    │
│ • Insurance Requirements: General Insurance Code  │
│ • State-Specific: Climate-aware drying times      │
│                                                    │
│ Benefits:                                          │
│ ✓ Increases report credibility                    │
│ ✓ Demonstrates compliance with standards          │
│ ✓ Supports insurance claims with citations        │
│ ✓ Professional compliance summary section         │
│                                                    │
└────────────────────────────────────────────────────┘
```

#### 2. Quick Toggle (Report Summary Page)
```
☐ Include regulatory citations (unavailable)
```

#### 3. Modal Toggle (During Report Generation)
```
┌─────────────────────────────┐
│ Regulatory Citations      ⚙️ │
│ Building codes & standards  │
│ included              [●  ] │
└─────────────────────────────┘
```

---

## Implementation

### Step 1: Update Prisma Schema

**File:** `prisma/schema.prisma`

```prisma
model Report {
  // ... existing fields ...

  // NEW: Client preference for regulatory citations
  includeRegulatoryCitations Boolean @default(false)

  // Helpful indexes
  @@index([includeRegulatoryCitations])
}
```

### Step 2: Create Migration

```bash
npx prisma migrate dev --name add_regulatory_citations_preference
```

**Migration File:** `prisma/migrations/20260109_add_regulatory_citations_preference/migration.sql`
- Adds `includeRegulatoryCitations` column (default: false)
- Creates index for performance
- Adds comment for documentation

### Step 3: Add Toggle Component to UI

#### In Report Generation Form

```typescript
// components/report-generation-form.tsx

import { RegulatoryCitationsToggle } from '@/components/regulatory-citations-toggle'
import { useState } from 'react'

export function ReportGenerationForm() {
  const [includeRegulatory, setIncludeRegulatory] = useState(false)

  return (
    <form>
      {/* Existing form fields */}

      {/* NEW: Regulatory Citations Toggle */}
      <RegulatoryCitationsToggle
        enabled={includeRegulatory}
        onChange={setIncludeRegulatory}
        featureFlagEnabled={process.env.NEXT_PUBLIC_ENABLE_REGULATORY === 'true'}
      />

      {/* Rest of form */}
    </form>
  )
}
```

#### In Report Summary Page

```typescript
// components/report-summary.tsx

import { RegulatoryQuickToggle } from '@/components/regulatory-citations-toggle'

export function ReportSummary({ report }) {
  const handleToggle = async (enabled) => {
    await updateReport(report.id, { includeRegulatoryCitations: enabled })
  }

  return (
    <div>
      {/* Report details */}

      <RegulatoryQuickToggle
        checked={report.includeRegulatoryCitations}
        onChange={handleToggle}
        disabled={!featureFlagEnabled}
      />
    </div>
  )
}
```

#### In PDF Generation Modal

```typescript
// components/generate-pdf-modal.tsx

import { RegulatoryToggleInModal } from '@/components/regulatory-citations-toggle'

export function GeneratePdfModal({ report }) {
  const [includeRegulatory, setIncludeRegulatory] = useState(
    report.includeRegulatoryCitations
  )

  return (
    <Dialog>
      <DialogContent>
        <h2>Generate Forensic Report PDF</h2>

        {/* PDF options */}

        <RegulatoryToggleInModal
          enabled={includeRegulatory}
          onChange={setIncludeRegulatory}
        />

        <Button onClick={() => handleGenerate(includeRegulatory)}>
          Generate PDF
        </Button>
      </DialogContent>
    </Dialog>
  )
}
```

### Step 4: Update API Route

**File:** `app/api/reports/[id]/generate-forensic-pdf/route.ts`

```typescript
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params

  // Get report data
  const report = await prisma.report.findUnique({
    where: { id },
  })

  if (!report) {
    return new Response('Report not found', { status: 404 })
  }

  // EXISTING: Get standards context (unchanged)
  const standardsContext = await retrieveRelevantStandards(...)

  // NEW: Get regulatory context only if:
  // 1. Feature flag is enabled AND
  // 2. Client opted-in AND
  // 3. Feature is available in this region
  let regulatoryContext = null

  if (
    process.env.ENABLE_REGULATORY_CITATIONS === 'true' &&
    report.includeRegulatoryCitations === true
  ) {
    try {
      const { retrieveRegulatoryContext } = await import('@/lib/regulatory-retrieval')

      const regulatoryQuery = {
        reportType: getReportType(report),
        waterCategory: report.waterCategory,
        state: getStateFromPostcode(report.propertyPostcode),
        postcode: report.propertyPostcode,
        insurerName: report.insurerName,
        requiresElectricalWork: report.electricalWorkRequired,
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

  // Generate PDF with merged context
  const pdf = await generateForensicReportPDF({
    report,
    // ... other data ...
    standardsContext,
    regulatoryContext, // Will be null if not requested or if feature is disabled
  })

  return new Response(pdf, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="report-${id}.pdf"`,
    },
  })
}
```

### Step 5: Update PDF Generation

**File:** `lib/generate-forensic-report-pdf.ts`

The code already supports optional regulatory context:

```typescript
// buildScopeItems already accepts regulatoryContext
const scopeItems = buildScopeItems(data, standardsContext || '', data.regulatoryContext)

// Enhancement only happens if context is provided and valid
if (regulatoryContext && regulatoryContext.retrievalSuccess) {
  // Add regulatory citations to scope items
}
```

---

## Client Workflow

### Step 1: Create Report
- Fill in standard report details (water category, location, etc.)
- **NEW:** See toggle for "Include Regulatory Citations"
- User can expand to see what's included and benefits

### Step 2: Review Report
- See report summary with all findings
- Toggle visible on summary page for easy adjustment
- Can change preference at any time

### Step 3: Generate PDF
- Click "Generate PDF"
- See final confirmation of regulatory citations preference
- PDF generates with or without regulatory sections based on selection

### Step 4: Download PDF
- **If Regulatory Citations OFF:** Report shows IICRC standards only (current behavior)
- **If Regulatory Citations ON:** Report includes:
  - All IICRC standards (unchanged)
  - Building code citations
  - Electrical standards
  - Consumer protection notes
  - Regulatory Compliance Summary section

---

## Feature Flag Strategy

### Development & Staging
```bash
ENABLE_REGULATORY_CITATIONS=true
```
- Toggle is visible and functional
- Clients can test both options
- Full feature available

### Production (Initial)
```bash
ENABLE_REGULATORY_CITATIONS=false
```
- Toggle is hidden/disabled
- All reports use IICRC standards only
- No visible changes to users
- Feature ready but not exposed

### Production (Gradual Rollout)
```bash
ENABLE_REGULATORY_CITATIONS=true
# + Add A/B testing for 10%, 25%, 50% of users
```
- Toggle visible for selected users
- Gather feedback and metrics
- Monitor citation accuracy
- Scale gradually based on success

---

## Database Considerations

### Migration Path

```sql
-- Migration 1: Add column (already created)
ALTER TABLE "Report" ADD COLUMN "includeRegulatoryCitations" BOOLEAN NOT NULL DEFAULT false;

-- Backward Compatibility:
-- - All existing reports default to false (IICRC only)
-- - No data migration needed
-- - Users can opt-in per report
```

### Query Impact

```typescript
// Get reports with regulatory citations
const reportsWithRegulatory = await prisma.report.findMany({
  where: { includeRegulatoryCitations: true }
})

// Performance: Index ensures fast queries
```

---

## User Messaging

### Toggle Expanded State

**What's Included:**
- Building Codes: National Construction Code (NCC 2025) + state-specific requirements
- Electrical Standards: AS/NZS 3000 safety requirements for water/mould damage
- Consumer Protection: Australian Consumer Law compliance notes
- Insurance Requirements: General Insurance Code of Practice
- State-Specific: Climate-aware drying times and requirements

**Benefits:**
- ✓ Increases report credibility with regulatory references
- ✓ Demonstrates compliance with Australian standards
- ✓ Supports insurance claims with legal citations
- ✓ Professional "Regulatory Compliance Summary" section in PDF

### Feature Unavailable Message

If feature flag is disabled:
> "Regulatory citations are currently unavailable. This feature will be enabled in an upcoming update."

---

## Testing Checklist

### UI Testing
- [ ] Toggle renders correctly on report form
- [ ] Toggle works on report summary page
- [ ] Toggle visible in PDF generation modal
- [ ] Expand/collapse functionality works
- [ ] "Learn more" link shows detailed info
- [ ] Feature flag disabled hides toggle

### API Testing
- [ ] Report saves `includeRegulatoryCitations` preference
- [ ] PDF generation respects user preference
- [ ] Regulatory context only retrieved when user opts in
- [ ] PDF shows regulatory section only when opted in
- [ ] PDF shows no regulatory section when opted out

### Backward Compatibility
- [ ] Reports without preference field still work
- [ ] Old reports default to false (IICRC only)
- [ ] Feature flag OFF disables all regulatory features
- [ ] No breaking changes to existing functionality

---

## Example: Complete User Flow

### Scenario: Plumber wants regulatory citations

**1. Create Water Damage Report**
```
Form loads
↓
See toggle: "Include Regulatory Citations"
User clicks expand
↓
Sees: "Building Codes, Electrical Standards, Consumer Protection..."
↓
User clicks checkbox: "Include Regulatory Citations" ✓
```

**2. Report is Generated**
```
API route called
↓
Check: includeRegulatoryCitations = true? YES
Check: ENABLE_REGULATORY_CITATIONS = true? YES
↓
retrieveRegulatoryContext() called
QLD selected → includes QDC 4.5
Water damage selected → includes AS/NZS 3000
↓
PDF generated with:
- IICRC standards (S500)
- + NCC 2025 citations
- + QDC 4.5 sections
- + AS/NZS 3000 electrical safety
- + Regulatory Compliance Summary section
```

**3. Client Downloads PDF**
```
PDF includes professional regulatory section
Report authority increased
Client can share with insurer
Better claim documentation
```

---

## Future Enhancements

### Analytics Tracking
```typescript
// Track which users enable regulatory citations
await trackEvent('regulatory_citations_enabled', {
  reportId: report.id,
  userId: user.id,
  timestamp: new Date(),
})
```

### A/B Testing
```typescript
// Show to specific user groups
if (userInABTestGroup(user.id)) {
  showRegulatoryToggle = true
}
```

### Batch Operations
```typescript
// Enable for multiple reports at once
await prisma.report.updateMany({
  where: { userId },
  data: { includeRegulatoryCitations: true }
})
```

---

## Support & Documentation

For clients asking about regulatory citations:

**Q: What are regulatory citations?**
A: Official references to Australian building codes, electrical standards, and consumer protection laws that apply to the restoration work. They add authority and compliance documentation to your report.

**Q: Will it cost more?**
A: No, it's an optional enhancement at no extra charge.

**Q: Can I change it after generating the PDF?**
A: Yes, you can change the preference for each report. Simply regenerate the PDF with the new preference.

**Q: Are IICRC standards still included?**
A: Yes, IICRC standards (S500, S520) are always included regardless of this setting. Regulatory citations are additional.

**Q: Do I need this for my reports?**
A: It's optional, but many clients find it helpful for insurance claims and demonstrating compliance.

---

## Files Modified/Created

**New Files:**
- `components/regulatory-citations-toggle.tsx` - 3 toggle variations
- `prisma/migrations/20260109_add_regulatory_citations_preference/migration.sql` - Database migration
- `docs/REGULATORY-CITATIONS-OPT-IN.md` - This document

**Modified Files:**
- `lib/generate-forensic-report-pdf.ts` - Already supports regulatory context
- `app/api/reports/[id]/generate-forensic-pdf/route.ts` - Needs integration
- Report form components - Add toggle

**No Breaking Changes:** All changes are additive and optional
