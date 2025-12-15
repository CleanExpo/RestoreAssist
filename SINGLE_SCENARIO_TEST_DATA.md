# RestoreAssist Single Scenario Test Data
## Complete Testing Data with 100% Accurate Calculations

This document contains a single, complete test scenario with verified calculations that match the pricing configuration system.

---

## 📋 PRICING CONFIGURATION

**IMPORTANT**: Set this pricing configuration FIRST before testing. All equipment costs are calculated from these rates.

```json
{
  "masterQualifiedNormalHours": 85.00,
  "masterQualifiedSaturday": 127.50,
  "masterQualifiedSunday": 170.00,
  "qualifiedTechnicianNormalHours": 65.00,
  "qualifiedTechnicianSaturday": 97.50,
  "qualifiedTechnicianSunday": 130.00,
  "labourerNormalHours": 45.00,
  "labourerSaturday": 67.50,
  "labourerSunday": 90.00,
  "airMoverAxialDailyRate": 25.00,
  "airMoverCentrifugalDailyRate": 35.00,
  "dehumidifierLGRDailyRate": 45.00,
  "dehumidifierDesiccantDailyRate": 65.00,
  "afdUnitLargeDailyRate": 40.00,
  "extractionTruckMountedHourlyRate": 120.00,
  "extractionElectricHourlyRate": 80.00,
  "injectionDryingSystemDailyRate": 150.00,
  "antimicrobialTreatmentRate": 8.50,
  "mouldRemediationTreatmentRate": 15.00,
  "biohazardTreatmentRate": 25.00,
  "administrationFee": 250.00,
  "callOutFee": 150.00,
  "thermalCameraUseCostPerAssessment": 75.00
}
```

**Where to set**: Dashboard → Settings → Pricing Configuration

---

## 📝 PHASE 1: INITIAL DATA ENTRY

```json
{
  "clientName": "John and Sarah Mitchell",
  "clientContactDetails": "Phone: 0412 345 678, Email: john.mitchell@email.com",
  "propertyAddress": "42 River Street",
  "propertyPostcode": "4000",
  "claimReferenceNumber": "INS-2025-001234",
  "incidentDate": "2025-12-02T08:30:00Z",
  "technicianAttendanceDate": "2025-12-02T14:00:00Z",
  "technicianName": "Michael Chen",
  "technicianFieldReport": "Attended property at 2:00 PM on 02/12/2025. Client reported water damage discovered at 8:30 AM. Investigation revealed burst hot water service pipe under kitchen sink. Water has migrated through kitchen, dining room, and into lounge room. Approximately 80-100 litres of standing water extracted from kitchen and dining areas. Water category appears to be Category 1 (clean water from supply line). Property is occupied - family of 4 with 2 children. Construction appears to be 1995 build. Affected materials include: vinyl flooring in kitchen, carpet in dining and lounge, plasterboard walls in kitchen (lower 300mm), and yellow tongue particleboard subfloor in affected areas. Moisture readings taken: Kitchen subfloor 28% MC, Dining room subfloor 32% MC, Lounge room subfloor 18% MC. Deployed 12 air movers, 3 LGR dehumidifiers, and 1 AFD unit. Thermal imaging shows moisture migration pattern extending approximately 8 metres from source. No visible mould growth at this stage. Property is electrically safe. Plumber has been contacted to repair pipe. Estimated affected area: approximately 45 square metres.",
  
  "insurerName": "Allianz Insurance Australia",
  
  "buildingAge": 1995,
  "structureType": "Brick Veneer",
  "accessNotes": "Level driveway, truck mount access available. Standard residential access. No restrictions.",
  
  "methamphetamineScreen": "NEGATIVE",
  "methamphetamineTestCount": null,
  "biologicalMouldDetected": false,
  "biologicalMouldCategory": null,
  
  "phase1StartDate": "2025-12-02T14:00:00Z",
  "phase1EndDate": "2025-12-02T18:00:00Z",
  "phase2StartDate": "2025-12-03T08:00:00Z",
  "phase2EndDate": "2025-12-06T17:00:00Z",
  "phase3StartDate": "2025-12-07T09:00:00Z",
  "phase3EndDate": "2025-12-07T12:00:00Z"
}
```

**Assessment Report Data Architecture Fields**:
- **Property Intelligence**: Building Age (1995), Structure Type (Brick Veneer), Access Notes
- **Hazard Profile**: Meth Screen (NEGATIVE), Bio/Mould (Not Detected)
- **Timeline Estimation**: 
  - Phase 1 (Make-safe): Dec 2, 2:00 PM - 6:00 PM (4 hours)
  - Phase 2 (Remediation/Drying): Dec 3-6 (4 days)
  - Phase 3 (Verification/Handover): Dec 7, 9:00 AM - 12:00 PM (3 hours)

