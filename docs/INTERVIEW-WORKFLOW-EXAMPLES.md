# Guided Interview - Real Workflow Examples

## Complete End-to-End Example: Water Damage Assessment

### Scenario: Burst water pipe in residential property (QLD)

---

## Interview Flow Visualization

```
┌─────────────────────────────────────────────────────────────┐
│                 GUIDED INTERVIEW START                      │
│  "Let's assess this water damage property..."              │
│  Estimated time: 5 minutes                                 │
│  Standards-backed questions from IICRC + State Codes       │
└──────────────────┬──────────────────────────────────────────┘
                   │
        ╔══════════╩══════════╗
        ║  TIER 1: ESSENTIAL  ║
        ║  (5 Questions)      ║
        ║  → Initial class.   ║
        ║  → Building basics  ║
        ║  → Safety checks    ║
        ╚══════════╤══════════╝
                   ↓

┌─────────────────────────────────────────────────────────────┐
│ Q1: "Where did the water come from?"                        │
├─────────────────────────────────────────────────────────────┤
│ 🔘 Clean water (supply line burst, roof leak)              │
│ 🔘 Grey water (washing machine, dishwasher, toilet)        │
│ 🔘 Black water (sewage backup, contaminated)               │
│                                                              │
│ IICRC Reference: S500 Section 2 - Water Source Classification│
│ Building Code: QDC 4.5 - Water Category Determination       │
└─────────────────────────────────────────────────────────────┘

👤 TECHNICIAN ANSWER: "Clean water (supply line burst)"

↓ Auto-populated in form:
  ├─ sourceOfWater: "supply_line_burst" [Confidence: 100%]
  ├─ waterCategory: "Category 1" [Confidence: 95%] ← IICRC S500
  └─ safetyHazards: "Electrical contact risk" [Confidence: 80%]

        ╔═════════════════════════════════════╗
        ║ SKIP LOGIC CHECK:                   ║
        ║ Clean water + residential area      ║
        ║ → Skip "contamination protocols"    ║
        ║ → Skip "black water PPE"            ║
        ║ → Show "standard drying procedures" ║
        ╚═════════════════════════════════════╝

                   ↓
┌─────────────────────────────────────────────────────────────┐
│ Q2: "How many hours ago did the loss occur?"                │
├─────────────────────────────────────────────────────────────┤
│ 🔘 < 12 hours ago      (Fresh loss)
│ 🔘 12-48 hours ago     (Moderate urgency)
│ 🔘 48-72 hours ago     (Degradation risk)
│ 🔘 > 72 hours ago      (Category upgrade)
│                                                              │
│ IICRC Reference: S500 Section 3 - Time-Based Classification │
│ Building Code: QDC 4.5 - Moisture Degradation Timeline      │
└─────────────────────────────────────────────────────────────┘

👤 TECHNICIAN ANSWER: "24 hours ago"

↓ Auto-populated in form:
  ├─ timeSinceLoss: "24" hours [Confidence: 100%]
  ├─ waterCategory: "Category 1" [Confidence: 100%] ← Confirmed
  │  (still clean, no contamination after 24hrs in residential)
  └─ urgencyLevel: "HIGH" [Confidence: 90%]

        ╔═════════════════════════════════════╗
        ║ BUILDING CODE TRIGGER:              ║
        ║ Postcode 4000 (QLD)                 ║
        ║ + Residential building              ║
        ║ → Moisture threshold: 20%           ║
        ║ → Drying deadline: 72 hours         ║
        ║ → Dehumidification: Required        ║
        ╚═════════════════════════════════════╝

                   ↓
┌─────────────────────────────────────────────────────────────┐
│ Q3: "What's the affected area percentage?"                  │
├─────────────────────────────────────────────────────────────┤
│ 🔘 0-10%    (Isolated)
│ 🔘 10-30%   (Moderate - 1 room)
│ 🔘 30-50%   (Significant - 2-3 rooms)
│ 🔘 >50%     (Extensive - majority of property)
│                                                              │
│ Helper: "Usually a standard bedroom or bathroom = ~10%"    │
└─────────────────────────────────────────────────────────────┘

👤 TECHNICIAN ANSWER: "15%" (2 rooms: master bedroom + ensuite)

↓ Auto-populated in form:
  ├─ affectedAreaPercentage: "15%" [Confidence: 100%]
  ├─ waterClass: "Class 2" [Confidence: 90%] ← IICRC S500 inferred
  │  (Moderate moisture, 15% perimeter rooms, carpet + drywall)
  ├─ estimatedSquareFootage: "~40-50 sq ft" [Confidence: 75%]
  └─ recommendedDryingTime: "48-72 hours" [Confidence: 85%]

        ╔═════════════════════════════════════╗
        ║ CONDITIONAL QUESTION TRIGGER:       ║
        ║ affectedAreaPercentage > 10%        ║
        ║ → Show "Q4: Structural assessment"  ║
        ║ → Show "Q5: Environmental data"     ║
        ╚═════════════════════════════════════╝

                   ↓
┌─────────────────────────────────────────────────────────────┐
│ Q4: "What materials are affected?" (Multi-select)           │
├─────────────────────────────────────────────────────────────┤
│ ☑ Drywall         ☑ Carpet          ☐ Wood flooring
│ ☑ Concrete        ☐ Tile            ☐ Structural timber
│                                                              │
│ IICRC Reference: S500 Section 4 - Material Classification   │
│ Building Code: NCC 2025 - Material-Specific Drying Rules    │
└─────────────────────────────────────────────────────────────┘

👤 TECHNICIAN ANSWER: Selects "Drywall" + "Carpet"

↓ Auto-populated in form:
  ├─ affectedMaterials: ["drywall", "carpet"] [Confidence: 100%]
  ├─ waterClass: "Class 2" [Confidence: 95%] ← Confirmed
  │  (Porous materials = Class 2, requires LGR)
  ├─ dryingMethodRequired: "LGR Dehumidification + Air movers"
  │  [Confidence: 92%] ← IICRC S500 Section 5
  ├─ estimatedDryingTime: "48-72 hours" [Confidence: 88%]
  └─ antimicrobialTreatment: "Recommended"
     [Confidence: 85%] ← Building Code + WHS

        ╔═════════════════════════════════════╗
        ║ SKIP LOGIC CHECK:                   ║
        ║ Materials = [drywall, carpet]       ║
        ║ → Skip "concrete curing questions"  ║
        ║ → Show "antimicrobial questions"    ║
        ║ → Show "air quality monitoring"     ║
        ╚═════════════════════════════════════╝

                   ↓
        ╔══════════════════════════════════╗
        ║  TIER 2: ENVIRONMENTAL DATA      ║
        ║  (3 Questions)                   ║
        ║  → Current conditions            ║
        ║  → Drying calculations           ║
        ╚═════════════╤═════════════════════╝
                      ↓

┌─────────────────────────────────────────────────────────────┐
│ Q5: "What's the current temperature?" (Numeric input)       │
├─────────────────────────────────────────────────────────────┤
│ [Input: 22 degrees Celsius]                                 │
│                                                              │
│ Normal range: 10-30°C | Recommended: 20-24°C               │
│ IICRC Reference: S500 Section 6 - Psychrometric Assessment │
└─────────────────────────────────────────────────────────────┘

👤 TECHNICIAN ANSWER: 22°C

↓ Auto-populated in form:
  ├─ temperatureCurrent: "22" °C [Confidence: 100%]
  └─ psychrometricAssessment: "Optimal temperature for drying"
     [Confidence: 90%]

                   ↓
┌─────────────────────────────────────────────────────────────┐
│ Q6: "What's the current humidity level?" (Numeric input)    │
├─────────────────────────────────────────────────────────────┤
│ [Input: 65% RH]                                             │
│                                                              │
│ Typical range: 30-100% | Target for drying: 30-50%        │
│ IICRC Reference: S500 Section 7 - Humidity Calculations    │
└─────────────────────────────────────────────────────────────┘

👤 TECHNICIAN ANSWER: 65% RH

↓ Auto-populated in form:
  ├─ humidityCurrent: "65" % [Confidence: 100%]
  ├─ humidityDelta: "35%" (from target 30%) [Confidence: 95%]
  │  ← IICRC S500 Psychrometric calculation
  ├─ dehumidificationRequired: true [Confidence: 100%]
  ├─ dehumidifierCapacity: "1 LGR per 1250 cu-ft"
  │  [Confidence: 90%] ← IICRC S500 Equipment section
  └─ equipmentType: "LGR (Low Grain Refrigeration)"
     [Confidence: 92%] ← Porous + current humidity

        ╔═════════════════════════════════════╗
        ║ EQUIPMENT CALCULATION (TRIGGERED):  ║
        ║ Class 2 + 15% area + drywall        ║
        ║ → 1 LGR dehumidifier                ║
        ║ → 2 air movers (1 per 100 sq ft)    ║
        ║ → Estimated daily cost: $180        ║
        ║ → Estimated duration: 5 days        ║
        ║ → Total cost: $900                  ║
        ╚═════════════════════════════════════╝

                   ↓
        ╔══════════════════════════════════╗
        ║  TIER 3: BUILDING CODE           ║
        ║  & COMPLIANCE (5 Questions)      ║
        ║  → State-specific rules          ║
        ║  → Building age triggers         ║
        ║  → Safety requirements           ║
        ╚═════════════╤═════════════════════╝
                      ↓

┌─────────────────────────────────────────────────────────────┐
│ Q7: "What year was the building constructed?"               │
├─────────────────────────────────────────────────────────────┤
│ 🔘 Pre-1980 (May contain asbestos)
│ 🔘 1980-2000 (Possible lead paint)
│ 🔘 2000-2010
│ 🔘 Post-2010  (Compliant with modern standards)
│                                                              │
│ QDC Reference: 4.5 Section 3.4 - Material Hazards           │
│ EPA Reference: Environmental Protection Regulation 2008     │
└─────────────────────────────────────────────────────────────┘

👤 TECHNICIAN ANSWER: "1995" (Built 1995)

↓ Auto-populated in form:
  ├─ buildingAge: "1995" [Confidence: 100%]
  ├─ asbestosHazardPresent: true [Confidence: 85%]
  │  [Confidence: 85%] ← Pre-2000 + Queensland EPA rules
  ├─ leadPaintHazardPresent: true [Confidence: 75%]
  ├─ buildingCodeApplicable: "QDC 4.5"
  │  [Confidence: 100%] ← Postcode 4000 = QLD
  ├─ requiredAction: "Asbestos survey recommended before remediation"
  │  [Confidence: 90%] ← WHS Act 2011 Section 36
  └─ complianceNotification: "This job requires qualified asbestos surveyor"

        ╔═════════════════════════════════════╗
        ║ SKIP LOGIC UPDATE:                  ║
        ║ Building year = 1995                ║
        ║ → Show "Q7a: Visible asbestos?"    ║
        ║ → Show "Q7b: Lead paint visible?"  ║
        ║ → Skip "modern materials Q"         ║
        ╚═════════════════════════════════════╝

        AND:

        ╔═════════════════════════════════════╗
        ║ CONDITIONAL QUESTION (Auto-triggered)
        ║ affectedArea > 10% + pre-1990      ║
        ║ → Ask "Asbestos survey required?"  ║
        ╚═════════════════════════════════════╝

                   ↓
┌─────────────────────────────────────────────────────────────┐
│ Q7a: "Can you see any visible asbestos?" (yes/no/unsure)   │
├─────────────────────────────────────────────────────────────┤
│ 🔘 Yes - friable material visible
│ 🔘 No - not visible
│ 🔘 Unsure - need professional assessment
│                                                              │
│ WHS Reference: Work Health and Safety Act 2011 s36         │
│ Queensland Reference: Environmental Protection Reg 2008     │
└─────────────────────────────────────────────────────────────┘

👤 TECHNICIAN ANSWER: "Unsure"

↓ Auto-populated in form:
  ├─ asbestosVisibilityConfirmed: false [Confidence: 100%]
  ├─ asbestosSurveyRequired: true [Confidence: 95%]
  │  ← WHS Act mandate for pre-1990 buildings
  └─ requiredAction: "Engage licensed asbestos surveyor (MUST) before proceeding"
     [Confidence: 100%]

        ╔═════════════════════════════════════╗
        ║ WHS SAFETY FLAG:                    ║
        ║ ⚠️ STOP work until asbestos survey  ║
        ║    completed. Show red warning      ║
        ║    banner in form.                  ║
        ╚═════════════════════════════════════╝

                   ↓
        ╔═════════════════════════════════════╗
        ║  TIER 4: ELECTRICAL & PLUMBING     ║
        ║  (Conditional questions)           ║
        ║  → Only show if triggered          ║
        ╚═════════════╤═════════════════════╝
                      ↓

┌─────────────────────────────────────────────────────────────┐
│ Q8: "Is electrical equipment affected?" (yes/no)            │
├─────────────────────────────────────────────────────────────┤
│ Location context: master bedroom + ensuite                 │
│ (electrical is typically present)                           │
│                                                              │
│ AS/NZS Reference: AS/NZS 3000:2023 - Electrical wiring    │
│ WHS Reference: Work Health and Safety Act 2011             │
└─────────────────────────────────────────────────────────────┘

👤 TECHNICIAN ANSWER: "Yes"

↓ Auto-populated in form:
  ├─ electricalEquipmentAffected: true [Confidence: 100%]
  ├─ electricalSafetyRequired: true [Confidence: 100%]
  └─ requiredAction: "Electrical isolation required. Licensed electrician must verify safety."
     [Confidence: 95%] ← AS/NZS 3000 mandate

        ╔═════════════════════════════════════╗
        ║ SKIP LOGIC:                         ║
        ║ Electrical affected = true          ║
        ║ → Show "Q8a: Which equipment?"     ║
        ║ → Show "Q8b: Power isolated?"      ║
        ╚═════════════════════════════════════╝

                   ↓
┌─────────────────────────────────────────────────────────────┐
│ Q8a: "What electrical equipment is affected?" (multi)       │
├─────────────────────────────────────────────────────────────┤
│ ☑ Power outlets     ☐ Light fixtures
│ ☑ Light switches    ☐ Panel/switchboard
│                                                              │
│ AS/NZS Reference: AS/NZS 3000:2023 Section 7 - Circuits   │
└─────────────────────────────────────────────────────────────┘

👤 TECHNICIAN ANSWER: "Power outlets, Light switches"

↓ Auto-populated in form:
  ├─ electricalEquipmentTypes: ["outlets", "switches"] [100%]
  ├─ electricalRepairNeeded: true [Confidence: 95%]
  ├─ electricianRequired: "Licensed" [Confidence: 100%]
  ├─ safetyRisk: "HIGH - power hazard until isolated"
  │  [Confidence: 98%] ← AS/NZS 3000 + WHS Act
  └─ estimatedElectricalCost: "$400-600 for inspection + repairs"

        ╔═════════════════════════════════════╗
        ║ COMPLIANCE CHECK:                   ║
        ║ Electrical + wet environment        ║
        ║ → AS/NZS 3000 compliance check      ║
        ║ → WHS electrical safety protocol    ║
        ║ → Electrician quote required        ║
        ╚═════════════════════════════════════╝

                   ↓
┌─────────────────────────────────────────────────────────────┐
│ Q9: "Has the electrical power been isolated?"               │
├─────────────────────────────────────────────────────────────┤
│ 🔘 Yes - Isolated at breaker
│ 🔘 No - Still live
│ 🔘 Unsure - Need electrician to check
│                                                              │
│ AS/NZS Reference: AS/NZS 3000:2023 s4.3.1 - Safe isolation │
│ WHS Reference: Work Health and Safety Act s36 - Electrical │
└─────────────────────────────────────────────────────────────┘

👤 TECHNICIAN ANSWER: "Yes - Isolated at breaker"

↓ Auto-populated in form:
  ├─ electricalPowerIsolated: true [Confidence: 100%]
  ├─ safetyRisk: "LOW - power isolated"
  │  [Confidence: 100%]
  └─ clearanceToProceeded: true
     [Confidence: 100%]

        ╔═════════════════════════════════════╗
        ║ SAFETY STATUS:                      ║
        ║ ✓ Power isolated                    ║
        ║ → Safe to proceed with drying       ║
        ║ → Electrician still required for    ║
        ║   repair/testing post-drying        ║
        ╚═════════════════════════════════════╝

                   ↓
┌─────────────────────────────────────────────────────────────┐
│ Q10: "What about the plumbing system?" (yes/no)             │
├─────────────────────────────────────────────────────────────┤
│ Loss source: Supply line burst (bathroom ensuite)          │
│                                                              │
│ AS/NZS Reference: AS/NZS 3500:2021 - Plumbing systems     │
│ Building Code Reference: QDC 4.5 - Plumbing Standards     │
└─────────────────────────────────────────────────────────────┘

👤 TECHNICIAN ANSWER: "Yes - Burst supply line"

↓ Auto-populated in form:
  ├─ plumbingSystemAffected: true [Confidence: 100%]
  ├─ plumbingRepairType: "Supply line replacement"
     [Confidence: 90%]
  ├─ waterSupplyStatus: "Can be isolated" [Confidence: 95%]
  ├─ licensedPlumberRequired: true [Confidence: 100%]
  │  ← AS/NZS 3500 mandate
  └─ estimatedPlumbingCost: "$600-1000 for replacement"

                   ↓
        ╔══════════════════════════════════╗
        ║  INTERVIEW COMPLETE               ║
        ║  10 questions answered            ║
        ║  ~5 minutes elapsed               ║
        ║                                   ║
        ║  Confidence Summary:              ║
        ║  • 30 fields auto-populated      ║
        ║  • Average confidence: 91%       ║
        ║  • 8 fields flagged for review   ║
        ║  • 4 professional quotes needed  ║
        ╚══════════════════════════════════╝

                   ↓
        ╔══════════════════════════════════╗
        ║  AUTO-POPULATED FORM SUMMARY      ║
        ╚═══════╤════════════════════════════╝
                ↓
```

