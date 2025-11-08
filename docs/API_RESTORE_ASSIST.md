# RestoreAssist API Documentation

Complete API structure for the inspection → scope → estimation workflow.

---

## Authentication

All endpoints require authentication via NextAuth session.

**Required Headers:**
```
Cookie: next-auth.session-token=<session-token>
```

**Required User Setup:**
- User must have a `PricingStructure` configured
- User must have an Anthropic API key (unless admin role)
- Admin users bypass API key requirement

---

## API Endpoints

### 1. Inspections

#### POST `/api/restore-assist/inspections`
Create new inspection from technician report.

**Request Body:**
```json
{
  "title": "Water Damage - 123 Main St",
  "clientName": "John Doe",
  "propertyAddress": "123 Main St, Sydney NSW 2000",
  "hazardType": "WATER",
  "insuranceType": "Contents & Building",
  "description": "Burst pipe in bathroom",
  "clientId": "optional-client-id"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "report-id",
    "title": "Water Damage - 123 Main St",
    "clientName": "John Doe",
    "propertyAddress": "123 Main St, Sydney NSW 2000",
    "hazardType": "WATER",
    "insuranceType": "Contents & Building",
    "status": "DRAFT",
    "reportNumber": "INS-1234567890",
    "inspectionDate": "2025-01-08T00:00:00.000Z",
    "createdAt": "2025-01-08T00:00:00.000Z"
  }
}
```

**Validation:**
- ✅ Checks user has pricing structure
- ✅ Checks user has API key (admin bypass)
- ✅ Validates required fields

---

#### GET `/api/restore-assist/inspections`
List all user's inspections.

**Query Parameters:**
- `status` (optional): Filter by status (DRAFT, PENDING, APPROVED, COMPLETED, ARCHIVED)
- `clientId` (optional): Filter by client
- `limit` (optional): Number of results (default: 50)
- `offset` (optional): Pagination offset (default: 0)

**Response:**
```json
{
  "success": true,
  "data": {
    "reports": [
      {
        "id": "report-id",
        "title": "Water Damage - 123 Main St",
        "clientName": "John Doe",
        "status": "DRAFT",
        "client": { ... },
        "scope": { ... },
        "estimates": [ ... ]
      }
    ],
    "total": 10,
    "limit": 50,
    "offset": 0
  }
}
```

---

