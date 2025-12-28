# Updated Test Data for RestoreAssist

This document contains comprehensive test data matching the current form structure. All fields should be saved to the database and displayed in the generated report.

## Complete Test Scenario: Residential Water Damage (QLD)

### 1. Client Information
```json
{
  "clientName": "John and Sarah Mitchell",
  "clientContactDetails": "Phone: 0412 345 678, Email: john.mitchell@email.com"
}
```

### 2. Property Information
```json
{
  "propertyAddress": "42 River Street, Brisbane QLD",
  "propertyPostcode": "4000",
  "buildingAge": "1995",
  "structureType": "Residential - Single Storey",
  "accessNotes": "Level driveway, truck mount access. Key under front door mat."
}
```

### 3. Claim Information
```json
{
  "claimReferenceNumber": "INS-2025-001234",
  "insurerName": "Suncorp Insurance",
  "incidentDate": "2025-12-02T08:30:00Z",
  "technicianAttendanceDate": "2025-12-02T14:00:00Z",
  "technicianName": "Michael Chen"
}
```

### 4. Technician Field Report
```
Attended property at 2:00 PM on 02/12/2025. Client reported water damage discovered at 8:30 AM. Investigation revealed burst hot water service pipe under kitchen sink. Water has migrated through kitchen, dining room, and into lounge room. Approximately 80-100 litres of standing water extracted from kitchen and dining areas. Water category appears to be Category 1 (clean water from supply line). Property is occupied - family of 4 with 2 children. Construction appears to be 1995 build. Affected materials include: vinyl flooring in kitchen, carpet in dining and lounge, plasterboard walls in kitchen (lower 300mm), and yellow tongue particleboard subfloor in affected areas. Moisture readings taken: Kitchen subfloor 28% MC, Dining room subfloor 32% MC, Lounge room subfloor 18% MC. Deployed 12 air movers, 3 LGR dehumidifiers, and 1 AFD unit. Thermal imaging shows moisture migration pattern extending approximately 8 metres from source. No visible mould growth at this stage. Property is electrically safe. Plumber has been contacted to repair pipe. Estimated affected area: approximately 45 square metres.
```

### 5. NIR Inspection Data

#### 5.1 Moisture Readings
```json
[
  {
    "id": "mr-1",
    "location": "Kitchen",
    "surfaceType": "Particle Board",
    "moistureLevel": 28.5,
    "depth": "Subsurface"
  },
  {
    "id": "mr-2",
    "location": "Kitchen",
    "surfaceType": "Plaster",
    "moistureLevel": 22.3,
    "depth": "Surface"
  },
  {
    "id": "mr-3",
    "location": "Dining Room",
    "surfaceType": "Particle Board",
    "moistureLevel": 32.1,
    "depth": "Subsurface"
  },
  {
    "id": "mr-4",
    "location": "Dining Room",
    "surfaceType": "Carpet",
    "moistureLevel": 35.8,
    "depth": "Surface"
  },
  {
    "id": "mr-5",
    "location": "Lounge Room",
    "surfaceType": "Particle Board",
    "moistureLevel": 18.2,
    "depth": "Subsurface"
  },
  {
    "id": "mr-6",
    "location": "Lounge Room",
    "surfaceType": "Carpet",
    "moistureLevel": 19.5,
    "depth": "Surface"
  }
]
```

#### 5.2 Affected Areas (NIR)
```json
[
  {
    "id": "aa-1",
    "roomZoneId": "Kitchen",
    "affectedSquareFootage": 157.5,
    "waterSource": "Clean Water",
    "timeSinceLoss": 5.5
  },
  {
    "id": "aa-2",
    "roomZoneId": "Dining Room",
    "affectedSquareFootage": 180.0,
    "waterSource": "Clean Water",
    "timeSinceLoss": 5.5
  },
  {
    "id": "aa-3",
    "roomZoneId": "Lounge Room",
    "affectedSquareFootage": 120.0,
    "waterSource": "Clean Water",
    "timeSinceLoss": 5.5
  }
]
```

#### 5.3 Scope Items (NIR)
```json
[
  "remove_carpet",
  "extract_standing_water",
  "install_dehumidification",
  "install_air_movers",
  "apply_antimicrobial",
  "dry_out_structure"
]
```

#### 5.4 Photos
- Upload at least 3-5 photos showing:
  - Kitchen area with visible water damage
  - Dining room affected area
  - Lounge room affected area
  - Moisture meter readings
  - Equipment deployment