---

## Auto-Populated Fields Summary

| Form Field | Value | Confidence | Source | Standards Ref |
|-----------|-------|-----------|--------|--------------|
| sourceOfWater | Supply line burst | 100% | Q1 Answer | IICRC S500 |
| waterCategory | Category 1 | 95% | Q1 + Q2 | IICRC S500 |
| waterClass | Class 2 | 90% | Q3, Q4 | IICRC S500 |
| timeSinceLoss | 24 hours | 100% | Q2 Answer | IICRC S500 |
| affectedAreaPercentage | 15% | 100% | Q3 Answer | Form input |
| affectedMaterials | Drywall, Carpet | 100% | Q4 Answer | IICRC S500 |
| temperatureCurrent | 22°C | 100% | Q5 Answer | Psychrometric |
| humidityCurrent | 65% RH | 100% | Q6 Answer | Psychrometric |
| buildingAge | 1995 | 100% | Q7 Answer | Building info |
| asbestosSurveyRequired | TRUE | 95% | Q7 (pre-1990) | WHS Act 2011 |
| electricalEquipmentAffected | TRUE | 100% | Q8 Answer | AS/NZS 3000 |
| electricalEquipmentTypes | Outlets, Switches | 100% | Q8a Answer | AS/NZS 3000 |
| electricalPowerIsolated | TRUE | 100% | Q9 Answer | AS/NZS 3000 |
| plumbingSystemAffected | TRUE | 100% | Q10 Answer | AS/NZS 3500 |
| dryingMethodRequired | LGR + Air movers | 92% | Q4 + Materials | IICRC S500 |
| dehumidifierCapacity | 1 LGR per 1250 cu-ft | 90% | Q3 + Q6 | IICRC S500 |
| equipmentType | LGR Dehumidification | 92% | Class 2 + Humidity | IICRC S500 |
| estimatedDryingTime | 48-72 hours | 88% | Q2 + Q4 + Materials | IICRC S500 |
| safetyHazards | Electrical + Asbestos | 85% | Q1 + Q7 + Q8 | WHS Act 2011 |
| requiredActions | 4 items (see below) | 90-100% | Multiple Q | Building codes |