#### GET `/api/restore-assist/inspections/[id]`
Fetch inspection details.

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "report-id",
    "title": "Water Damage - 123 Main St",
    "clientName": "John Doe",
    "propertyAddress": "123 Main St, Sydney NSW 2000",
    "hazardType": "WATER",
    "insuranceType": "Contents & Building",
    "status": "DRAFT",
    "reportNumber": "INS-1234567890",
    "inspectionDate": "2025-01-08T00:00:00.000Z",
    "waterCategory": "Category 2",
    "waterClass": "Class 3",
    "affectedArea": 25.5,
    "structuralDamage": "Drywall damage in bathroom",
    "detailedReport": "AI-generated full report...",
    "client": { ... },
    "scope": { ... },
    "estimates": [ ... ]
  }
}
```

---

#### PUT `/api/restore-assist/inspections/[id]`
Update inspection (regenerate with new Q&A).

**Request Body:**
```json
{
  "title": "Updated Title",
  "description": "Updated description",
  "status": "PENDING",
  "waterCategory": "Category 2",
  "affectedArea": 30.5
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "report-id",
    "title": "Updated Title",
    // ... updated fields
  }
}
```

---

#### DELETE `/api/restore-assist/inspections/[id]`
Soft delete inspection (archives it).

**Response:**
```json
{
  "success": true,
  "message": "Inspection archived successfully"
}
```

---

### 2. Questions

#### GET `/api/restore-assist/inspections/[id]/questions`
Get questions for current tier.

**Query Parameters:**
- `tier` (optional): tier1, tier2, tier3 (default: tier1)

**Response:**
```json
{
  "success": true,
  "data": {
    "tier": "tier1",
    "questions": [
      {
        "id": "water_category",
        "question": "What is the water category?",
        "type": "select",
        "options": ["Category 1", "Category 2", "Category 3"]
      },
      {
        "id": "affected_area",
        "question": "What is the affected area (sqm)?",
        "type": "number"
      }
    ],
    "responses": {}
  }
}
```

**Question Tiers by Hazard Type:**

**WATER:**
- Tier 1: Water category, water class, affected area, source
- Tier 2: Structural damage, contents damage, HVAC affected
- Tier 3: Safety hazards, electrical hazards, microbial growth

**FIRE:**
- Tier 1: Fire severity, affected area, smoke damage
- Tier 2: Structural damage, contents damage, soot depth
- Tier 3: Safety hazards, hazardous materials, odor treatment

**MOULD:**
- Tier 1: Mould extent, affected area, moisture source
- Tier 2: Mould type, structural damage, HVAC contamination
- Tier 3: Containment needed, occupant health, testing required

**MULTI_LOSS:**
- Tier 1: Loss types, primary hazard, total affected area
- Tier 2: Structural damage, contents damage, priority order
- Tier 3: Safety hazards, specialists required, insurance complexity

---

#### POST `/api/restore-assist/inspections/[id]/questions`
Submit question responses.

**Request Body:**
```json
{
  "tier": "tier1",
  "responses": {
    "water_category": "Category 2",
    "water_class": "Class 3",
    "affected_area": "25.5",
    "source_of_water": "Burst pipe"
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "report": { ... },
    "nextTier": "tier2",
    "completed": false
  }
}
```

---

### 3. Generate Report

#### POST `/api/restore-assist/inspections/[id]/generate`
Generate/regenerate full inspection report using AI.

**Request Body:**
```json
{}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "report": {
      "id": "report-id",
      "detailedReport": "# Executive Summary\n\nThis report...",
      "status": "PENDING"
    },
    "detailedReport": "# Executive Summary\n\nThis report..."
  }
}
```

**Process:**
1. Verifies user has API key (admin bypass)
2. Uses Anthropic Claude 3.5 Sonnet to generate report
3. Follows IICRC S500 standards for water damage
4. Updates report status to PENDING
5. Stores detailed report in database

**Prompt Includes:**
- Property information
- Hazard details
- Assessment data (categories, classes, areas)
- Safety considerations
- IICRC compliance requirements

---

### 4. Scopes

#### POST `/api/restore-assist/scopes`
Generate scope from inspection.

**Request Body:**
```json
{
  "reportId": "report-id"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "scope-id",
    "reportId": "report-id",
    "scopeType": "WATER",
    "siteVariables": {
      "affectedArea": 25.5,
      "structureType": "Residential",
      "materials": [],
      "accessibility": "Normal"
    },
    "labourParameters": {
      "roles": [
        {
          "name": "Master Technician",
          "hours": 3.825,
          "rate": 80
        },
        {
          "name": "Qualified Technician",
          "hours": 6.375,
          "rate": 60
        },
        {
          "name": "Labourer",
          "hours": 2.55,
          "rate": 40
        }
      ],
      "totalHours": 12.75,
      "totalCost": 765
    },
    "equipmentParameters": {
      "equipment": [
        {
          "name": "Dehumidifier - Large",
          "quantity": 1,
          "dailyRate": 50
        },
        {
          "name": "Air Mover - Axial",
          "quantity": 2,
          "dailyRate": 20
        }
      ],
      "totalCost": 90
    },
    "chemicalApplication": {
      "chemicals": [
        {
          "name": "Anti-Microbial",
          "area": 25.5,
          "rate": 1.5
        }
      ],
      "totalCost": 38.25
    },
    "timeCalculations": {
      "totalDays": 3,
      "phases": [
        { "name": "Setup", "days": 1 },
        { "name": "Active Drying", "days": 1 },
        { "name": "Completion", "days": 1 }
      ]
    },
    "labourCostTotal": 765,
    "equipmentCostTotal": 90,
    "chemicalCostTotal": 38.25,
    "totalDuration": 3
  }
}
```

**Calculation Logic:**
- Labour hours: 0.5 hours per sqm
- Dehumidifiers: 1 per 50 sqm
- Air movers: 1 per 20 sqm
- Drying time: (area / 100) + 2 days

---

#### GET `/api/restore-assist/scopes`
List scopes.

**Query Parameters:**
- `reportId` (optional): Filter by report

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "scope-id",
      "reportId": "report-id",
      "scopeType": "WATER",
      "labourCostTotal": 765,
      "equipmentCostTotal": 90,
      "chemicalCostTotal": 38.25,
      "totalDuration": 3,
      "report": {
        "id": "report-id",
        "title": "Water Damage - 123 Main St",
        "clientName": "John Doe"
      }
    }
  ]
}
```

