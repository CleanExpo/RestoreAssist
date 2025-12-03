# RestoreAssist Testing Guide

## Quick Start Testing

### Step 1: Set Up Pricing Configuration

1. Navigate to **Dashboard → Settings → Pricing Configuration**
2. Use the pricing data from **Scenario 1** in `sample-test-data.md`
3. Fill in all fields and save
4. Verify all rates are saved correctly

### Step 2: Create Initial Report Entry

1. Navigate to **Dashboard → Reports → New Report**
2. Use **Scenario 1** initial data entry:
   - Client Name: `John and Sarah Mitchell`
   - Property Address: `42 River Street`
   - Postcode: `4000` (Brisbane, QLD)
   - Claim Reference: `INS-2024-001234`
   - Incident Date: `2024-01-15`
   - Technician Report: Copy from Scenario 1
3. Submit the form
4. **Expected**: Report created, redirected to analysis choice screen

### Step 3: Test Report Analysis

1. After initial entry, system should analyze technician report
2. **Expected Results**:
   - Affected Areas: Kitchen, Dining Room, Lounge Room
   - Water Source: Burst hot water service pipe
   - Materials: Vinyl, Carpet, Plasterboard, Yellow Tongue
   - Equipment: 12 air movers, 3 dehumidifiers, 1 AFD
   - Hazards: None identified

### Step 4: Choose Report Depth

1. You'll see two options:
   - **Basic Report** (quick processing)
   - **Enhance Report with Depth Analysis** (recommended - highlighted)
2. Select **"Enhance Report with Depth Analysis"**
3. **Expected**: Redirected to Tier 1 questions

### Step 5: Complete Tier 1 Questions (RED - Critical)

1. Fill in all 8 Tier 1 questions using **Scenario 1** Tier 1 data:
   - Property Type: `Single-storey residential dwelling`
   - Construction Year: `1995`
   - Water Source: `Burst hot water service pipe - Category 1 water`
   - Occupancy: `Occupied - Family residence`
   - Pets: `No pets`
   - Rooms Affected: `Kitchen, Dining Room, Lounge Room...`
   - Materials: Select all from list
   - Hazards: `None identified`
   - Water Duration: `Less than 24 hours`
2. **Test Validation**: Try submitting without filling all fields
   - **Expected**: Error messages for missing required fields
3. Submit complete form
4. **Expected**: Redirected to Tier 2 questions

### Step 6: Complete Tier 2 Questions (AMBER - Enhancement)

1. Fill in Tier 2 questions (all optional but recommended):
   - Use **Scenario 1** Tier 2 data
2. **Test Skip Functionality**: Click "Skip Tier 2"
   - **Expected**: Can skip and proceed to report generation
3. Or complete all questions and submit
4. **Expected**: Option to proceed to Tier 3 or generate report

### Step 7: Complete Tier 3 Questions (GREEN - Optimisation)

1. Click "Optimise Costing?" if shown
2. Fill in Tier 3 questions using **Scenario 1** Tier 3 data
3. Submit
4. **Expected**: Ready for report generation

### Step 8: Generate Inspection Report

1. Click "Generate Enhanced Report"
2. **Expected**: 
   - Report generated with all 13 sections
   - Watermark: "PRELIMINARY ASSESSMENT — NOT FINAL ESTIMATE"
   - State-specific regulatory references (QLD)
   - All sections properly formatted

### Step 9: Generate Scope of Works

1. Navigate to Scope of Works section
2. Click "Generate Scope of Works"
3. **Expected**:
   - All 6 sections generated
   - Line items RW_1 through RW_10
   - Calculations based on your pricing configuration
   - Licensed trades section (if applicable)

### Step 10: Generate Cost Estimation

1. Navigate to Cost Estimation section
2. Click "Generate Cost Estimation"
3. **Expected**:
   - All 8 sections generated
   - Cost breakdown by category
   - GST calculation (10%)
   - Industry comparison
   - Total cost displayed prominently

### Step 11: Test Export Package

1. Navigate to Export Package section
2. Test each export format:
   - **PDF**: Should download complete package
   - **JSON**: Should download raw data
   - **ZIP**: Should download all formats
3. **Expected**: All documents include watermarks

### Step 12: Test Validation & Completeness

1. Check Completeness Checker component
2. **Expected**:
   - Completeness score displayed (0-100%)
   - Section breakdown shown
   - Missing items listed (if any)
   - Warnings displayed (if any)

### Step 13: Test Version History

1. Regenerate a report or make edits
2. Check version history
3. **Expected**:
   - Version number increments
   - Change log shows what changed
   - Timestamps and user info recorded

---

## Advanced Testing Scenarios

### Test Scenario 2: Complex Commercial with Hazards

1. Use **Scenario 2** data from `sample-test-data.md`
2. **Key Differences**:
   - Multi-storey commercial building
   - Pre-1970 construction (1968)
   - Multiple hazards: Asbestos, Mould, Electrical
   - Category 2 water
   - Extended exposure (3-7 days)
3. **Expected Behaviors**:
   - Auto-triggers should flag asbestos risk
   - STOP WORK flags should appear
   - Specialist quotes required
   - Higher cost estimation
   - Class 4 drying protocols

### Test Scenario 3: Category 3 Biohazard

1. Use **Scenario 3** data
2. **Key Differences**:
   - Category 3 contaminated water (sewage)
   - Biohazard protocols required
   - EPA notification required
   - Property temporarily uninhabitable
3. **Expected Behaviors**:
   - Biohazard treatment automatically added
   - Higher chemical treatment costs
   - Additional living expenses flagged
   - EPA notification checklist included