---

## Equipment Recommendations Generated

```
Based on Interview Answers:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DEHUMIDIFICATION
  Type: LGR (Low Grain Refrigeration)
  Quantity: 1 unit
  Capacity: 90-130 pints/day (recommended min 90 for Class 2)
  Why: Class 2 water + 65% humidity + porous materials
  Standards: IICRC S500 Section 6 - Equipment specifications
  Daily Rate: $85
  Estimated Days: 5 days
  Total Cost: $425

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

AIR MOVEMENT
  Type: Axial Air Mover
  Quantity: 2 units (15% area ÷ 100 sq ft per mover)
  Capacity: 2800-4200 CFM each
  Why: 15% affected area requires multiple units for circulation
  Standards: IICRC S500 Section 5 - Air movement ratios
  Daily Rate: $25 each
  Estimated Days: 5 days
  Total Cost: $250 (2 × $25 × 5)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

AIR QUALITY MONITORING
  Type: Hygrometer + Thermometer
  Quantity: 1-2 units (master bedroom + ensuite)
  Purpose: Monitor drying progress
  Why: Verify humidity reduction toward target 30-40% RH
  Standards: IICRC S500 Section 7 - Psychrometric monitoring
  Daily Rate: $10
  Estimated Days: 5 days
  Total Cost: $50

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

EQUIPMENT TAGGING (Premium Feature)
  This job optimal for:
    ✓ Fast-drying scenario (< 72 hours)
    ✓ Porous materials (carpet + drywall)
    ✓ Moderate humidity delta (65% → 40% target)
    ✓ Class 2 standard drying
    ✓ Residential property (safe containment)

  Recommended Equipment Tags:
    • LGR + Standard air movers (not overkill)
    • Low antimicrobial requirement (Category 1)
    • No air scrubber needed (not Class 3/4)
    • No industrial-grade equipment
    • Monitor electrical isolation during drying

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

TOTAL EQUIPMENT COST: $725 (5-day rental)
  Breakdown:
    - Dehumidifier: $425
    - Air movers: $250
    - Monitoring: $50
```