---

#### GET `/api/restore-assist/scopes/[id]`
Fetch scope details.

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "scope-id",
    "reportId": "report-id",
    "scopeType": "WATER",
    "siteVariables": { ... },
    "labourParameters": { ... },
    "equipmentParameters": { ... },
    "chemicalApplication": { ... },
    "timeCalculations": { ... },
    "labourCostTotal": 765,
    "equipmentCostTotal": 90,
    "chemicalCostTotal": 38.25,
    "totalDuration": 3,
    "report": { ... },
    "estimate": { ... }
  }
}
```

---

#### PUT `/api/restore-assist/scopes/[id]`
Update scope (edit line items).

**Request Body:**
```json
{
  "labourParameters": {
    "roles": [
      {
        "name": "Master Technician",
        "hours": 5,
        "rate": 80
      }
    ],
    "totalCost": 400
  },
  "complianceNotes": "Updated compliance notes",
  "assumptions": "Updated assumptions"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "scope-id",
    // ... updated scope
  }
}
```

---

### 5. Estimations

#### POST `/api/restore-assist/estimations`
Generate cost estimation from scope.

**Request Body:**
```json
{
  "reportId": "report-id",
  "scopeId": "optional-scope-id"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "estimate-id",
    "reportId": "report-id",
    "scopeId": "scope-id",
    "status": "DRAFT",
    "version": 1,
    "lineItems": [
      {
        "id": "line-item-id",
        "category": "Prelims",
        "description": "Minimal Callout Fee",
        "qty": 1,
        "unit": "ea",
        "rate": 150,
        "subtotal": 150,
        "formula": "1 × 150",
        "isScopeLinked": false,
        "displayOrder": 0
      },
      {
        "category": "Mitigation",
        "description": "Qualified Technician - Water Extraction",
        "qty": 13,
        "unit": "hr",
        "rate": 60,
        "subtotal": 780,
        "formula": "13 × 60",
        "isScopeLinked": true,
        "displayOrder": 2
      }
    ],
    "totals": {
      "labourSubtotal": 780,
      "equipmentSubtotal": 270,
      "chemicalsSubtotal": 38.25,
      "subcontractorSubtotal": 0,
      "travelSubtotal": 0,
      "wasteSubtotal": 0,
      "overheads": 192.38,
      "profit": 256.5,
      "contingency": 128.25,
      "escalation": 0,
      "subtotalExGST": 1665.38,
      "gst": 166.54,
      "totalIncGST": 1831.92
    }
  }
}
```

**Calculation Logic:**
1. Uses user's PricingStructure for rates
2. Creates line items for:
   - Callout fees (prelims)
   - Administration fee (admin)
   - Labour (mitigation)
   - Equipment (mitigation)
   - Chemicals (mitigation)
3. Applies commercial parameters:
   - Overheads: 15%
   - Profit: 20%
   - Contingency: 10%
4. Calculates GST at 10%

---

#### GET `/api/restore-assist/estimations`
List estimations.

**Query Parameters:**
- `reportId` (optional): Filter by report
- `status` (optional): Filter by status

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "estimate-id",
      "reportId": "report-id",
      "status": "DRAFT",
      "version": 1,
      "totalIncGST": 1831.92,
      "report": {
        "id": "report-id",
        "title": "Water Damage - 123 Main St",
        "clientName": "John Doe"
      },
      "lineItems": [ ... ]
    }
  ]
}
```

---