---

## 🔧 PHASE 2: EQUIPMENT TOOLS SELECTION

### Step 1: Drying Potential (Psychrometric Assessment)

```json
{
  "waterClass": 2,
  "temperature": 25,
  "humidity": 60,
  "systemType": "closed"
}
```

**Expected Results**:
- Drying Index: **33.6**
- Status: "FAIR"
- Recommendation: "Slow evaporation. Action: Add air movement and monitor closely."

**Note**: If you use Temperature: 22°C, Humidity: 65%, you'll get Drying Index: 26 (POOR). 
For FAIR status, use Temperature: 25°C, Humidity: 60% as shown above.

---

### Step 2: Scope Areas

```json
[
  {
    "id": "area-1",
    "name": "Kitchen",
    "length": 4.5,
    "width": 3.5,
    "height": 2.7,
    "wetPercentage": 85
  },
  {
    "id": "area-2",
    "name": "Dining Room",
    "length": 5.0,
    "width": 3.6,
    "height": 2.7,
    "wetPercentage": 90
  },
  {
    "id": "area-3",
    "name": "Lounge Room",
    "length": 4.0,
    "width": 3.0,
    "height": 2.7,
    "wetPercentage": 40
  }
]
```

**Calculations**:
- Kitchen Volume: 4.5 × 3.5 × 2.7 = 42.525 m³
- Dining Room Volume: 5.0 × 3.6 × 2.7 = 48.6 m³
- Lounge Room Volume: 4.0 × 3.0 × 2.7 = 32.4 m³
- **Total Volume**: 123.525 m³

- Kitchen Wet Area: 4.5 × 3.5 × 0.85 = 13.3875 m²
- Dining Room Wet Area: 5.0 × 3.6 × 0.90 = 16.2 m²
- Lounge Room Wet Area: 4.0 × 3.0 × 0.40 = 4.8 m²
- **Total Affected Area**: 34.3875 m² ≈ 34.4 m²

---

### Step 3: Equipment Selection

**Equipment Selected**:
```json
[
  {
    "groupId": "lgr-55",
    "quantity": 1,
    "dailyRate": 45.00
  },
  {
    "groupId": "lgr-85",
    "quantity": 2,
    "dailyRate": 45.00
  },
  {
    "groupId": "airmover-1500",
    "quantity": 8,
    "dailyRate": 25.00
  },
  {
    "groupId": "airmover-2500",
    "quantity": 5,
    "dailyRate": 25.00
  }
]
```

**Note**: The actual equipment selection may vary slightly. Use the quantities shown above for accurate calculations.

**⚠️ IMPORTANT**: All `dailyRate` values come from pricing configuration:
- All LGR dehumidifiers use: `dehumidifierLGRDailyRate` = $45.00/day
- All air movers use: `airMoverAxialDailyRate` = $25.00/day

---

## ✅ VERIFIED CALCULATIONS

### Water Removal Target
- Formula: Based on total volume, water class, and affected area
- Water Class 2, Total Volume: 123.525 m³, Affected Area: 34.4 m²
- Calculation: (123.525 × 0.01 × 1.0) × 1000 = **1235 L/Day** ✅

### Equipment Capacity
- LGR 85L: 2 units × 85L = **170 L/Day**
- LGR 55L: 1 unit × 55L = **55 L/Day**
- **Total Dehumidification Capacity**: **225 L/Day** ✅

### Air Movers Required
- Formula: Based on affected area and water class
- Affected Area: 34.4 m², Water Class 2
- **Expected Air Movers Required**: ~3-4 units

### Air Movement Provided
- 1500 CFM: 8 units × 1500 CFM = 12,000 CFM
- 2500 CFM: 5 units × 2500 CFM = 12,500 CFM
- **Total Airflow**: **24,500 CFM**
- **Equivalent Units** (at 1500 CFM/unit): 24,500 ÷ 1500 = **16.33 units** ≈ **16 units** ✅

### Daily Equipment Cost
- LGR 55L: 1 × $45.00 = $45.00
- LGR 85L: 2 × $45.00 = $90.00
- Air Mover 1500: 8 × $25.00 = $200.00
- Air Mover 2500: 5 × $25.00 = $125.00
- **Total Daily Cost**: **$460.00/day** ✅

### Total Equipment Cost (4 days)
- Daily Cost: $460.00
- Duration: 4 days
- **Total Equipment Cost**: **$1,840.00** ✅

### Total Amps
- LGR 55L: 1 × 2.85A = 2.85A
- LGR 85L: 2 × 5.02A = 10.04A
- Air Mover 1500: 8 × 2.27A = 18.16A
- Air Mover 2500: 5 × 2.00A = 10.00A
- **Total Amps**: **41.05A** ≈ **41.0A** ✅

