# Regulatory Citations - Implementation Checklist

## 5-Step Integration Checklist

Quick checklist for integrating the optional regulatory citations "Tick and Flick" toggle.

---

## ✅ Step 1: Update Prisma Schema

**Location:** `prisma/schema.prisma`

**Action:** Add to Report model

```prisma
model Report {
  // ... existing fields ...

  // NEW: Optional regulatory citations per report
  includeRegulatoryCitations Boolean @default(false)

  // Indexes
  @@index([includeRegulatoryCitations])
}
```

**Time:** 2 minutes

**Tests:**
- [ ] Schema compiles without errors
- [ ] Run `npx prisma validate`
- [ ] Generate client: `npx prisma generate`

---

## ✅ Step 2: Create Database Migration

**Command:**
```bash
npx prisma migrate dev --name add_regulatory_citations_preference
```

**Verification:**
- [ ] Migration file created at `prisma/migrations/20260109_add_regulatory_citations_preference/`
- [ ] SQL looks correct
- [ ] Migration runs without errors
- [ ] Column appears in database

**Rollback (if needed):**
```bash
npx prisma migrate resolve --rolled-back add_regulatory_citations_preference
```

---

## ✅ Step 3: Add Toggle Component to UI

### 3a: Report Generation Form

**File:** Report generation form component (e.g., `components/report-form.tsx`)

**Add:**
```typescript
import { RegulatoryCitationsToggle } from '@/components/regulatory-citations-toggle'
import { useState } from 'react'

export function ReportForm() {
  const [includeRegulatory, setIncludeRegulatory] = useState(false)

  // In JSX:
  <RegulatoryCitationsToggle
    enabled={includeRegulatory}
    onChange={setIncludeRegulatory}
    featureFlagEnabled={process.env.NEXT_PUBLIC_ENABLE_REGULATORY === 'true'}
  />
}
```

**Time:** 5 minutes

**Test:**
- [ ] Toggle appears in form
- [ ] Toggle is clickable
- [ ] State updates when clicked
- [ ] Disabled when feature flag is OFF

### 3b: Report Summary Page (Optional)

**File:** Report summary component

**Add:**
```typescript
import { RegulatoryQuickToggle } from '@/components/regulatory-citations-toggle'

<RegulatoryQuickToggle
  checked={report.includeRegulatoryCitations}
  onChange={handleToggle}
  disabled={!featureFlagEnabled}
/>
```

**Time:** 3 minutes

### 3c: PDF Generation Modal (Optional)

**File:** PDF generation modal component

**Add:**
```typescript
import { RegulatoryToggleInModal } from '@/components/regulatory-citations-toggle'

<RegulatoryToggleInModal
  enabled={includeRegulatory}
  onChange={setIncludeRegulatory}
/>
```

**Time:** 3 minutes

---

## ✅ Step 4: Update API Route

**File:** `app/api/reports/[id]/generate-forensic-pdf/route.ts`

**Find:** The section where standards context is retrieved

**Add Before PDF Generation:**

```typescript
// NEW: Get regulatory context if user opted in
let regulatoryContext = null

if (
  process.env.ENABLE_REGULATORY_CITATIONS === 'true' &&
  report.includeRegulatoryCitations === true
) {
  try {
    const { retrieveRegulatoryContext } = await import('@/lib/regulatory-retrieval')

    regulatoryContext = await retrieveRegulatoryContext(
      {
        reportType: getReportType(report),
        waterCategory: report.waterCategory,
        state: getStateFromPostcode(report.propertyPostcode),
        postcode: report.propertyPostcode,
        insurerName: report.insurerName,
        requiresElectricalWork: report.electricalWorkRequired,
      },
      integration?.apiKey
    )
  } catch (error) {
    console.error('Regulatory context retrieval failed:', error)
    // Continue without regulatory context (graceful degradation)
  }
}
```

**Then Pass to PDF Generator:**

```typescript
const pdf = await generateForensicReportPDF({
  report,
  // ... existing data ...
  regulatoryContext,  // NEW: Will be null if not requested
})
```

**Time:** 10 minutes

**Test:**
- [ ] Report saves user preference
- [ ] API checks includeRegulatoryCitations flag
- [ ] Feature flag controls availability
- [ ] Graceful fallback on error

---

## ✅ Step 5: Test Everything

### Unit Tests

```typescript
// Test toggle component
describe('RegulatoryCitationsToggle', () => {
  it('should toggle enabled state', () => {
    // Test implementation
  })

  it('should be disabled when feature flag is off', () => {
    // Test implementation
  })
})
```

**Time:** 15 minutes

### Integration Tests

**Test Cases:**

| Case | Feature Flag | User Choice | Expected PDF | Notes |
|------|--------------|------------|--------------|-------|
| 1 | OFF | N/A | IICRC only | Default state |
| 2 | ON | OFF | IICRC only | User choice |
| 3 | ON | ON | IICRC + Regulatory | Full feature |
| 4 | ON | ON | IICRC only | DB not seeded |

**Checklist:**
- [ ] Test Case 1: Feature flag OFF → No regulatory section in PDF
- [ ] Test Case 2: Feature flag ON, user OFF → No regulatory section
- [ ] Test Case 3: Feature flag ON, user ON → Regulatory section included
- [ ] Test Case 4: No database → Graceful degradation

**Test Time:** 20 minutes

### Manual Testing

**Test Checklist:**
- [ ] Create new report
- [ ] See toggle in form
- [ ] Toggle enabled/disabled
- [ ] Toggle saves to database
- [ ] Can toggle on summary page
- [ ] PDF generates with toggle OFF
- [ ] PDF generates with toggle ON
- [ ] PDF shows regulatory section when ON
- [ ] PDF doesn't show regulatory section when OFF
- [ ] Toggle disabled when feature flag OFF

