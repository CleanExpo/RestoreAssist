# NIR System Testing Guide

## Overview
This guide provides step-by-step instructions for testing the NIR (National Inspection Report) system using the provided test data.

## Prerequisites
1. Database migrations completed (`npx prisma migrate dev`)
2. User account created and logged in
3. Anthropic API key configured in integrations

## Test Scenario 1: Category 1, Class 1 - Clean Water, Minimal Damage

### Step 1: Create Initial Report Entry
1. Navigate to `/dashboard/reports/new`
2. Fill in the form with data from `testScenarios[0].initialEntry`:
   - Client Name: John Smith
   - Property Address: 123 Main Street
   - Postcode: 2000
   - Incident Date: 2024-01-15
   - Technician Name: Mike Johnson
   - Technician Field Report: (copy from test data)
   - Building Age: 2010
   - Structure Type: Residential - Single Storey

### Step 2: Fill NIR Fields
1. Scroll to "NIR Inspection Data" section
2. Environmental Data:
   - Temperature: 22°F
   - Humidity: 55%
   - Air Circulation: Yes (checked)
3. Add Moisture Readings:
   - Location: "Kitchen Floor - Center", Surface: Carpet, Moisture: 45%, Depth: Surface
   - Location: "Kitchen Floor - Under Sink", Surface: Carpet, Moisture: 38%, Depth: Surface
4. Add Affected Areas:
   - Room/Zone: Kitchen, Square Footage: 40, Water Source: Clean Water, Time Since Loss: 2 hours
5. Select Scope Items:
   - Extract Standing Water
   - Install Air Movers
   - Dry Out Structure
6. Add at least one photo (or skip for testing)

### Step 3: Submit and Process
1. Click "Save & Continue"
2. Wait for analysis to complete
3. Select "Basic Report" type
4. System should automatically:
   - Create inspection record
   - Save all NIR data
   - Submit for processing
   - Classify as Category 1, Class 1
   - Determine scope items
   - Estimate costs

### Step 4: Verify Results
1. Check classification matches: Category 1, Class 1
2. Verify scope items are appropriate for clean water, minimal damage
3. Check cost estimates are generated
4. Generate Basic Report and verify:
   - References to IICRC S500
   - No asbestos/lead concerns (building 2010)
   - Electrical safety assessment included
   - Professional formatting

## Test Scenario 2: Category 2, Class 2 - Grey Water, Moderate Damage

### Expected Behavior
- Classification: Category 2, Class 2
- Scope should include sanitization and antimicrobial treatment
- Multiple affected areas should be handled
- Building age 1995 - no asbestos assessment required

## Test Scenario 3: Category 3, Class 3 - Black Water, Extensive Damage with Asbestos Risk

### Expected Behavior
- Classification: Category 3, Class 3
- **Asbestos Assessment Required** (building 1985, pre-1990)
- Mould testing required (>48 hours)
- Electrical assessment required
- Containment and PPE required
- Extensive scope items including demolition
- Higher cost estimates

### Key Compliance Checks
1. Verify system flags asbestos assessment requirement
2. Check mould testing is recommended
3. Verify electrical safety assessment is included
4. Confirm containment setup is in scope

## Test Scenario 4: Category 2, Class 4 - Deeply Held Moisture

### Expected Behavior
- Classification: Category 2, Class 4
- Specialized drying approach required
- Subsurface moisture readings should trigger Class 4
- Hard-to-dry materials (concrete, hardwood) identified

## Test Scenario 5: Category 1, Class 2 - Clean Water, Moderate Evaporation

### Expected Behavior
- Classification: Category 1, Class 2
- Quick response scenario
- Minimal scope items
- Lower cost estimates

## API Testing (Optional)

### Using cURL or Postman

#### 1. Create Report
```bash
POST /api/reports/initial-entry
Content-Type: application/json

{
  "clientName": "John Smith",
  "propertyAddress": "123 Main Street",
  "propertyPostcode": "2000",
  "technicianFieldReport": "...",
  ...
}
```

#### 2. Create Inspection
```bash
POST /api/inspections
Content-Type: application/json

{
  "reportId": "<report-id>",
  "propertyAddress": "123 Main Street",
  "propertyPostcode": "2000",
  "technicianName": "Mike Johnson"
}
```

#### 3. Add Environmental Data
```bash
POST /api/inspections/<inspection-id>/environmental
Content-Type: application/json

{
  "ambientTemperature": 22,
  "humidityLevel": 55,
  "dewPoint": 12.5,
  "airCirculation": true
}
```

#### 4. Add Moisture Readings
```bash
POST /api/inspections/<inspection-id>/moisture
Content-Type: application/json

{
  "location": "Kitchen Floor - Center",
  "surfaceType": "Carpet",
  "moistureLevel": 45,
  "depth": "Surface"
}
```

#### 5. Add Affected Areas
```bash
POST /api/inspections/<inspection-id>/affected-areas
Content-Type: application/json

{
  "roomZoneId": "Kitchen",
  "affectedSquareFootage": 40,
  "waterSource": "Clean Water",
  "timeSinceLoss": 2
}
```

#### 6. Submit for Processing
```bash
POST /api/inspections/<inspection-id>/submit
```

#### 7. Get Classification Results
```bash
GET /api/inspections/<inspection-id>/classification
```

#### 8. Generate Report
```bash
POST /api/reports/generate-inspection-report
Content-Type: application/json

{
  "reportId": "<report-id>",
  "reportType": "basic"
}
```

## Verification Checklist

For each test scenario, verify:

- [ ] Initial report created successfully
- [ ] NIR data saved correctly
- [ ] Classification matches expected category and class
- [ ] Scope items automatically determined
- [ ] Cost estimates generated
- [ ] Compliance requirements flagged (asbestos, lead, electrical, mould) where applicable
- [ ] Basic report generated with expert system prompt
- [ ] Report references appropriate standards (IICRC S500, WHS Regulations, NCC, AS/NZS 3000)
- [ ] Report only uses actual data (no placeholders)
- [ ] Report includes compliance assessments
- [ ] Report includes hazard identification
- [ ] Report includes recommendations with standard references

## Expected Compliance Triggers

| Building Age | Asbestos | Lead | Mould Test | Electrical |
|------------|----------|------|------------|------------|
| Pre-1990   | ✅ Yes   | -    | If >3 days | If water ingress |
| Pre-1970   | ✅ Yes   | ✅ Yes | If >3 days | If water ingress |
| Post-1990  | ❌ No    | ❌ No | If >3 days | If water ingress |

## Troubleshooting

### Classification Not Matching Expected
- Check moisture readings are within expected ranges
- Verify water source is correctly set
- Check affected area square footage
- Verify time since loss

### Compliance Requirements Not Triggering
- Verify building age is set correctly
- Check time since loss for mould testing (>3 days)
- Verify water ingress for electrical assessment

### Scope Items Not Auto-Determined
- Check classification completed successfully
- Verify building code lookup is working
- Check scope determination logic

### Cost Estimates Not Generated
- Verify scope items are selected
- Check cost database has rates
- Verify cost estimation function is called

## Notes

- All dates should be in ISO format (YYYY-MM-DD)
- Temperature values in test data are in Fahrenheit (°F)
- Moisture readings are percentages (0-100)
- Square footage is in square feet
- Time since loss is in hours

