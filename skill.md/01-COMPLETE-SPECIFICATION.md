# Complete NIR Specification
## National Inspection Report - Detailed Technical Requirements

---

## 1. SYSTEM OVERVIEW

### What is NIR?
A **national standardized inspection and scope-of-work report format** that automatically generates professional reports from technician measurements and observations.

### Core Principle
- **Technician Role:** Measure, observe, photograph (NO interpretation)
- - **System Role:** Interpret data and generate professional reports
  - - **Outcome:** Consistent, professional reports every time
   
    - ---

    ## 2. DATA COLLECTION (TECHNICIAN STAGE)

    ### Required Inputs

    #### 2.1 Environmental Data
    ```
    - Property Address (auto-populates building code and state regulations)
    - Date & Time of Inspection
    - Ambient Temperature (°F)
    - Humidity Level (%)
    - Dew Point (°F)
    - Air Circulation (yes/no)
    ```

    #### 2.2 Moisture Readings
    ```
    - Location 1-N:
      - Surface Type (drywall, wood, carpet, etc.)
      - Moisture (%): Measurement
      - Depth: Surface | Subsurface
    ```

    #### 2.3 Affected Areas
    ```
    - Room/Zone ID
    - Category (A, B, C, D - per IICRC standards)
    - Class (1, 2, 3, 4 - per IICRC standards)
    - Affected Square Footage
    - Water Source (clean water, grey water, black water)
    - Time Since Loss (hours)
    ```

    #### 2.4 Photos & Documentation
    ```
    - Photo 1-N: Timestamp auto-added
      - Location
      - Visible damage
      - Equipment setup
      - Before conditions
    ```

    #### 2.5 Scope Items (Structured Form - Dropdowns Only)
    ```
    For Each Identified Area:
      - [ ] Remove carpet
      - [ ] Sanitize materials
      - [ ] Install dehumidification
      - [ ] Install air movers
      - [ ] Extract standing water
      - [ ] Demolish drywall (specify height)
      - [ ] Apply antimicrobial treatment
      - [ ] Dry out structure
      - [ ] Other: ____
    ```

    **CRITICAL:** Form uses dropdowns and checklists only - NO interpretation required from technician.

    ---

    ## 3. DATA VALIDATION (SYSTEM STAGE 1)

    ### Auto-Validation Rules
    ```
    ✓ All required fields populated
    ✓ Temperature within reasonable range (-20°F to 130°F)
    ✓ Humidity within reasonable range (0-100%)
    ✓ Moisture readings match surface type expectations
    ✓ Photos present for each affected area
    ✓ Scope items match damage category/class
    ✓ Square footage is numeric and > 0
    ✓ Address resolves to valid location
    ```

    ### Validation Error Handling
    - System rejects incomplete submissions
    - - Highlights missing fields
      - - Provides guidance for re-submission
        - - Never proceeds with invalid data
         
          - ---

          ## 4. BUILDING CODE LOOKUP (SYSTEM STAGE 2)

          ### By State
          ```
          Input: Property Address
          Output:
            - State Building Code Version
            - Moisture threshold %
            - Drying time standards
            - Dehumidification requirements
            - Certification requirements (if any)
          ```

          ### Example: QLD Triggering Standards
          ```
          If moisture > 20% AND drywall affected:
            ✓ Requires dehumidification (mandatory)
            ✓ Requires 48-72hr drying assessment
            ✓ If > 3 days damp: requires mold testing
          ```

          ---

          ## 5. DAMAGE CLASSIFICATION (SYSTEM STAGE 3)

          ### IICRC Standards Applied

          **Categories (Water Source):**
          ```
          Category 1: Clean Water
            - Potable water, broken pipes, toilet bowl
            - No significant contamination

          Category 2: Grey Water
            - Washing machine, dishwasher
            - Contains contaminants, not fecal

          Category 3: Black Water
            - Sewage, contaminated water
            - Requires containment, PPE

          Category 4: Specialty Drying
            - Brackish water, contaminated
            - Specialty drying protocols
          ```

          **Classes (Affected Area Size):**
          ```
          Class 1: <10% of floor space
            - Evaporation adequate
            - Standard drying equipment

          Class 2: 10-50% of floor space
            - Requires air movement + dehumidification
            - 24-48 hours drying

          Class 3: >50% of floor space
            - Requires aggressive drying
            - All equipment deployed
            - 48-72+ hours drying

          Class 4: Specialty Drying
            - Concrete, hardwood, dense materials
            - Extended drying (weeks)
            - Specialty equipment required
          ```

          ### System Logic
          ```
          Input: Environmental data + location + surface type + moisture
          Process:
            1. Match moisture level to IICRC category
            2. Calculate affected square footage
            3. Determine class based on percentage
            4. Output: Category X, Class Y with justification
          Output: Classification with standard references
          ```

          ---

          ## 6. SCOPE ITEM EVALUATION (SYSTEM STAGE 4)

          ### Item Cost Database
          ```
          Maintains: National average costs for common items
          Updates: Quarterly from industry data
          Includes: Equipment rental, labor, materials

          Examples:
            - Carpet removal: $1.50-2.50/sq ft
            - Drywall removal: $2.00-3.50/sq ft
            - Dehumidifier rental: $40-60/day
            - Air mover rental: $20-30/day
            - Antimicrobial treatment: $0.50-1.50/sq ft
            - Extraction & cleanup: $500-2000
          ```

          ### Automatic Scope Generation
          ```
          System determines necessary items based on:
            - Category/Class classification
            - Building code requirements
            - Industry standards (IICRC)
            - Affected area & surface type
            - Water source contamination level

          Examples:
            - Class 2 + drywall affected → Auto-add drywall removal
            - Category 3 → Auto-add containment + antimicrobial
            - Hardwood floors + moisture > 15% → Auto-add specialty drying
          ```

          ---

          ## 7. COST ESTIMATION (SYSTEM STAGE 5)

          ### Cost Calculation
          ```
          For Each Scope Item:
            Cost = Item Rate × Quantity (or duration)

          Examples:
            - Remove 800 sq ft carpet @ $2.00/sq ft = $1,600
            - Rent dehumidifier 5 days @ $50/day = $250
            - Antimicrobial 1,200 sq ft @ $1.00/sq ft = $1,200

          Total Project Cost = Sum of all items + contingency
          ```

          ### Contingency
          ```
          Added automatically: 10-15%
            Accounts for unknown scope
            Buffer for extended drying
            Debris disposal variance
          ```

          ---

          ## 8. VERIFICATION CHECKLIST (SYSTEM STAGE 6)

          ### Auto-Generated Checklist
          ```
          For Insurance Adjuster / Client:

          □ Property Address Verified
          □ Environmental data recorded
          □ All affected areas photographed
          □ Moisture readings taken (locations documented)
          □ Category/Class classification justified
          □ Building code requirements identified
          □ Scope items appropriate for damage type
          □ Cost estimate within industry norms
          □ All IICRC standards referenced
          □ Timeline realistic for class/category
          □ Equipment appropriate for job size
          □ Report signed by technician & reviewer

          This checklist is for verification only -
          not for the technician to complete.
          ```

          ---

          ## 9. REPORT OUTPUT FORMATS

          ### Format 1: PDF (Client/Insurance)
          ```
          - Professional layout
          - All data in readable format
          - Photos with timestamps
          - Cost breakdown
          - Scope justification
          - Building code references
          - Signature/verification block
          - Digital watermark
          ```

          ### Format 2: JSON (Data Integration)
          ```
          {
            "inspection": {
              "id": "NIR-2025-12-0001",
              "property": {...},
              "environmental": {...},
              "moisture_readings": [...],
              "classification": {
                "category": "...",
                "class": "...",
                "justification": "..."
              },
              "scope": [...],
              "costs": {...},
              "signatures": {...}
            }
          }
          ```

          ### Format 3: Excel (Admin/Billing)
          ```
          - Summary tab
          - Detail breakdown
          - Line items with costs
          - Photos attached as images
          - Audit trail
          - Printable format
          ```

          ---

          ## 10. AUDIT TRAIL

          ### Automatic Logging
          ```
          Every action logged:
            - User: Technician ID
            - Action: Data entered, photo added, form submitted
            - Timestamp: Date & time
            - Device: Mobile/web
            - GPS: Location (if available)
            - Changes: What was modified

          System prevents:
            - Backdating data
            - Modification without audit record
            - Report generation without complete data
          ```

          ---

          ## 11. BUSINESS RULES

          ### Rule 1: No Manual Intervention
          ```
          System must be fully automatic:
            ✓ No human review for classification
            ✓ No manual cost adjustments required
            ✓ No scope interpretation needed
            ✗ Not allowed: Human override of system decisions
          ```

          ### Rule 2: Standards-Based Decisions
          ```
          All decisions justified by:
            ✓ IICRC standards (S500/S520/S700)
            ✓ Building codes (state-specific)
            ✓ Industry norms (peer-reviewed data)
            ✗ Not allowed: Opinion-based scope
          ```

          ### Rule 3: Complete Data Requirement
          ```
          No report generation without:
            ✓ Environmental data
            ✓ All moisture readings
            ✓ Photos of each area
            ✓ Scope selections
            ✓ Technician acknowledgment
            ✗ Partial reports not permitted
          ```

          ---

          ## 12. SUCCESS CRITERIA

          The system is successful when:

          ✅ Junior technician produces professional report
          ✅ Report automatically categorized per IICRC
          ✅ Costs within 10% of actual final costs
          ✅ Insurance adjuster accepts report without questions
          ✅ No re-inspections required
          ✅ Report generated < 5 minutes
          ✅ Audit trail complete
          ✅ Zero errors in building code application
          ✅ 90%+ of scope items used in real claims
          ✅ Client satisfaction > 95%

          ---

          ## 13. INTEGRATION POINTS

          ### Backend Integration
          ```
          - Stripe (payments)
          - SendGrid (emails)
          - AWS S3 (photo storage)
          - Auth0 (authentication)
          - Vercel (deployment)
          ```

          ### Data Integration
          ```
          - Insurance systems (API)
          - TPA platforms (API)
          - Accounting software (manual export)
          - CRM systems (API)
          ```

          ---

          ## Next Steps

          → Review **02-DATA-ARCHITECTURE.md** for database schema
          → Review **03-TECHNICIAN-WORKFLOW.md** for user flows
          → Review **07-IMPLEMENTATION-ROADMAP.md** for build phases