### 6. Hazard Profile
```json
{
  "methamphetamineScreen": "NEGATIVE",
  "methamphetamineTestCount": null,
  "biologicalMouldDetected": false,
  "biologicalMouldCategory": null
}
```

### 7. Timeline Estimation
```json
{
  "phase1StartDate": "2025-12-02",
  "phase1EndDate": "2025-12-02",
  "phase2StartDate": "2025-12-02",
  "phase2EndDate": "2025-12-06",
  "phase3StartDate": "2025-12-06",
  "phase3EndDate": "2025-12-07"
}
```

### 8. Equipment & Tools Selection

#### 8.1 Psychrometric Assessment
```json
{
  "waterClass": 2,
  "temperature": 22,
  "humidity": 65,
  "systemType": "closed",
  "dryingPotential": {
    "dryingIndex": 45.2,
    "status": "FAIR",
    "recommendation": "Slow evaporation. Action: Add air movement and monitor closely."
  }
}
```

#### 8.2 Scope Areas (Room Management) - These become "Affected Areas" in the report
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

#### 8.3 Equipment Selection
```json
[
  {
    "groupId": "lgr-70",
    "quantity": 2,
    "dailyRate": 45.00
  },
  {
    "groupId": "lgr-155",
    "quantity": 1,
    "dailyRate": 55.00
  },
  {
    "groupId": "airmover-axial-1500",
    "quantity": 8,
    "dailyRate": 25.00
  },
  {
    "groupId": "airmover-axial-2000",
    "quantity": 4,
    "dailyRate": 30.00
  }
]
```

#### 8.4 Estimated Drying Duration
```json
{
  "estimatedDryingDuration": 4
}
```

## Expected Report Output

When the report is generated, it should display:

1. **Client Information**: John and Sarah Mitchell with contact details
2. **Property Information**: 42 River Street, Brisbane QLD 4000, 1995 build, Single Storey
3. **Claim Information**: INS-2025-001234, Suncorp Insurance, incident date, technician name
4. **Technician Field Report**: Full narrative text
5. **Environmental Conditions**: Should show data if available (currently removed from form)
6. **IICRC Classification**: Based on water source and category
7. **Psychrometric Assessment**: Water Class 2, Temperature 22°C, Humidity 65%, Drying Index 45.2 (FAIR)
8. **Affected Areas**: Should show the 3 scope areas (Kitchen, Dining Room, Lounge Room) with dimensions, volume, and wet percentage
9. **Moisture Readings**: All 6 moisture readings with location, surface type, moisture level, and depth
10. **Hazards**: Methamphetamine NEGATIVE, No biological mould detected
11. **Scope Items**: All selected scope items
12. **Equipment**: All selected equipment with quantities, daily rates, and total costs
13. **Cost Estimates**: Calculated from equipment selection
14. **Photos**: All uploaded photos displayed in relevant sections
15. **Summary**: Rooms affected (3), total cost, average moisture, estimated duration
16. **Compliance Standards**: IICRC S500, S520, WHS Act, EPA Act, NCC, AS/NZS 3000

## Important Notes

1. **Affected Areas in Report**: The "Affected Areas" section in the generated report should display the scope areas (room management) from Equipment & Tools Selection. These are the rooms with dimensions, volume, and wet percentage.

2. **Data Flow**:
   - NIR Affected Areas → Saved to Inspection model
   - Equipment Scope Areas → Saved to Report.scopeAreas (JSON)
   - Report Generation → Uses scopeAreas as primary source for "Affected Areas" display

3. **All Fields Must Be Saved**:
   - Client Information → Report.clientName, Report.clientContactDetails
   - Property Information → Report.propertyAddress, Report.propertyPostcode, Report.buildingAge, Report.structureType, Report.accessNotes
   - Claim Information → Report.claimReferenceNumber, Report.insurerName, Report.incidentDate, Report.technicianAttendanceDate, Report.technicianName
   - Technician Field Report → Report.technicianFieldReport
   - NIR Data → Inspection model (moisture readings, affected areas, scope items, photos)
   - Hazard Profile → Report.methamphetamineScreen, Report.methamphetamineTestCount, Report.biologicalMouldDetected, Report.biologicalMouldCategory
   - Timeline → Report.phase1StartDate, Report.phase1EndDate, Report.phase2StartDate, Report.phase2EndDate, Report.phase3StartDate, Report.phase3EndDate
   - Equipment Data → Report.psychrometricAssessment (JSON), Report.scopeAreas (JSON), Report.equipmentSelection (JSON), Report.estimatedDryingDuration, Report.equipmentCostTotal

4. **Report Display**: All saved data should appear in the generated report with real values, no placeholders.