---

## 📊 FINAL EQUIPMENT METRICS

```json
{
  "equipmentCostTotal": 1840.00,
  "estimatedDryingDuration": 4,
  "totalAffectedArea": 34.4,
  "dehumidificationCapacity": 225,
  "airmoversCount": 13,
  "totalAmps": 41.0,
  "totalDailyCost": 460.00,
  "waterRemovalTarget": 1235,
  "airMoversRequired": 3
}
```

---

## 🎯 VERIFICATION CHECKLIST

### Equipment & Calculations
- [ ] **Pricing Config**: All rates set correctly ($45 LGR, $25 Air Movers)
- [ ] **Daily Cost**: $460.00/day
- [ ] **Total Cost (4 days)**: $1,840.00
- [ ] **Total Amps**: 41.0A
- [ ] **Dehumidification Capacity**: 225 L/Day
- [ ] **Water Removal Target**: 1235 L/Day
- [ ] **Air Movement**: 16 units (24,500 CFM)
- [ ] **Air Movers Required**: 3 units
- [ ] **Equipment Rates**: All show $45/day for LGR, $25/day for Air Movers
- [ ] **Console Logs**: Check browser console for pricing config rates

### Assessment Report Data Architecture
- [ ] **Property Intelligence**: Building Age (1995), Structure Type (Brick Veneer), Access Notes saved
- [ ] **Hazard Profile**: Meth Screen (NEGATIVE), Bio/Mould (false) saved correctly
- [ ] **Insurer Name**: "Allianz Insurance Australia" saved
- [ ] **Timeline Phases**: All 6 phase dates (start/end for 3 phases) saved correctly
- [ ] **Form Display**: All new fields visible and functional in Initial Data Entry form
- [ ] **PDF Generation**: Assessment report PDF includes all new fields:
  - [ ] Property Intelligence in summary
  - [ ] Hazard badges (Meth: NEGATIVE, Bio/Mould: Not shown if false)
  - [ ] Timeline Gantt chart with phase dates
  - [ ] Business profile in header/footer

---

## 🔍 DEBUGGING TIPS

1. **Check Browser Console**: Look for `[Pricing Config]` logs
   - Should show: `Loaded pricing configuration: { dehumidifierLGRDailyRate: 45, ... }`
   - Should show: `Equipment lgr-85 (dehumidifierLGRDailyRate): $45/day`

2. **Verify Pricing Config**: 
   - Go to Dashboard → Settings → Pricing Configuration
   - Confirm all rates match the test data above

3. **Check Equipment Selection**:
   - All LGR dehumidifiers should show: $45.00/day
   - All air movers should show: $25.00/day
   - No hardcoded rates should appear

4. **Verify Calculations**:
   - Daily cost should be: $460.00
   - Total cost (4 days) should be: $1,840.00
   - Total amps should be: 41.0A
   - Water removal target: 1235 L/Day
   - Equipment capacity: 225 L/Day
   - Air movement: 16 units (24,500 CFM)

5. **Verify Assessment Report Data**:
   - Check Initial Data Entry form displays all new fields
   - Verify Property Intelligence fields save correctly
   - Verify Hazard Profile fields save correctly
   - Verify Timeline Estimation dates save correctly
   - Check database: All new fields should be populated in Report table
   - Generate PDF: Verify all data appears in Assessment Report PDF
   - Check PDF Page 1: Hazard badges show correctly (Meth: NEGATIVE)
   - Check PDF Page 3: Timeline Gantt chart shows Phase 1-3 dates
   - Check PDF Header: Business profile information displays correctly

---

## 📝 NOTES

- All equipment rates come from pricing configuration, not hardcoded values
- If calculations don't match, check:
  1. Pricing config is saved correctly
  2. Browser console for pricing config logs
  3. Equipment selection has correct quantities
  4. Duration is set to 4 days (Phase 2: Dec 3-6)

### Assessment Report Testing Notes
- **Building Age**: 1995 (Post-1990, no Asbestos/Lead assessment required)
- **Structure Type**: Brick Veneer (common Australian construction)
- **Access Notes**: Standard residential access, no restrictions
- **Hazard Profile**: Clean water damage scenario (Category 1), no meth or mould
- **Timeline**: 
  - Phase 1: Same day make-safe (4 hours)
  - Phase 2: 4-day drying period
  - Phase 3: Final verification on day 5
- **PDF Generation**: Verify all fields appear in the generated Assessment Report PDF:
  - Header shows business profile information
  - Page 1 shows hazard badges (Meth: NEGATIVE)
  - Page 3 shows timeline Gantt chart with correct phase dates
  - Property intelligence included in forensic summary