#### GET `/api/restore-assist/estimations/[id]`
Fetch estimation details.

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "estimate-id",
    "reportId": "report-id",
    "scopeId": "scope-id",
    "status": "DRAFT",
    "version": 1,
    "lineItems": [ ... ],
    "totals": { ... },
    "assumptions": "Assumptions text",
    "inclusions": "Inclusions text",
    "exclusions": "Exclusions text",
    "report": { ... },
    "scope": { ... },
    "versions": [ ... ],
    "variations": [ ... ]
  }
}
```

---

#### PUT `/api/restore-assist/estimations/[id]`
Update estimation (adjust costs).

**Request Body:**
```json
{
  "status": "CLIENT_REVIEW",
  "lineItems": [
    {
      "category": "Mitigation",
      "description": "Updated line item",
      "qty": 15,
      "unit": "hr",
      "rate": 65,
      "isScopeLinked": true
    }
  ],
  "commercialParams": {
    "overheadPercent": 15,
    "profitPercent": 20,
    "contingencyPercent": 10,
    "escalationPercent": 0
  },
  "assumptions": "Updated assumptions",
  "inclusions": "What's included",
  "exclusions": "What's excluded",
  "createVersion": true,
  "versionReason": "Client requested changes"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "estimate-id",
    "version": 2,
    "lineItems": [ ... ],
    "totals": { ... }
  }
}
```

**Features:**
- Auto-recalculates totals when line items change
- Creates version snapshot if `createVersion: true`
- Increments version number
- Maintains audit trail through versions

---

### 6. Export

#### POST `/api/restore-assist/export?format=json`
Export inspection + scope + estimation.

**Query Parameters:**
- `format`: json | pdf | docx (only json implemented)

**Request Body:**
```json
{
  "reportId": "report-id",
  "estimateId": "optional-estimate-id"
}
```

**Response (JSON format):**
```json
{
  "success": true,
  "data": {
    "report": {
      "id": "report-id",
      "reportNumber": "INS-1234567890",
      "title": "Water Damage - 123 Main St",
      "clientName": "John Doe",
      "propertyAddress": "123 Main St, Sydney NSW 2000",
      "inspectionDate": "2025-01-08T00:00:00.000Z",
      "hazardType": "WATER",
      "insuranceType": "Contents & Building",
      "waterCategory": "Category 2",
      "waterClass": "Class 3",
      "affectedArea": 25.5,
      "detailedReport": "# Executive Summary..."
    },
    "client": {
      "name": "John Doe",
      "email": "john@example.com",
      "phone": "0412345678"
    },
    "scope": {
      "id": "scope-id",
      "scopeType": "WATER",
      "labourParameters": { ... },
      "equipmentParameters": { ... },
      "chemicalApplication": { ... },
      "timeCalculations": { ... },
      "labourCostTotal": 765,
      "equipmentCostTotal": 90,
      "chemicalCostTotal": 38.25,
      "totalDuration": 3
    },
    "estimate": {
      "id": "estimate-id",
      "status": "APPROVED",
      "version": 2,
      "lineItems": [ ... ],
      "totals": {
        "labourSubtotal": 780,
        "equipmentSubtotal": 270,
        "chemicalsSubtotal": 38.25,
        "subtotalExGST": 1665.38,
        "gst": 166.54,
        "totalIncGST": 1831.92
      },
      "assumptions": "Assumptions text",
      "inclusions": "Inclusions text",
      "exclusions": "Exclusions text"
    },
    "exportedAt": "2025-01-08T12:00:00.000Z",
    "exportedBy": "user-id"
  }
}
```

**PDF/DOCX Export:**
Currently returns 501 Not Implemented. Would require:
- PDF: puppeteer, pdfkit, or pdf-lib
- DOCX: docx library

---

## Error Responses

All endpoints return consistent error format:

```json
{
  "success": false,
  "error": "Error message"
}
```

**Common HTTP Status Codes:**
- `200` - Success
- `400` - Bad Request (validation error)
- `401` - Unauthorized (no session)
- `404` - Not Found
- `500` - Internal Server Error
- `501` - Not Implemented (PDF/DOCX export)

---

## Data Flow

```
1. Create Inspection
   POST /api/restore-assist/inspections
   ↓
2. Answer Questions (Tier 1, 2, 3)
   GET  /api/restore-assist/inspections/[id]/questions?tier=tier1
   POST /api/restore-assist/inspections/[id]/questions
   ↓
3. Generate AI Report
   POST /api/restore-assist/inspections/[id]/generate
   ↓
4. Create Scope
   POST /api/restore-assist/scopes
   ↓
5. Generate Estimate
   POST /api/restore-assist/estimations
   ↓
6. Update Estimate (if needed)
   PUT  /api/restore-assist/estimations/[id]
   ↓
7. Export Complete Package
   POST /api/restore-assist/export?format=json
