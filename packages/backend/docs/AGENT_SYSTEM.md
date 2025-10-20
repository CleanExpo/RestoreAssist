# RestoreAssist SDK Agent System

## Overview

RestoreAssist uses **Claude Agent SDK** as the core engine for generating unique damage assessment reports, restoration protocols, scopes of work, and estimates. This is **NOT** a template system - every report is generated dynamically based on real client data.

## Why SDK Agents?

Traditional systems use templates with placeholders. RestoreAssist uses **AI agents** that:

✅ **Analyse real data** - Each job is unique, agents adapt to specific damage situations
✅ **Generate custom protocols** - No two restoration jobs are handled the same way
✅ **Pull accurate estimates** - Pricing based on actual scope, location, and market rates
✅ **Create sandboxed environments** - Each job gets its own dedicated agent context
✅ **Work in production** - These aren't development helpers, they're the core system

## How It Works

### 1. Client Submits Job Data

When a contractor submits a new restoration job, they provide REAL data:

```typescript
{
  propertyAddress: "123 Main St, Sydney NSW 2000",
  damageType: "water",
  damageDescription: "Burst pipe in ceiling, water damage to living room and hallway",
  state: "NSW",
  clientName: "John Smith",
  claimNumber: "INS-2025-12345",
  propertyType: "Residential",
  affectedAreas: ["Living Room", "Hallway", "Ceiling Cavity"],
  severity: "Moderate",
  photos: [...],
  specialRequirements: "Tenant occupied, work must be completed in 5 days"
}
```

### 2. Dedicated Agent Created

The system creates a **job-specific agent** with:
- Full context about the property and damage
- Knowledge of NSW building codes and compliance requirements
- Access to current Australian market rates
- Understanding of the specific damage type (water, fire, storm, etc.)

### 3. Agent Generates Unique Output

The agent analyzes the real data and generates:

#### A. Initial Damage Assessment
- Professional summary of THIS specific situation
- Severity rating based on actual damage
- Urgency assessment

#### B. Restoration Protocol
```typescript
[
  "1. Emergency Response: Isolate water source and affected electrical circuits",
  "2. Document Damage: Photograph all affected areas before remediation",
  "3. Extract Standing Water: Use submersible pumps for floor coverage",
  "4. Remove Damaged Ceiling: Cut back to solid framing, dispose properly",
  "5. Dry Structure: Deploy dehumidifiers, monitor moisture levels",
  "6. Test for Mold: Conduct air quality sampling after 72 hours",
  "7. Repair Ceiling: Install new plasterboard, tape, and compound",
  "8. Paint and Finish: Match existing finishes",
  "9. Final Inspection: Verify moisture levels below 15% RH"
]
```

#### C. Detailed Scope of Work
```typescript
[
  "Remove water-damaged ceiling plasterboard in living room (12 sqm)",
  "Extract standing water from carpet and underlay in hallway",
  "Deploy 3x commercial dehumidifiers for 5 days",
  "Conduct mold air quality testing after drying period",
  "Install 12 sqm new 10mm plasterboard to ceiling",
  "Apply ceiling compound and sand smooth",
  "Paint ceiling with 2 coats white ceiling paint",
  "Clean and sanitize all affected surfaces"
]
```

#### D. Itemized Estimate
```typescript
[
  {
    description: "Emergency water extraction - living room and hallway",
    quantity: 1,
    unit: "job",
    unitCost: 450.00,
    totalCost: 450.00,
    category: "Labor",
    notes: "Includes disposal of contaminated materials"
  },
  {
    description: "Commercial dehumidifier hire (3 units x 5 days)",
    quantity: 15,
    unit: "days",
    unitCost: 35.00,
    totalCost: 525.00,
    category: "Equipment"
  },
  {
    description: "Ceiling plasterboard removal and disposal",
    quantity: 12,
    unit: "sqm",
    unitCost: 25.00,
    totalCost: 300.00,
    category: "Labor"
  },
  // ... more items with REAL calculations
]
```

#### E. Compliance & Safety
```typescript
{
  complianceNotes: [
    "Work complies with NSW Building Code 2022",
    "Asbestos register checked - no ACM present",
    "Electrical safety: Circuits isolated by licensed electrician",
    "Waste disposal via licensed waste facility (NSW EPA registered)"
  ],
  safetyRequirements: [
    "PPE required: Safety glasses, gloves, dust masks N95",
    "Ventilation: Ensure adequate airflow during drying",
    "Tenant notification: Coordinate access 24hrs in advance",
    "Moisture monitoring: Daily readings required"
  ]
}
```

