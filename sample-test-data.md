# RestoreAssist Sample Test Data

This document contains comprehensive sample data for testing all phases of the RestoreAssist system.

## Scenario 1: Standard Residential Water Damage (QLD)

### Phase 1: Pricing Configuration
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

### Phase 2: Initial Data Entry
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
  "technicianFieldReport": "Attended property at 2:00 PM on 02/12/2025. Client reported water damage discovered at 8:30 AM. Investigation revealed burst hot water service pipe under kitchen sink. Water has migrated through kitchen, dining room, and into lounge room. Approximately 80-100 litres of standing water extracted from kitchen and dining areas. Water category appears to be Category 1 (clean water from supply line). Property is occupied - family of 4 with 2 children. Construction appears to be 1995 build. Affected materials include: vinyl flooring in kitchen, carpet in dining and lounge, plasterboard walls in kitchen (lower 300mm), and yellow tongue particleboard subfloor in affected areas. Moisture readings taken: Kitchen subfloor 28% MC, Dining room subfloor 32% MC, Lounge room subfloor 18% MC. Deployed 12 air movers, 3 LGR dehumidifiers, and 1 AFD unit. Thermal imaging shows moisture migration pattern extending approximately 8 metres from source. No visible mould growth at this stage. Property is electrically safe. Plumber has been contacted to repair pipe. Estimated affected area: approximately 45 square metres."
}
```

### Phase 2.5: Equipment Tools Selection (NEW - Added 02/12/2025)

#### Step 1: Drying Potential (Psychrometric Assessment)
```json
{
  "waterClass": 2,
  "temperature": 22,
  "humidity": 65,
  "systemType": "closed",
  "dryingPotential": {
    "dryingIndex": 45.2,
    "status": "FAIR",
    "recommendation": "Slow evaporation. Action: Add air movement and monitor closely.",
    "vaporPressureDifferential": 12.5
  }
}
```

#### Step 2: Scope Areas
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

#### Step 3: Equipment Selection
```json
[
  {
    "groupId": "lgr-85",
    "quantity": 2,
    "dailyRate": 75
  },
  {
    "groupId": "lgr-55",
    "quantity": 1,
    "dailyRate": 55
  },
  {
    "groupId": "airmover-1500",
    "quantity": 8,
    "dailyRate": 35
  },
  {
    "groupId": "airmover-2500",
    "quantity": 4,
    "dailyRate": 45
  }
]
```

#### Calculated Metrics
```json
{
  "equipmentCostTotal": 1015.00,
  "estimatedDryingDuration": 5,
  "totalAffectedArea": 45.0,
  "dehumidificationCapacity": 215,
  "airmoversCount": 12,
  "totalAmps": 28.5
}
```

### Phase 3: Technician Report Analysis (Expected AI Output)
```json
{
  "affectedAreas": [
    "Kitchen",
    "Dining Room",
    "Lounge Room"
  ],
  "waterSource": "Burst hot water service pipe under kitchen sink",
  "waterCategory": "Category 1 - Clean water from supply line",
  "materialsAffected": [
    "Vinyl flooring",
    "Carpet",
    "Plasterboard walls",
    "Yellow tongue particleboard subfloor"
  ],
  "equipmentDeployed": [
    "12 air movers",
    "3 LGR dehumidifiers",
    "1 AFD unit"
  ],
  "moistureReadings": {
    "Kitchen subfloor": "28% MC",
    "Dining room subfloor": "32% MC",
    "Lounge room subfloor": "18% MC"
  },
  "hazards": [
    "None identified"
  ],
  "affectedAreaSqm": 45
}
```

### Phase 4: Tier 1 Questions (RED - Critical)
```json
{
  "T1_Q1_propertyType": "Single-storey residential dwelling",
  "T1_Q2_constructionYear": "1995",
  "T1_Q3_waterSource": "Burst hot water service pipe - Category 1 water",
  "T1_Q4_occupancyStatus": "Occupied - Family residence",
  "T1_Q4_petsPresent": "No pets",
  "T1_Q5_roomsAffected": "Kitchen, Dining Room, Lounge Room. Water migrated from kitchen sink area through open plan layout. Approximately 45 sqm total affected area.",
  "T1_Q6_materialsAffected": [
    "Vinyl flooring",
    "Carpet",
    "Plasterboard walls",
    "Yellow tongue particleboard subfloor"
  ],
  "T1_Q7_hazards": [
    "None identified"
  ],
  "T1_Q8_waterDuration": "Less than 24 hours"
}
```

### Phase 4: Tier 2 Questions (AMBER - Enhancement)
```json
{
  "T2_Q1_moistureReadings": "Kitchen subfloor: 28% MC, Dining room subfloor: 32% MC, Lounge room subfloor: 18% MC. Target: <16% MC for subfloor materials.",
  "T2_Q2_waterMigrationPattern": "Water migrated from kitchen sink area (source) through open plan layout. Pattern shows: Kitchen (primary) → Dining Room (secondary) → Lounge Room (tertiary). Migration distance approximately 8 metres. Water followed natural fall of subfloor toward lounge room.",
  "T2_Q3_equipmentDeployed": "12 × Axial air movers, 3 × LGR dehumidifiers (large), 1 × AFD unit (large 500 CFM). Equipment positioned to create airflow across affected areas and into subfloor void.",
  "T2_Q4_affectedContents": "Kitchen: Base cabinets may have water damage to lower sections. Dining: Furniture legs may have absorbed moisture. Lounge: Minimal contents affected, mostly floor coverings.",
  "T2_Q5_structuralConcerns": [
    "None identified"
  ],
  "T2_Q6_buildingServicesAffected": [
    "None identified"
  ],
  "T2_Q7_insuranceConsiderations": "Building insurance claim. Contents may be covered under separate contents policy. Client advised to contact insurer immediately."
}
```

### Phase 4: Tier 3 Questions (GREEN - Optimisation)
```json
{
  "T3_Q1_timelineRequirements": "Standard timeline acceptable - no urgent deadline",
  "T3_Q2_dryingPreferences": "Balanced approach - cost-effective with reasonable timeline",
  "T3_Q3_chemicalTreatment": "Standard antimicrobial treatment recommended",
  "T3_Q4_totalAffectedArea": "45 sqm (kitchen 15 sqm, dining 18 sqm, lounge 12 sqm)",
  "T3_Q5_class4DryingAssessment": "Class 3 drying - Yellow tongue subfloor affected but not extensively saturated. Standard drying protocols should be effective."
}
```

---

## Scenario 2: Complex Multi-Storey with Hazards (NSW)

### Phase 2: Initial Data Entry
```json
{
  "clientName": "Commercial Property Management Pty Ltd",
  "clientContactDetails": "Phone: 02 9876 5432, Email: claims@commercialpm.com.au",
  "propertyAddress": "Level 3, 123 Harbour Street",
  "propertyPostcode": "2000",
  "claimReferenceNumber": "COM-2025-005678",
  "incidentDate": "2025-12-02T22:00:00Z",
  "technicianAttendanceDate": "2025-12-03T08:00:00Z",
  "technicianName": "David Thompson",
  "technicianFieldReport": "Emergency call-out at 8:00 AM on 03/12/2025. Water damage discovered overnight on Level 3 of commercial office building. Investigation revealed burst pipe in ceiling void above office space. Water has migrated through ceiling, affecting multiple offices and common areas. Approximately 200+ litres of water extracted. Water appears to be Category 2 (grey water) from building services. Building constructed in 1968 - pre-1970 construction. Property is commercial office space, currently occupied during business hours. Affected areas include: 4 office spaces, reception area, and corridor. Materials affected: Suspended ceiling tiles, carpet, plasterboard walls and ceiling, and suspected asbestos-containing materials in ceiling void. Moisture readings: Office 1 ceiling void 45% MC, Office 2 subfloor 28% MC, Reception area ceiling 35% MC. Deployed 20 air movers, 5 LGR dehumidifiers, 2 AFD units. Thermal imaging shows extensive moisture in ceiling void. Visible mould growth detected in ceiling void above Office 1. Electrical outlets in affected areas require assessment. Building services (HVAC) may be affected. Estimated affected area: approximately 180 square metres. STOP WORK required for asbestos assessment before proceeding with full remediation."
}
```

### Phase 2.5: Equipment Tools Selection (NEW - Added 02/12/2025)

#### Step 1: Drying Potential (Psychrometric Assessment)
```json
{
  "waterClass": 3,
  "temperature": 18,
  "humidity": 75,
  "systemType": "closed",
  "dryingPotential": {
    "dryingIndex": 22.5,
    "status": "POOR",
    "recommendation": "Air saturated or cold. Minimal evaporation. Action: Increase heat or dehumidification.",
    "vaporPressureDifferential": 7.2
  }
}
```

#### Step 2: Scope Areas
```json
[
  {
    "id": "area-1",
    "name": "Office 1",
    "length": 6.0,
    "width": 5.0,
    "height": 2.8,
    "wetPercentage": 100
  },
  {
    "id": "area-2",
    "name": "Office 2",
    "length": 6.0,
    "width": 5.0,
    "height": 2.8,
    "wetPercentage": 80
  },
  {
    "id": "area-3",
    "name": "Office 3",
    "length": 6.0,
    "width": 5.0,
    "height": 2.8,
    "wetPercentage": 70
  },
  {
    "id": "area-4",
    "name": "Office 4",
    "length": 6.0,
    "width": 5.0,
    "height": 2.8,
    "wetPercentage": 60
  },
  {
    "id": "area-5",
    "name": "Reception Area",
    "length": 8.0,
    "width": 5.0,
    "height": 2.8,
    "wetPercentage": 90
  },
  {
    "id": "area-6",
    "name": "Corridor",
    "length": 10.0,
    "width": 2.0,
    "height": 2.8,
    "wetPercentage": 50
  }
]
```

#### Step 3: Equipment Selection
```json
[
  {
    "groupId": "lgr-105",
    "quantity": 3,
    "dailyRate": 95
  },
  {
    "groupId": "lgr-85",
    "quantity": 2,
    "dailyRate": 75
  },
  {
    "groupId": "desiccant-35",
    "quantity": 1,
    "dailyRate": 120
  },
  {
    "groupId": "airmover-2500",
    "quantity": 12,
    "dailyRate": 45
  },
  {
    "groupId": "airmover-1500",
    "quantity": 8,
    "dailyRate": 35
  }
]
```

#### Calculated Metrics
```json
{
  "equipmentCostTotal": 2345.00,
  "estimatedDryingDuration": 10,
  "totalAffectedArea": 180.0,
  "dehumidificationCapacity": 505,
  "airmoversCount": 20,
  "totalAmps": 78.5
}
```

### Phase 4: Tier 1 Questions (RED - Critical)
```json
{
  "T1_Q1_propertyType": "Multi-storey commercial building",
  "T1_Q2_constructionYear": "Pre-1970 (1968)",
  "T1_Q3_waterSource": "Burst pipe in ceiling void - Category 2 grey water",
  "T1_Q4_occupancyStatus": "Occupied - Commercial office space",
  "T1_Q4_petsPresent": "N/A - Commercial property",
  "T1_Q5_roomsAffected": "Level 3: Office 1, Office 2, Office 3, Office 4, Reception area, Corridor. Water migrated from ceiling void down through multiple levels.",
  "T1_Q6_materialsAffected": [
    "Suspended ceiling tiles",
    "Carpet",
    "Plasterboard walls",
    "Plasterboard ceiling",
    "Suspected asbestos-containing materials"
  ],
  "T1_Q7_hazards": [
    "Suspected asbestos",
    "Active mould growth",
    "Electrical hazards"
  ],
  "T1_Q8_waterDuration": "3-7 days (discovered overnight but likely occurred days earlier)"
}
```

### Phase 4: Tier 2 Questions (AMBER - Enhancement)
```json
{
  "T2_Q1_moistureReadings": "Office 1 ceiling void: 45% MC (critical), Office 2 subfloor: 28% MC, Reception area ceiling: 35% MC. Target: <16% MC for structural materials, <12% MC for timber.",
  "T2_Q2_waterMigrationPattern": "Water migrated from ceiling void above Office 1, spreading horizontally through ceiling void, then vertically down through ceiling tiles into multiple offices. Pattern shows extensive multi-level migration.",
  "T2_Q3_equipmentDeployed": "20 × Axial air movers, 5 × LGR dehumidifiers, 2 × AFD units (large). Equipment staged across affected offices and common areas.",
  "T2_Q4_affectedContents": "Office furniture, computers, filing cabinets, carpet tiles, ceiling tiles. Contents require assessment for water damage.",
  "T2_Q5_structuralConcerns": [
    "Ceiling structural integrity",
    "Water damage to ceiling void framing"
  ],
  "T2_Q6_buildingServicesAffected": [
    "Electrical",
    "HVAC systems"
  ],
  "T2_Q7_insuranceConsiderations": "Commercial building insurance claim. Business interruption may apply. Asbestos assessment required before full remediation can proceed. Specialist quotes needed for asbestos abatement and mould remediation."
}
```

### Phase 4: Tier 3 Questions (GREEN - Optimisation)
```json
{
  "T3_Q1_timelineRequirements": "Urgent - Business operations affected, need compressed timeline",
  "T3_Q2_dryingPreferences": "Speed priority - Business interruption costs are significant",
  "T3_Q3_chemicalTreatment": "Mould remediation treatment required (active growth detected)",
  "T3_Q4_totalAffectedArea": "180 sqm (4 offices @ 30 sqm each, reception 40 sqm, corridor 20 sqm)",
  "T3_Q5_class4DryingAssessment": "Class 4 drying likely - Extensive saturation in ceiling void, multi-level migration, requires specialist assessment and injection drying system."
}
```

---

## Scenario 3: Category 3 Biohazard (VIC)

### Phase 2: Initial Data Entry
```json
{
  "clientName": "Maria Rodriguez",
  "clientContactDetails": "Phone: 0400 123 456, Email: maria.rodriguez@email.com",
  "propertyAddress": "15 Park Avenue",
  "propertyPostcode": "3000",
  "claimReferenceNumber": "VIC-2025-009876",
  "incidentDate": "2025-12-02T06:00:00Z",
  "technicianAttendanceDate": "2025-12-02T10:00:00Z",
  "technicianName": "James Wilson",
  "technicianFieldReport": "Attended property at 10:00 AM on 02/12/2025. Client reported sewage backup from main sewer line. Sewage has entered property through floor drain in bathroom and overflowed into bathroom, hallway, and partially into bedroom. Approximately 150 litres of Category 3 contaminated water extracted. Property is 1980 construction, occupied by single tenant. Affected areas: Bathroom, Hallway, Bedroom (partial). Materials affected: Vinyl flooring, carpet, plasterboard walls, timber skirting boards. Moisture readings: Bathroom subfloor 38% MC, Hallway carpet 45% MC, Bedroom subfloor 22% MC. Deployed 15 air movers, 4 LGR dehumidifiers, 2 AFD units with HEPA filtration. Biohazard protocols activated. EPA notification may be required. All affected surfaces require biohazard treatment. Estimated affected area: 35 square metres. Property temporarily uninhabitable due to contamination risk."
}
```

### Phase 2.5: Equipment Tools Selection (NEW - Added 02/12/2025)

#### Step 1: Drying Potential (Psychrometric Assessment)
```json
{
  "waterClass": 3,
  "temperature": 20,
  "humidity": 70,
  "systemType": "closed",
  "dryingPotential": {
    "dryingIndex": 28.3,
    "status": "POOR",
    "recommendation": "Air saturated or cold. Minimal evaporation. Action: Increase heat or dehumidification.",
    "vaporPressureDifferential": 8.5
  }
}
```

#### Step 2: Scope Areas
```json
[
  {
    "id": "area-1",
    "name": "Bathroom",
    "length": 3.0,
    "width": 4.0,
    "height": 2.4,
    "wetPercentage": 100
  },
  {
    "id": "area-2",
    "name": "Hallway",
    "length": 6.0,
    "width": 3.0,
    "height": 2.4,
    "wetPercentage": 100
  },
  {
    "id": "area-3",
    "name": "Bedroom",
    "length": 2.5,
    "width": 2.0,
    "height": 2.4,
    "wetPercentage": 40
  }
]
```

#### Step 3: Equipment Selection
```json
[
  {
    "groupId": "lgr-85",
    "quantity": 2,
    "dailyRate": 75
  },
  {
    "groupId": "lgr-55",
    "quantity": 2,
    "dailyRate": 55
  },
  {
    "groupId": "airmover-1500",
    "quantity": 10,
    "dailyRate": 35
  },
  {
    "groupId": "airmover-2500",
    "quantity": 5,
    "dailyRate": 45
  }
]
```

#### Calculated Metrics
```json
{
  "equipmentCostTotal": 1200.00,
  "estimatedDryingDuration": 7,
  "totalAffectedArea": 35.0,
  "dehumidificationCapacity": 280,
  "airmoversCount": 15,
  "totalAmps": 35.2
}
```

### Phase 4: Tier 1 Questions (RED - Critical)
```json
{
  "T1_Q1_propertyType": "Single-storey residential unit",
  "T1_Q2_constructionYear": "1980",
  "T1_Q3_waterSource": "Sewage backup from main sewer line - Category 3 contaminated water",
  "T1_Q4_occupancyStatus": "Occupied - Single tenant",
  "T1_Q4_petsPresent": "No pets",
  "T1_Q5_roomsAffected": "Bathroom (primary), Hallway (secondary), Bedroom (partial - approximately 5 sqm). Sewage entered through floor drain and overflowed.",
  "T1_Q6_materialsAffected": [
    "Vinyl flooring",
    "Carpet",
    "Plasterboard walls",
    "Timber skirting boards"
  ],
  "T1_Q7_hazards": [
    "Biohazard contamination (Category 3)",
    "Health risk to occupants"
  ],
  "T1_Q8_waterDuration": "Less than 24 hours (discovered at 6:00 AM)"
}
```

### Phase 4: Tier 2 Questions (AMBER - Enhancement)
```json
{
  "T2_Q1_moistureReadings": "Bathroom subfloor: 38% MC (critical), Hallway carpet: 45% MC (critical), Bedroom subfloor: 22% MC. Target: <16% MC for subfloor, <12% MC for timber.",
  "T2_Q2_waterMigrationPattern": "Sewage entered through floor drain in bathroom, overflowed into bathroom, then migrated through doorway into hallway, and partially into bedroom. Migration distance approximately 6 metres.",
  "T2_Q3_equipmentDeployed": "15 × Axial air movers, 4 × LGR dehumidifiers, 2 × AFD units with HEPA filtration. Biohazard containment barriers installed.",
  "T2_Q4_affectedContents": "Bathroom: All contents require biohazard treatment or disposal. Hallway: Carpet and skirting boards affected. Bedroom: Minimal contents affected.",
  "T2_Q5_structuralConcerns": [
    "None identified"
  ],
  "T2_Q6_buildingServicesAffected": [
    "Plumbing (sewer line requires assessment)"
  ],
  "T2_Q7_insuranceConsiderations": "Building and contents insurance claim. Additional living expenses may apply due to property being temporarily uninhabitable. Biohazard remediation costs will be significant. EPA notification required."
}
```

### Phase 4: Tier 3 Questions (GREEN - Optimisation)
```json
{
  "T3_Q1_timelineRequirements": "Urgent - Property uninhabitable, tenant requires temporary accommodation",
  "T3_Q2_dryingPreferences": "Speed priority - Need property habitable ASAP",
  "T3_Q3_chemicalTreatment": "Biohazard treatment required (Category 3 contamination)",
  "T3_Q4_totalAffectedArea": "35 sqm (bathroom 12 sqm, hallway 18 sqm, bedroom 5 sqm)",
  "T3_Q5_class4DryingAssessment": "Class 3 drying - Standard protocols with biohazard treatment. No Class 4 drying required."
}
```

---

## Scenario 4: Heritage Property with Extended Exposure (QLD)

### Phase 2: Initial Data Entry
```json
{
  "clientName": "Heritage Trust Queensland",
  "clientContactDetails": "Phone: 07 3333 4444, Email: heritage@trust.org.au",
  "propertyAddress": "88 Heritage Lane",
  "propertyPostcode": "4000",
  "claimReferenceNumber": "HER-2025-003456",
  "incidentDate": "2025-11-24T00:00:00Z",
  "technicianAttendanceDate": "2025-12-02T09:00:00Z",
  "technicianName": "Emma Brown",
  "technicianFieldReport": "Attended heritage-listed property at 9:00 AM on 02/12/2025. Water damage discovered after property was vacant for 8 days. Investigation revealed leaking roof during recent storm event. Water has entered through roof and migrated through multiple rooms. Property constructed in 1925 - heritage-listed. Approximately 300+ litres of standing water extracted. Water category: Category 1 initially, but extended exposure suggests potential Category 2. Property is currently vacant (heritage restoration project). Affected areas: Master bedroom, Study, Hallway, and partially into lounge room. Materials affected: Original timber floorboards, plaster walls, timber skirting boards, and original ceiling. Moisture readings: Master bedroom floorboards 42% MC, Study subfloor 35% MC, Hallway floorboards 28% MC. Extensive mould growth visible on walls and in ceiling void. Deployed 18 air movers, 4 LGR dehumidifiers, 2 AFD units. Thermal imaging shows moisture migration through multiple structural elements. Heritage conservation protocols required. Estimated affected area: 65 square metres. Extended exposure (8+ days) has caused significant secondary damage including mould growth."
}
```

### Phase 2.5: Equipment Tools Selection (NEW - Added 02/12/2025)

#### Step 1: Drying Potential (Psychrometric Assessment)
```json
{
  "waterClass": 2,
  "temperature": 15,
  "humidity": 80,
  "systemType": "closed",
  "dryingPotential": {
    "dryingIndex": 18.5,
    "status": "POOR",
    "recommendation": "Air saturated or cold. Minimal evaporation. Action: Increase heat or dehumidification.",
    "vaporPressureDifferential": 5.8
  }
}
```

#### Step 2: Scope Areas
```json
[
  {
    "id": "area-1",
    "name": "Master Bedroom",
    "length": 5.5,
    "width": 4.5,
    "height": 3.0,
    "wetPercentage": 95
  },
  {
    "id": "area-2",
    "name": "Study",
    "length": 4.0,
    "width": 3.5,
    "height": 3.0,
    "wetPercentage": 85
  },
  {
    "id": "area-3",
    "name": "Hallway",
    "length": 8.0,
    "width": 1.5,
    "height": 3.0,
    "wetPercentage": 70
  },
  {
    "id": "area-4",
    "name": "Lounge Room",
    "length": 5.0,
    "width": 4.0,
    "height": 3.0,
    "wetPercentage": 30
  }
]
```

#### Step 3: Equipment Selection
```json
[
  {
    "groupId": "lgr-105",
    "quantity": 2,
    "dailyRate": 95
  },
  {
    "groupId": "lgr-85",
    "quantity": 2,
    "dailyRate": 75
  },
  {
    "groupId": "desiccant-35",
    "quantity": 1,
    "dailyRate": 120
  },
  {
    "groupId": "airmover-2500",
    "quantity": 10,
    "dailyRate": 45
  },
  {
    "groupId": "airmover-1500",
    "quantity": 8,
    "dailyRate": 35
  },
  {
    "groupId": "heat-9kw",
    "quantity": 1,
    "dailyRate": 150
  }
]
```

#### Calculated Metrics
```json
{
  "equipmentCostTotal": 2520.00,
  "estimatedDryingDuration": 14,
  "totalAffectedArea": 65.0,
  "dehumidificationCapacity": 415,
  "airmoversCount": 18,
  "totalAmps": 103.25
}
```

### Phase 4: Tier 1 Questions (RED - Critical)
```json
{
  "T1_Q1_propertyType": "Heritage-listed single-storey residential",
  "T1_Q2_constructionYear": "Pre-1970 (1925)",
  "T1_Q3_waterSource": "Roof leak during storm - Category 1 water with extended exposure",
  "T1_Q4_occupancyStatus": "Vacant - Heritage restoration project",
  "T1_Q4_petsPresent": "N/A - Vacant property",
  "T1_Q5_roomsAffected": "Master bedroom, Study, Hallway, Lounge room (partial). Water entered through roof and migrated through multiple structural elements.",
  "T1_Q6_materialsAffected": [
    "Original timber floorboards",
    "Plaster walls",
    "Timber skirting boards",
    "Original ceiling",
    "Timber framing"
  ],
  "T1_Q7_hazards": [
    "Active mould growth",
    "Suspected asbestos (pre-1970 construction)",
    "Lead paint (heritage property)"
  ],
  "T1_Q8_waterDuration": "1-2 weeks (8 days exposure before discovery)"
}
```

---

## Testing Checklist

Use these scenarios to test:

### Phase 1: Pricing Configuration
- [ ] Create pricing configuration with Scenario 1 data
- [ ] Verify all rates are saved correctly
- [ ] Test rate calculations in cost estimation

### Phase 2: Initial Data Entry
- [ ] Test all 4 scenarios with different property types
- [ ] Verify postcode validation and state detection
- [ ] Test date validation (future dates should fail)

### Phase 2.5: Equipment Tools Selection
- [ ] Test Drying Potential calculation with different water classes
- [ ] Test Scope Areas with multiple rooms and varying wet percentages
- [ ] Test Equipment Selection with different equipment combinations
- [ ] Verify cost calculations (equipmentCostTotal)
- [ ] Verify total amps calculation
- [ ] Verify estimated drying duration
- [ ] Test data persistence on page refresh
- [ ] Verify equipment data appears in generated reports

### Phase 3: Technician Report Analysis
- [ ] Submit technician reports and verify AI analysis
- [ ] Check that all key information is extracted
- [ ] Verify affected areas, materials, and hazards are identified

### Phase 4: Tiered Questions
- [ ] Test Tier 1 validation (all 8 questions required)
- [ ] Test Tier 2 optional questions (can skip)
- [ ] Test Tier 3 optional questions
- [ ] Verify conflict detection (e.g., vacant + pets)
- [ ] Test hazard flagging triggers

### Phase 5: Inspection Report Generation
- [ ] Generate Basic Report for Scenario 1
- [ ] Generate Enhanced Report for Scenario 2
- [ ] Verify all 13 sections are included
- [ ] Check state-specific regulatory references

### Phase 6: Scope of Works Generation
- [ ] Generate scope for all scenarios
- [ ] Verify line items (RW_1 through RW_10)
- [ ] Check licensed trades are included when hazards present
- [ ] Verify pricing calculations

### Phase 7: Cost Estimation Generation
- [ ] Generate cost estimation for all scenarios
- [ ] Verify cost breakdown by category
- [ ] Check GST calculation (10%)
- [ ] Verify industry comparison
- [ ] Check flagged items for high-value claims

### Phase 8: Export Package
- [ ] Export PDF format
- [ ] Export JSON format
- [ ] Export ZIP format
- [ ] Verify watermarks on all documents

### Phase 9: Geographic Intelligence
- [ ] Test with different postcodes (4000 QLD, 2000 NSW, 3000 VIC)
- [ ] Verify state detection
- [ ] Check weather pattern identification
- [ ] Verify building requirements for cyclone-prone areas

### Phase 10: Auto-Triggers
- [ ] Test pre-1970 construction → asbestos flag
- [ ] Test Category 3 water → biohazard protocols
- [ ] Test Yellow Tongue → Class 4 drying
- [ ] Test hazards → STOP WORK flags

### Phase 11: Validation & Completeness
- [ ] Test required field validation
- [ ] Test conflict detection
- [ ] Test completeness score calculation
- [ ] Test pre-generation checklist
- [ ] Verify warnings for high-value/low-value estimates

---

## Expected Outcomes

### Scenario 1 (Standard Residential):
- **Completeness Score**: ~95%
- **Estimated Cost**: $6,500 - $8,500
- **Drying Duration**: 7 days
- **No Hazards**: Standard protocols

### Scenario 2 (Complex Commercial):
- **Completeness Score**: ~90%
- **Estimated Cost**: $15,000 - $25,000+ (before specialist quotes)
- **Drying Duration**: 14+ days (Class 4)
- **Hazards**: Asbestos, Mould, Electrical
- **STOP WORK Flags**: Multiple

### Scenario 3 (Category 3 Biohazard):
- **Completeness Score**: ~95%
- **Estimated Cost**: $8,000 - $12,000
- **Drying Duration**: 7-10 days
- **Hazards**: Biohazard contamination
- **EPA Notification**: Required

### Scenario 4 (Heritage Extended Exposure):
- **Completeness Score**: ~85%
- **Estimated Cost**: $12,000 - $18,000+ (before specialist quotes)
- **Drying Duration**: 14+ days
- **Hazards**: Mould, Asbestos, Lead Paint
- **Heritage Protocols**: Required

---

## Notes for Testing

1. **Start with Scenario 1** - It's the simplest and will test basic functionality
2. **Progress to Scenario 2** - Tests complex multi-hazard scenarios
3. **Test Scenario 3** - Validates biohazard protocols
4. **Finish with Scenario 4** - Tests extended exposure and heritage requirements

5. **Validation Testing**: Try submitting forms with missing required fields to test validation
6. **Conflict Detection**: Test with contradictory answers (e.g., vacant + pets)
7. **Completeness**: Test with partial data to see completeness score changes
8. **Export Testing**: Generate all documents and verify formatting and watermarks