---

## Required Professional Actions

Based on interview and auto-populated form:

```
⚠️ CRITICAL ACTIONS (Must Complete Before Proceeding)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. ASBESTOS SURVEY (WHS Act 2011 s36 Mandate)
   Status: REQUIRED
   Building Age: 1995 (pre-2000 = presumed asbestos risk)
   Reason: Friability uncertain, cannot proceed safely
   Standards: Work Health and Safety Act 2011
   Action: Contact licensed asbestos surveyor
   Estimated Cost: $400-600
   Recommended Timeline: BEFORE any disturbance

2. ELECTRICAL INSPECTION (AS/NZS 3000 Requirement)
   Status: REQUIRED
   Equipment Affected: Outlets, Light switches
   Power Status: Isolated at breaker (good)
   Reason: Verification of isolation, damage assessment
   Standards: AS/NZS 3000:2023 Section 4.3
   Action: Contact licensed electrician
   Estimated Cost: $200-300 (inspection)
   Estimated Cost: $400-600 (repairs + testing)
   Recommended Timeline: BEFORE reconnection

3. PLUMBING REPAIR (AS/NZS 3500 Requirement)
   Status: REQUIRED
   Issue: Supply line burst
   Reason: Water source still active, must be replaced
   Standards: AS/NZS 3500:2021 Plumbing Code
   Action: Contact licensed plumber
   Estimated Cost: $600-1000
   Recommended Timeline: BEFORE occupancy

────────────────────────────────────────────────────────────

✓ RECOMMENDED ACTIONS (Best Practice)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. ANTIMICROBIAL TREATMENT
   Reason: Category 1 clean water, but 24 hrs exposure
   Coverage: Affected drywall, carpet backing
   Standards: IICRC S500 Section 8 - Microbial precautions
   Cost: $200-300
   Timeline: During drying phase

2. DOCUMENTATION PHOTOGRAPHY
   Reason: Insurance claim documentation
   Coverage: Pre-treatment condition of materials
   Standards: NECA standards, insurance requirements
   Cost: Included in restoration package
   Timeline: Before treatment begins

3. MOISTURE MONITORING PLAN
   Reason: Track drying progress, verify <20% moisture
   Coverage: Daily readings for 5 days
   Standards: IICRC S500 Section 7 - Verification
   Cost: Included in equipment rental
   Timeline: Daily readings throughout drying
```