#### F. Timeline
```typescript
{
  emergency: "Emergency water extraction within 4 hours of dispatch",
  restoration: "Structural drying: 5-7 days. Repairs: 3-4 days",
  completion: "Project completion: 10-12 business days from start"
}
```

#### G. Authority to Proceed
Professional document for client signature with full scope, cost, and terms.

### 4. No Two Jobs Are Alike

The agent system ensures:
- ✅ Water damage in Sydney ≠ Water damage in Melbourne (different codes, different rates)
- ✅ Burst pipe damage ≠ Storm flooding (different protocols, different equipment)
- ✅ Residential ≠ Commercial (different requirements, different pricing)
- ✅ Tenant occupied ≠ Vacant (different scheduling, different approaches)

## Technical Implementation

### Agent Service (`reportAgentService.ts`)

```typescript
const jobAgent = new Agent({
  name: `RestoreAssist Job Agent - ${claimNumber}`,
  model: 'claude-opus-4-20250514',
  systemPrompt: `Specialized prompt with job context...`,
  tools: ['bash', 'file', 'web_search'],
  mcpServers: {
    filesystem: {...},
    // Can add more data sources: database, APIs, etc.
  }
});

const report = await jobAgent.run({
  input: jobPrompt, // Built from real job data
  maxTurns: 10
});
```

### API Integration

```http
POST /api/reports
Content-Type: application/json
Authorisation: Bearer <token>

{
  "propertyAddress": "123 Main St, Sydney NSW 2000",
  "damageType": "water",
  "damageDescription": "Detailed description...",
  "state": "NSW",
  ...more real data
}
```

Response:
```json
{
  "reportId": "RPT-1738123456-xyz123",
  "summary": "Custom assessment for this specific job",
  "restorationProtocol": [...],
  "scopeOfWork": [...],
  "itemizedEstimate": [...],
  "totalCost": 12450.00,
  "timeline": {...},
  "authorityToProceed": "Professional ATP document",
  "metadata": {
    "generatedBy": "RestoreAssist AI Agent",
    "agentVersion": "1.0.0"
  }
}
```

## Data Flow

```
Client Input (Real Data)
    ↓
Create Job-Specific Agent
    ↓
Agent Analyzes Data
    ↓
Generate Custom Protocol
    ↓
Build Unique Scope of Work
    ↓
Calculate Real Estimates
    ↓
Output Professional Report
    ↓
Store in Database
    ↓
Return to Client
```

## Environment Requirements

```bash
# Required
ANTHROPIC_API_KEY=sk-ant-xxx  # For SDK Agents

# Optional (for enhanced data access)
GITHUB_TOKEN=ghp_xxx  # Access to code/templates
GOOGLE_DRIVE_TOKEN=xxx  # Access to photos/documents
ASCORA_API_KEY=xxx  # Pull job data from Ascora
```

## Fallback Mode

If SDK Agent fails, system falls back to basic Claude API:

```typescript
const report = useAgent
  ? await reportAgentService.generateReport(request)  // SDK Agent (default)
  : await claudeService.generateReport(request);      // Fallback
```

## Testing

Test with real-world scenarios:

```bash
# Test water damage report
curl -X POST http://localhost:3001/api/reports \
  -H "Content-Type: application/json" \
  -H "Authorisation: Bearer <token>" \
  -d '{
    "propertyAddress": "456 George St, Brisbane QLD 4000",
    "damageType": "water",
    "damageDescription": "Severe storm flooding, 300mm water in ground floor",
    "state": "QLD",
    "severity": "Severe",
    "affectedAreas": ["Ground Floor", "Kitchen", "Laundry", "Garage"]
  }'
```

## Best Practices

1. **Provide Complete Data**: More data = better agent output
2. **Be Specific**: "Burst pipe in ceiling" better than "water damage"
3. **Include Photos**: Visual data improves accuracy
4. **Specify Requirements**: Timeline, access, tenant situations
5. **Review Output**: Agents are smart but verify calculations

## Future Enhancements

- [ ] Integration with Ascora for automatic job data pull
- [ ] Photo analysis using Claude's vision capabilities
- [ ] Historical data learning (pricing trends, common issues)
- [ ] Multi-agent collaboration (one for assessment, one for pricing, one for compliance)
- [ ] Real-time cost database integration
- [ ] Customer preference learning

## Support

For issues with agent-generated reports:
1. Check `ANTHROPIC_API_KEY` is valid
2. Review agent logs in console
3. Verify input data completeness
4. Test with fallback mode (`useAgent=false`)
5. Contact support with `reportId` and job details