```

---

## Security Features

✅ **Authentication Required:** All endpoints require NextAuth session
✅ **Ownership Verification:** Users can only access their own data
✅ **API Key Enforcement:** Users must configure Anthropic API key (admin bypass)
✅ **Pricing Structure Check:** Users must configure pricing before creating reports
✅ **Input Validation:** All endpoints validate required fields
✅ **Soft Delete:** Archive instead of hard delete
✅ **Audit Trail:** Simplified audit logging (can be enhanced)

---

## Performance Considerations

- **Pagination:** Inspection list supports limit/offset
- **Includes:** Uses Prisma includes to minimize queries
- **Indexes:** Database indexed on userId, status, reportId
- **JSON Fields:** Scope and estimate parameters stored as JSON for flexibility
- **Calculation Caching:** Totals stored in database, not recalculated on read

---

## Future Enhancements

### High Priority
- [ ] Implement PDF export using puppeteer
- [ ] Implement DOCX export using docx library
- [ ] Add proper AuditLog table integration
- [ ] Add real-time status updates via WebSockets
- [ ] Add file upload for inspection photos
- [ ] Add email notifications for status changes

### Medium Priority
- [ ] Add estimate approval workflow
- [ ] Add variation tracking for scope changes
- [ ] Add template management for scopes
- [ ] Add bulk operations for inspections
- [ ] Add advanced filtering and search

### Low Priority
- [ ] Add GraphQL API alternative
- [ ] Add API rate limiting
- [ ] Add API versioning (/v1/, /v2/)
- [ ] Add webhooks for integrations
- [ ] Add CSV export option

---

## Testing Checklist

### Inspections
- [ ] Create inspection with all required fields
- [ ] Create inspection without pricing structure (should fail)
- [ ] Create inspection without API key (should fail for non-admin)
- [ ] List inspections with filters
- [ ] Get single inspection
- [ ] Update inspection
- [ ] Delete (archive) inspection

### Questions
- [ ] Get tier 1 questions for WATER hazard
- [ ] Get tier 2 questions for FIRE hazard
- [ ] Submit tier 1 responses
- [ ] Submit tier 3 responses (should mark completed)

### Generate
- [ ] Generate report with complete tier 1-3 data
- [ ] Generate report without API key (should fail for non-admin)
- [ ] Verify IICRC compliance in generated report

### Scopes
- [ ] Create scope from inspection
- [ ] Create duplicate scope (should fail)
- [ ] List scopes
- [ ] Get scope details
- [ ] Update scope parameters

### Estimations
- [ ] Create estimate from scope
- [ ] Create estimate without scope
- [ ] Verify pricing structure rates applied
- [ ] List estimates
- [ ] Get estimate details
- [ ] Update estimate line items
- [ ] Create version snapshot

### Export
- [ ] Export JSON format
- [ ] Export without estimate (should use latest)
- [ ] Verify all data included in export

---

## Database Schema Dependencies

**Required Models:**
- ✅ User (with anthropicApiKey)
- ✅ Report (inspection data)
- ✅ PricingStructure (rate tables)
- ✅ Scope (work breakdown)
- ✅ Estimate (cost calculation)
- ✅ EstimateLineItem (line items)
- ✅ EstimateVersion (version history)
- ✅ Client (optional relation)

**Optional Enhancements:**
- [ ] AuditLog (currently simplified)
- [ ] EstimateVariation (for change orders)
- [ ] InspectionReport (separate from Report model)
- [ ] QuestionResponse (structured Q&A storage)

---

## API File Locations

```
app/api/restore-assist/
├── inspections/
│   ├── route.ts                    # POST, GET
│   └── [id]/
│       ├── route.ts                # GET, PUT, DELETE
│       ├── questions/
│       │   └── route.ts            # GET, POST
│       └── generate/
│           └── route.ts            # POST
├── scopes/
│   ├── route.ts                    # POST, GET
│   └── [id]/
│       └── route.ts                # GET, PUT
├── estimations/
│   ├── route.ts                    # POST, GET
│   └── [id]/
│       └── route.ts                # GET, PUT
└── export/
    └── route.ts                    # POST
```

**Total Files:** 9 API route files
**Total Endpoints:** 15 endpoints (POST, GET, PUT, DELETE operations)

---

## Notes

- All API endpoints use Next.js 15 App Router conventions
- All dates are ISO 8601 format
- All currency values are in AUD
- GST is calculated at 10%
- Default commercial parameters: 15% overhead, 20% profit, 10% contingency
- Question tiers are dynamically loaded based on hazard type
- Scope calculations are simplified estimates (can be overridden)
- Estimate line items support both scope-linked and manual additions

---

**Version:** 1.0
**Last Updated:** 2025-01-08
**Author:** Claude (Backend Architect Agent)