---

## Cost Estimate Generated

```
WATER DAMAGE RESTORATION - COST ESTIMATE
Property: Residential, QLD
Date: 2026-01-09
Loss Type: Supply line burst (Category 1, Class 2)
Affected Area: ~40-50 sq ft (2 rooms, 15% property)

═════════════════════════════════════════════════════════════

MITIGATION EQUIPMENT (5 days)
  LGR Dehumidifier (1 × $85/day × 5)    $425
  Air Movers (2 × $25/day × 5)          $250
  Monitoring Equipment (1 × $10/day × 5) $50
  Subtotal Equipment:                    $725

PROFESSIONAL SERVICES
  Asbestos Survey (1995 building)        $400-600
  Electrical Inspection (AS/NZS 3000)    $200-300
  Electrical Repairs (outlets, switches) $400-600
  Plumbing Repair (supply line)          $600-1000
  Antimicrobial Treatment                $200-300
  Subtotal Services:                     $1800-2800

RESTORATION & REMEDIATION
  Drywall replacement (estimated)        $800-1200
  Carpet replacement (estimated)         $1500-2000
  Painting & finishing                   $400-600
  Subtotal Restoration:                  $2700-3800

TOTAL PROJECT ESTIMATE: $5225-7325
  • Equipment & monitoring: $725 (auto-calculated)
  • Professional services: $1800-2800 (from standards)
  • Restoration work: $2700-3800 (materials + labor)

TIMELINE
  Phase 1 (Make-safe): 1-2 days
    - Power isolated ✓ (already done)
    - Asbestos survey
    - Water shut off

  Phase 2 (Drying): 5-7 days
    - Equipment deployed
    - Daily monitoring
    - Environmental adjustments

  Phase 3 (Restoration): 10-14 days
    - Professional repairs
    - Material replacement
    - Finishing work

  Total Duration: 16-23 days

═════════════════════════════════════════════════════════════
```