### Test Scenario 4: Heritage Property

1. Use **Scenario 4** data
2. **Key Differences**:
   - Heritage-listed property
   - Pre-1970 construction (1925)
   - Extended exposure (1-2 weeks)
   - Multiple hazards: Mould, Asbestos, Lead Paint
3. **Expected Behaviors**:
   - Heritage-specific protocols
   - Conservation requirements
   - Extended drying timeline
   - Multiple specialist quotes required

---

## Validation Testing

### Test Required Field Validation

1. Try submitting initial entry form with:
   - Empty client name → **Expected**: Error message
   - Empty property address → **Expected**: Error message
   - Invalid postcode → **Expected**: Warning message
   - Future incident date → **Expected**: Error message
   - Empty technician report → **Expected**: Error message

### Test Conflict Detection

1. Create a report with:
   - Occupancy: `Vacant`
   - Pets: `Yes` → **Expected**: Warning about contradiction
2. Create a report with:
   - Construction: `Pre-1970`
   - Hazards: `None identified` → **Expected**: Warning about asbestos risk
3. Create a report with:
   - Water Source: `Category 3`
   - Chemical Treatment: `Standard antimicrobial` → **Expected**: Warning about biohazard treatment

### Test Cost Validation

1. Generate cost estimation
2. **Expected Warnings**:
   - If total > $50,000: "High-value claim" warning
   - If total < $2,000: "Low estimate" warning
   - If hours > 16: "Exceeds daily limit" warning
   - If days > 30: "Exceeds reasonable limit" warning

---

## Geographic Intelligence Testing

### Test Different Postcodes

1. **Postcode 4000** (Brisbane, QLD):
   - **Expected**: QLD state detected
   - Brisbane City Council identified
   - Standard weather patterns

2. **Postcode 4877** (Far North QLD):
   - **Expected**: Cyclone-prone area flagged
   - Special building requirements
   - Compressed timeline recommendations

3. **Postcode 2000** (Sydney, NSW):
   - **Expected**: NSW state detected
   - City of Sydney identified
   - NSW-specific regulatory references

4. **Postcode 3000** (Melbourne, VIC):
   - **Expected**: VIC state detected
   - City of Melbourne identified
   - VIC-specific regulatory references

---

## Auto-Trigger Testing

### Test Pre-1970 Construction Trigger

1. Set Construction Year: `Pre-1970`
2. **Expected**: 
   - Asbestos risk automatically flagged
   - Lead paint risk flagged
   - PPE requirements adjusted
   - Specialist referral notes added

### Test Category 2/3 Water Trigger

1. Set Water Source: `Category 2` or `Category 3`
2. **Expected**:
   - Biohazard protocols triggered
   - EPA notification requirement flagged
   - Specialist contractor requirements added
   - PPE and air filtration adjusted

### Test Yellow Tongue Trigger

1. Select Materials: Include `Yellow tongue particleboard`
2. **Expected**:
   - Class 4 drying protocols triggered
   - Sandwich drying methodology added
   - Injection system requirements added
   - Manual specialist quote flagged

### Test Hazard Triggers

1. Select any hazard in T1_Q7
2. **Expected**:
   - STOP WORK flags created
   - Specialist referral line items added
   - WorkSafe/EPA notifications flagged
   - Cost line for abatement specialist created

---

## Completeness Score Testing

### Test Partial Completion

1. Complete only initial entry → **Expected**: ~20% complete
2. Add Tier 1 responses → **Expected**: ~50% complete
3. Add Tier 2 responses → **Expected**: ~70% complete
4. Add Tier 3 responses → **Expected**: ~80% complete
5. Generate all documents → **Expected**: ~100% complete

### Test Pre-Generation Checklist

1. Try generating report with missing Tier 1 questions
2. **Expected**: 
   - Cannot generate
   - Missing items listed
   - Link to incomplete section provided

---

## Export Testing

### Test PDF Export

1. Generate all documents
2. Export as PDF
3. **Expected**:
   - All three documents included
   - Watermarks on every page
   - Professional formatting
   - Version history included

### Test JSON Export

1. Export as JSON
2. **Expected**:
   - All raw data included
   - Q&A responses included
   - Version history included
   - Machine-readable format

### Test ZIP Export

1. Export as ZIP
2. **Expected**:
   - All formats included
   - Separate files for each document
   - Version history file
   - Raw data export file

---

## Troubleshooting

### Common Issues

1. **"Pricing configuration not found"**
   - Solution: Complete Phase 1 pricing setup first

2. **"No Anthropic API integration found"**
   - Solution: Connect Anthropic API key in integrations

3. **"Report not found"**
   - Solution: Ensure you're using correct report ID and user owns the report

4. **Validation errors not showing**
   - Solution: Check browser console for errors, ensure form validation is enabled

5. **Documents not generating**
   - Solution: Check completeness score, ensure all required fields completed

---

## Success Criteria

✅ All phases can be completed end-to-end
✅ Validation prevents invalid submissions
✅ Auto-triggers activate correctly
✅ Geographic intelligence works for all states
✅ Export formats generate correctly
✅ Version history tracks changes
✅ Completeness score updates in real-time
✅ Cost calculations use pricing configuration
✅ All documents include proper watermarks
✅ State-specific regulations are referenced

---

## Next Steps After Testing

1. **Fix any bugs** discovered during testing
2. **Optimize performance** if generation is slow
3. **Add missing features** identified during testing
4. **Improve error messages** for better UX
5. **Add more test scenarios** for edge cases
6. **Document any customizations** needed for your use case