**Test Time:** 30 minutes

---

## Validation Checklist

### Code Quality
- [ ] No TypeScript errors
- [ ] No console.error messages (except graceful errors)
- [ ] Component responsive on mobile/desktop
- [ ] Proper error handling

### Functionality
- [ ] Toggle state persists to database
- [ ] Feature flag controls availability
- [ ] Graceful degradation when service fails
- [ ] PDF generation works both with and without regulatory context

### Backward Compatibility
- [ ] Old reports (without preference) default to false
- [ ] Feature flag OFF disables all regulatory features
- [ ] IICRC standards always included
- [ ] No breaking changes to PDF layout

### Performance
- [ ] PDF generation time <10 seconds (with or without regulatory)
- [ ] Database queries optimized with index
- [ ] No memory leaks from toggle component
- [ ] API response time <5 seconds for regulatory retrieval

---

## Rollout Strategy

### Phase 1: Development (1-2 days)
- [ ] Complete all 5 steps above
- [ ] Run all tests
- [ ] Feature flag: OFF (hidden from users)

### Phase 2: Staging (3-5 days)
- [ ] Deploy to staging environment
- [ ] Feature flag: ON (visible to testers)
- [ ] Test with real data
- [ ] Gather feedback

### Phase 3: Production Soft Launch (Day 1)
- [ ] Deploy all code
- [ ] Feature flag: OFF (hidden from users)
- [ ] Monitor error rates
- [ ] Zero breaking changes

### Phase 4: Production Gradual Rollout (Days 2-14)
- [ ] Day 2: Enable for 10% of users
- [ ] Day 4: Enable for 25% of users
- [ ] Day 7: Enable for 50% of users
- [ ] Day 14: Enable for 100% of users (or keep OFF if issues)

### Phase 5: Monitoring (Ongoing)
- [ ] Track toggle usage percentage
- [ ] Monitor citation accuracy
- [ ] Collect user feedback
- [ ] Optimize based on usage patterns

---

## Troubleshooting

### Toggle Not Appearing
**Check:**
- [ ] Component imported correctly
- [ ] No JavaScript errors in console
- [ ] Feature flag checking works correctly
- [ ] Component props passed correctly

**Fix:**
```bash
npm run dev  # Restart dev server
npx prisma generate  # Regenerate Prisma client
```

### Regulatory Section Not Appearing in PDF
**Check:**
- [ ] User has `includeRegulatoryCitations = true`
- [ ] Feature flag is `ENABLE_REGULATORY_CITATIONS=true`
- [ ] Database is seeded with regulatory documents
- [ ] Regulatory context retrieval didn't fail silently

**Debug:**
```typescript
console.log('User preference:', report.includeRegulatoryCitations)
console.log('Feature flag:', process.env.ENABLE_REGULATORY_CITATIONS)
console.log('Regulatory context:', regulatoryContext)
```

### Database Migration Failed
**Fix:**
```bash
# Reset migrations (development only!)
npx prisma migrate reset

# Or manually rollback
npx prisma migrate resolve --rolled-back add_regulatory_citations_preference
```

### TypeScript Errors
**Check:**
- [ ] Prisma client is regenerated: `npx prisma generate`
- [ ] Type definitions are correct
- [ ] Component props match interface

---

## Files to Touch

| File | Change | Type | Time |
|------|--------|------|------|
| `prisma/schema.prisma` | Add field | Schema | 2 min |
| Migration SQL | Create file | Database | 1 min |
| Report form component | Add toggle | UI | 5 min |
| Report summary (optional) | Add quick toggle | UI | 3 min |
| PDF modal (optional) | Add toggle | UI | 3 min |
| API route | Add context retrieval | Logic | 10 min |
| Test suite | Add tests | Tests | 15 min |
| Manual testing | Validate all | QA | 30 min |

**Total Time: 70-90 minutes**

---

## Success Criteria

✅ **Integration Complete When:**

1. **UI Works**
   - Toggle renders correctly
   - Toggle is clickable and responsive
   - Feature flag hides/shows toggle
   - Expand/collapse works

2. **Data Persists**
   - User preference saves to database
   - Database column indexed for performance
   - Migration runs successfully

3. **PDF Generation Works**
   - PDF with toggle OFF: IICRC only
   - PDF with toggle ON: IICRC + regulatory
   - No crashes or errors
   - Graceful degradation if regulatory service fails

4. **Backward Compatible**
   - Old reports work unchanged
   - Feature flag OFF disables completely
   - No breaking changes
   - All existing tests pass

5. **Tested**
   - Unit tests pass
   - Integration tests pass
   - Manual tests complete
   - No TypeScript errors

---

## Quick Start Commands

```bash
# 1. Update Prisma
nano prisma/schema.prisma  # Add field

# 2. Migrate
npx prisma migrate dev --name add_regulatory_citations_preference

# 3. Generate client
npx prisma generate

# 4. Start dev server
npm run dev

# 5. Run tests
npm test -- regulatory-citations

# 6. Check for errors
npx tsc --noEmit
```

---

## Next Steps After Integration

1. **Phase 5b:** Add "Regulatory Compliance Summary" section to PDF
2. **Phase 6:** Implement update system for regulatory documents
3. **Phase 7:** Comprehensive testing and validation
4. **Phase 8:** Final documentation and customer communication

---

## Support

Questions during implementation?

1. Check `docs/REGULATORY-CITATIONS-OPT-IN.md` for detailed guide
2. Review component code: `components/regulatory-citations-toggle.tsx`
3. Check API route: `app/api/reports/[id]/generate-forensic-pdf/route.ts`
4. See test examples: `lib/regulatory-retrieval.test.ts`

**Estimated Total Time: 1.5-2 hours for full integration and testing**