---

## Standards Applied in Interview

```
STANDARDS REFERENCED IN THIS INTERVIEW:
════════════════════════════════════════

IICRC S500 (Water Restoration) - Referenced 8 times
  ✓ Section 2: Water source classification
  ✓ Section 3: Time-based category determination
  ✓ Section 4: Material classification impact
  ✓ Section 5: Equipment specifications
  ✓ Section 6: Dehumidification calculations
  ✓ Section 7: Psychrometric monitoring
  ✓ Section 8: Microbial precautions

QDC 4.5 (Queensland Development Code) - Referenced 3 times
  ✓ Section 3.4: Asbestos assessment requirements
  ✓ Section 4.5: Moisture thresholds for buildings
  ✓ Building materials standards for water damage

NCC 2025 (National Construction Code) - Referenced 2 times
  ✓ Section 3: Building design and materials
  ✓ Material-specific drying requirements

AS/NZS 3000:2023 (Electrical Safety) - Referenced 2 times
  ✓ Section 4.3: Safe electrical isolation
  ✓ Section 7: Electrical circuit protection

AS/NZS 3500:2021 (Plumbing Code) - Referenced 1 time
  ✓ Supply line sizing and replacement standards

Work Health and Safety Act 2011 - Referenced 3 times
  ✓ Section 36: Electrical safety in wet environments
  ✓ Asbestos handling protocols
  ✓ Hazard assessment requirements

Environmental Protection Regulation 2008 - Referenced 1 time
  ✓ Pre-1990 building hazardous materials (asbestos/lead)

TOTAL: 14 separate regulatory/standards references
CONFIDENCE: 91% average across all auto-populated fields
```

---

## Technician Time Savings Analysis

```
TRADITIONAL FORM COMPLETION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Manual form entry (field-by-field):
  • Read each field (60 fields × 5 sec)        = 300 sec
  • Determine appropriate value                = 180 sec
  • Type/select value                          = 180 sec
  • Verify field accuracy                      = 120 sec
  • Look up standards references               = 240 sec
  • Make corrections for errors                = 120 sec

  TOTAL MANUAL TIME: 1140 seconds (19 minutes)
  Errors: ~15% of fields require correction
  Standards compliance: 70% (many fields missed)


GUIDED INTERVIEW COMPLETION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Interview system (question-driven):
  • Read question (10 questions × 5 sec)      = 50 sec
  • Observe field (smart suggestions)         = 20 sec
  • Answer question                           = 80 sec
  • Review auto-populated fields              = 60 sec
  • Confirm/override values                   = 20 sec

  TOTAL INTERVIEW TIME: 230 seconds (4 minutes)
  Errors: ~3% (auto-calculated from standards)
  Standards compliance: 95% (all standards applied)


TIME SAVINGS: 910 seconds = 15 minutes
PERCENTAGE IMPROVEMENT: 80% faster
ERROR REDUCTION: 12% → 3% (75% fewer errors)
```

---

## Next Step: Create Similar Workflows for Other Scenarios

This example covers **Water Damage (Category 1, Class 2, Residential)**.

Other scenarios would include:
- Water Damage (Category 2, Class 3+)
- Water Damage (Category 3, Black water, high contamination)
- Mold Remediation (Category 1 vs. 3)
- Fire Damage Assessment
- Commercial Large-Scale Loss
- etc.

Each scenario would follow the same **Progressive Tier** structure:
1. Tier 1: Essential (5 core Q's)
2. Tier 2: Environmental (3 Q's)
3. Tier 3: Building Code (3-5 Q's)
4. Tier 4: Specialization (conditional Q's)

---

**Document Version**: 1.0
**Created**: 2026-01-09
**Format**: End-to-end workflow example with real values
