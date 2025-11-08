import Anthropic from '@anthropic-ai/sdk'
import { UnifiedLLMClient, type LLMProvider } from './llm-providers'

// ==========================================
// TYPES & INTERFACES
// ==========================================

export interface PropertyDetails {
  clientName: string
  propertyAddress: string
  dateOfLoss: string
  dateOfInspection: string
  lossSource: string
  timelineToDiscovery?: string
  propertyType?: string
  occupancyStatus?: string
  structureType?: string
  constructionYear?: string
}

export interface TechnicianReport {
  findings: string
  areasAffected: string[]
  visualObservations: string
  moistureReadings: string
  immediateActionsToken: string
  photosEvidence?: string[]
}

export interface QuestionResponses {
  waterCategory: 'Category 1' | 'Category 2' | 'Category 3'
  waterClass: 'Class 1' | 'Class 2' | 'Class 3' | 'Class 4'
  structuralDamageAssessment: string
  hazardFlags: string[]
  hvacAffected: boolean
  electricalHazards: string
  stopWorkConditions: boolean
  authorityNotifications: string[]
}

export interface EquipmentList {
  dehumidifiers: { type: string; quantity: number; capacity: string }[]
  airMovers: { type: string; quantity: number; cfm: string }[]
  extractionUnits: { type: string; quantity: number }[]
  afdUnits: { type: string; quantity: number; cfm: string }[]
  thermalImaging: boolean
  moistureMeters: boolean
}

export interface InspectionReportData {
  property: PropertyDetails
  techReport: TechnicianReport
  responses: QuestionResponses
  equipment?: EquipmentList
}

export interface ScopeOfWorksData {
  inspectionReport: InspectionReportData
  equipment: EquipmentList
  timeline: {
    emergencyResponseDays: number
    dryingDays: number
    validationDays: number
    licensedTradesDays: number
    contentsDays: number
  }
  licensedTrades: {
    plumber?: { scope: string; estimated: boolean }
    electrician?: { scope: string; estimated: boolean }
    builder?: { scope: string; estimated: boolean }
    hvacSpecialist?: { scope: string; estimated: boolean }
    asbestosAssessor?: { scope: string; estimated: boolean }
    structuralEngineer?: { scope: string; estimated: boolean }
  }
  insuranceBreakdown: {
    buildingClaim: boolean
    contentsClaim: boolean
    tempAccommodation: boolean
    businessInterruption: boolean
  }
}

export interface PricingStructure {
  // Labour rates
  masterTechnicianRate: number
  qualifiedTechnicianRate: number
  labourerRate: number
  afterHoursMultipliers: {
    weekday: number
    saturday: number
    sunday: number
  }
  // Equipment rates
  dehumidifierLarge: number
  dehumidifierMedium: number
  dehumidifierDesiccant: number
  airmoverAxial: number
  airmoverCentrifugal: number
  airmoverLayflat: number
  afdExtraLarge: number
  afdLarge500cfm: number
  extractionTruckMounted: number
  extractionElectric: number
  thermalCameraClaimCost: number
  // Chemicals
  chemicalAntiMicrobial: number
  chemicalMouldRemediation: number
  chemicalBioHazard: number
  // Fees
  minimalCalloutFee: number
  administrationFee: number
  // Tax
  taxRate: number
}

export interface CostCalculations {
  labourHours: {
    masterTechnician: { normal: number; afterHours: number }
    qualifiedTechnician: { normal: number; afterHours: number }
    labourer: { normal: number; afterHours: number }
  }
  equipmentDays: {
    dehumidifiers: { large: number; medium: number; desiccant: number }
    airMovers: { axial: number; centrifugal: number; layflat: number }
    afds: { extraLarge: number; large500cfm: number }
    extraction: { truckMounted: number; electric: number }
  }
  chemicalApplication: {
    antiMicrobialArea: number
    mouldRemediationArea: number
    bioHazardArea: number
  }
  licensedTrades: {
    plumber?: number
    electrician?: number
    builder?: number
    hvacSpecialist?: number
    asbestosAssessor?: number
    structuralEngineer?: number
  }
  fees: {
    callout: boolean
    administration: boolean
  }
}

export interface CostBreakdownData {
  scope: ScopeOfWorksData
  pricing: PricingStructure
  calculations: CostCalculations
}

// ==========================================
// ANTHROPIC CLIENT
// ==========================================

function createAnthropicClient(apiKey: string): Anthropic {
  return new Anthropic({
    apiKey: apiKey,
  })
}

// ==========================================
// INSPECTION REPORT GENERATOR
// ==========================================

export async function generateInspectionReport(
  data: InspectionReportData,
  userApiKey: string,
  provider: LLMProvider = 'anthropic',
  model?: string
): Promise<string> {
  try {
    console.log(`[ReportGen] Starting inspection report generation using ${provider}...`)

    const llmClient = new UnifiedLLMClient({
      provider,
      apiKey: userApiKey,
      model,
    })

    const prompt = createInspectionReportPrompt(data)
    const response = await llmClient.generateCompletion(prompt)

    console.log(`[ReportGen] Inspection report generated successfully using ${provider}`)
    return response.content
  } catch (error) {
    console.error('[ReportGen] Error generating inspection report:', error)
    throw new Error(
      `Failed to generate inspection report: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
  }
}

function createInspectionReportPrompt(data: InspectionReportData): string {
  const hazardFlagsText = data.responses.hazardFlags.length > 0
    ? data.responses.hazardFlags.join(', ')
    : 'None identified'

  const authorityNotificationsText = data.responses.authorityNotifications.length > 0
    ? data.responses.authorityNotifications.join(', ')
    : 'None required'

  return `You are an IICRC S500 certified water damage restoration specialist with extensive knowledge of Australian building codes (NCC), Queensland regulations, and workplace health and safety legislation (WHS Act 2011).

Generate a comprehensive, professional water damage inspection report based on the following field data:

## PROPERTY INFORMATION
- Client Name: ${data.property.clientName}
- Property Address: ${data.property.propertyAddress}
- Date of Loss: ${data.property.dateOfLoss}
- Date of Inspection: ${data.property.dateOfInspection}
- Source of Water: ${data.property.lossSource}
- Timeline to Discovery: ${data.property.timelineToDiscovery || 'Not specified'}
- Property Type: ${data.property.propertyType || 'Residential'}
- Occupancy Status: ${data.property.occupancyStatus || 'Owner-occupied'}
- Structure Type: ${data.property.structureType || 'Standard timber frame'}
- Construction Year: ${data.property.constructionYear || 'Not specified'}

## TECHNICIAN FIELD REPORT
${data.techReport.findings}

### Areas Affected
${data.techReport.areasAffected.map(area => `- ${area}`).join('\n')}

### Visual Observations
${data.techReport.visualObservations}

### Moisture Readings
${data.techReport.moistureReadings}

### Immediate Actions Taken
${data.techReport.immediateActionsToken}

## ASSESSMENT RESPONSES
- Water Category: ${data.responses.waterCategory}
- Water Class: ${data.responses.waterClass}
- Structural Damage Assessment: ${data.responses.structuralDamageAssessment}
- Hazard Flags: ${hazardFlagsText}
- HVAC Affected: ${data.responses.hvacAffected ? 'Yes' : 'No'}
- Electrical Hazards: ${data.responses.electricalHazards}
- STOP WORK Conditions: ${data.responses.stopWorkConditions ? 'YES - WORK HALTED' : 'No'}
- Authority Notifications Required: ${authorityNotificationsText}

${data.equipment ? `
## EQUIPMENT DEPLOYED
### Dehumidifiers
${data.equipment.dehumidifiers.map(d => `- ${d.type}: ${d.quantity} units (${d.capacity})`).join('\n')}

### Air Movers
${data.equipment.airMovers.map(a => `- ${a.type}: ${a.quantity} units (${a.cfm})`).join('\n')}

### Extraction Units
${data.equipment.extractionUnits.map(e => `- ${e.type}: ${e.quantity} units`).join('\n')}

### Air Filtration Devices (AFDs)
${data.equipment.afdUnits.map(afd => `- ${afd.type}: ${afd.quantity} units (${afd.cfm})`).join('\n')}

### Additional Equipment
- Thermal Imaging Camera: ${data.equipment.thermalImaging ? 'Yes' : 'No'}
- Moisture Meters: ${data.equipment.moistureMeters ? 'Yes' : 'No'}
` : ''}

## COMPLIANCE FRAMEWORK REQUIREMENTS

You MUST reference and comply with:
1. **IICRC S500 Standard**: Water damage restoration procedures
2. **Queensland National Construction Code (NCC)**: Building standards and safety
3. **WHS Act 2011**: Workplace Health and Safety compliance
4. **Queensland Building and Construction Commission (QBCC)**: Licensing requirements
5. **AS/NZS 3666.1:2011**: HVAC systems contamination control (if applicable)
6. **AS/NZS 4801**: Occupational health and safety management systems

## REQUIRED REPORT STRUCTURE

Generate a professional inspection report with the following sections:

### 1. EXECUTIVE SUMMARY
- Concise overview of the water damage incident
- Key findings from inspection
- Critical hazards identified (if any)
- Immediate actions taken
- Recommended next steps

### 2. LOSS DETAILS
- Date and time of loss
- Source of water intrusion
- Timeline from incident to discovery
- Timeline from discovery to inspection
- IICRC water category (1, 2, or 3) with justification
- IICRC water class (1, 2, 3, or 4) with justification
- Current stage of remediation

### 3. AREAS AFFECTED
Provide room-by-room breakdown including:
- Room name/location
- Affected materials (flooring, walls, ceiling, contents)
- Moisture readings (specific percentages or readings)
- Visual observations (staining, saturation, delamination, etc.)
- Structural integrity concerns

### 4. STANDARDS COMPLIANCE FRAMEWORK
Explicitly state compliance with:
- IICRC S500 standards and methodology
- Queensland NCC building code requirements
- WHS Act 2011 safety protocols
- Relevant AS/NZS standards
- QBCC licensing and regulatory requirements

### 5. HAZARD ASSESSMENT & STOP WORK ALERTS
${data.responses.stopWorkConditions ? '**⚠️ STOP WORK CONDITION ACTIVE ⚠️**\n\nWork has been halted due to critical hazards. Site requires specialist assessment before resuming.\n\n' : ''}
Assess and document:
- Electrical hazards (exposed wiring, active circuits in wet areas)
- Structural concerns (sagging, cracks, load-bearing damage)
- Contamination risks (sewage, chemicals, biohazards)
- Asbestos or hazardous material presence
- Mould growth or high-risk conditions
- Slip/fall hazards
- Required PPE levels
- Site access restrictions

### 6. REMEDIATION ACTIONS COMPLETED
Document all emergency response actions already taken:
- Water extraction performed
- Affected contents removed or protected
- Carpet lifted or removed
- Wall cavities opened
- Equipment deployed (dehumidifiers, air movers, AFDs)
- Chemical treatments applied
- Containment barriers erected

### 7. DRYING PROTOCOL & METHODOLOGY
- Psychrometric approach (target humidity, temperature)
- Equipment placement strategy
- Air circulation methodology
- Expected drying timeline
- Daily monitoring protocols
- Drying completion criteria (specific readings required)

### 8. OCCUPANCY & SAFETY CONSIDERATIONS
- Is property safe for occupancy during drying?
- Temporary relocation recommended? (Yes/No with reasoning)
- Access restrictions for occupants
- Safety protocols during remediation
- PPE requirements for workers
- Vulnerable occupants (elderly, children, immunocompromised)

### 9. SECONDARY DAMAGE & MOULD RISK
- Probability of mould growth (Low/Medium/High)
- Timeline for mould colonisation risk
- Preventive measures implemented
- Environmental controls (humidity, temperature)
- Monitoring frequency required

### 10. POWER & EQUIPMENT REQUIREMENTS
- Electrical load requirements (amps, circuits)
- Generator needed? (Yes/No)
- Power outlet access and safety
- Equipment noise considerations
- Runtime schedules

### 11. THINGS TO CONSIDER
- Insurance claim documentation requirements
- Access for trade contractors
- Storage for removed contents
- Alternative accommodation arrangements
- Business interruption impacts
- Timeline expectations
- Cost implications

### 12. AUTHORITY NOTIFICATION CHECKLIST
Indicate if notifications required to:
- Queensland Building and Construction Commission (QBCC)
- Local council building certifier
- WorkCover Queensland (if workplace)
- Environmental Health Officer (if contamination)
- Insurance company (claim lodgement)
- Utility providers (if disconnection required)
- Asbestos removal authority (if ACM present)

### 13. RECOMMENDATIONS & NEXT STEPS
Provide clear, actionable recommendations:
- Continue drying protocol (duration estimate)
- Specialist assessments required (structural, electrical, etc.)
- Licensed trades required (plumber, electrician, builder)
- Follow-up inspection schedule
- Final validation testing requirements
- Restoration timeline estimate
- Cost estimation guidance

## REPORT TONE & STYLE REQUIREMENTS

- **Professional and authoritative**: Use industry-standard terminology
- **Evidence-based**: Reference specific readings, observations, and measurements
- **Compliance-focused**: Explicitly state adherence to standards
- **Clear and actionable**: Provide specific next steps
- **Risk-aware**: Highlight hazards and mitigation strategies
- **Insurance-ready**: Include all information needed for claim processing
- **Australian context**: Use local regulations, measurements (metric), and terminology

## FORMATTING GUIDELINES

- Use clear section headings with numbering
- Use bullet points for lists
- Include tables for moisture readings if appropriate
- Bold or capitalise critical hazard warnings
- Use professional, formal language
- Avoid ambiguous terms - be specific
- Include measurements with units (%, m², °C, % RH)

Generate the complete inspection report now.`
}

// ==========================================
// SCOPE OF WORKS GENERATOR
// ==========================================

export async function generateScopeOfWorks(
  data: ScopeOfWorksData,
  userApiKey: string
): Promise<string> {
  try {
    console.log('[ReportGen] Starting scope of works generation...')

    const anthropic = createAnthropicClient(userApiKey)
    const prompt = createScopeOfWorksPrompt(data)

    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 8000,
      temperature: 0.3,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    })

    if (response.content[0].type === 'text') {
      console.log('[ReportGen] Scope of works generated successfully')
      return response.content[0].text
    } else {
      throw new Error('Unexpected response format from Anthropic API')
    }
  } catch (error) {
    console.error('[ReportGen] Error generating scope of works:', error)
    throw new Error(
      `Failed to generate scope of works: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
  }
}

function createScopeOfWorksPrompt(data: ScopeOfWorksData): string {
  return `You are an experienced restoration project manager preparing a detailed scope of works for insurance claim submission and project execution.

Generate a comprehensive, structured scope of works document based on the inspection findings and project parameters below.

## PROJECT CONTEXT

### Property Details
- Client: ${data.inspectionReport.property.clientName}
- Property Address: ${data.inspectionReport.property.propertyAddress}
- Loss Date: ${data.inspectionReport.property.dateOfLoss}
- Loss Source: ${data.inspectionReport.property.lossSource}
- Water Category: ${data.inspectionReport.responses.waterCategory}
- Water Class: ${data.inspectionReport.responses.waterClass}

### Areas Affected
${data.inspectionReport.techReport.areasAffected.map(area => `- ${area}`).join('\n')}

### Hazards Identified
${data.inspectionReport.responses.hazardFlags.length > 0 ? data.inspectionReport.responses.hazardFlags.map(h => `- ${h}`).join('\n') : '- None'}

## EQUIPMENT SCHEDULE

### Dehumidifiers
${data.equipment.dehumidifiers.map(d => `- ${d.type}: ${d.quantity} units @ ${d.capacity}`).join('\n')}

### Air Movers
${data.equipment.airMovers.map(a => `- ${a.type}: ${a.quantity} units @ ${a.cfm}`).join('\n')}

### Extraction Units
${data.equipment.extractionUnits.map(e => `- ${e.type}: ${e.quantity} units`).join('\n')}

### Air Filtration Devices
${data.equipment.afdUnits.map(afd => `- ${afd.type}: ${afd.quantity} units @ ${afd.cfm}`).join('\n')}

### Additional Equipment
- Thermal Imaging Camera: ${data.equipment.thermalImaging ? 'Included' : 'Not included'}
- Moisture Meters: ${data.equipment.moistureMeters ? 'Included' : 'Not included'}

## PROJECT TIMELINE

- Phase 1 - Emergency Response: ${data.timeline.emergencyResponseDays} day(s)
- Phase 2 - Drying: ${data.timeline.dryingDays} day(s)
- Phase 3 - Validation: ${data.timeline.validationDays} day(s)
- Phase 4 - Licensed Trades: ${data.timeline.licensedTradesDays} day(s)
- Phase 5 - Contents: ${data.timeline.contentsDays} day(s)

**Total Project Duration**: ${
    data.timeline.emergencyResponseDays +
    data.timeline.dryingDays +
    data.timeline.validationDays +
    data.timeline.licensedTradesDays +
    data.timeline.contentsDays
  } day(s)

## LICENSED TRADES REQUIRED

${Object.entries(data.licensedTrades).map(([trade, details]) =>
  details ? `### ${trade.charAt(0).toUpperCase() + trade.slice(1).replace(/([A-Z])/g, ' $1').trim()}
- Scope: ${details.scope}
- Status: ${details.estimated ? 'Estimate required' : 'Scope confirmed'}
` : ''
).join('\n')}

## INSURANCE BREAKDOWN

- Building Claim: ${data.insuranceBreakdown.buildingClaim ? 'Yes' : 'No'}
- Contents Claim: ${data.insuranceBreakdown.contentsClaim ? 'Yes' : 'No'}
- Temporary Accommodation: ${data.insuranceBreakdown.tempAccommodation ? 'Yes' : 'No'}
- Business Interruption: ${data.insuranceBreakdown.businessInterruption ? 'Yes' : 'No'}

## REQUIRED SCOPE OF WORKS STRUCTURE

Generate a detailed scope of works document with the following structure:

### 1. PROJECT OVERVIEW
- Brief summary of the water damage incident
- Scope objectives
- Compliance framework (IICRC S500, NCC, WHS Act)
- Project constraints and assumptions

### 2. PHASE 1: EMERGENCY RESPONSE (Day 1-${data.timeline.emergencyResponseDays})

**Restoration Work Line Items:**
- Initial site assessment and safety evaluation
- Emergency water extraction
- Contents protection and removal
- Carpet lifting/removal
- Wall cavity access (if required)
- Equipment mobilisation and setup
- Initial moisture mapping

**Labour Requirements:**
- Master Technician: [X] hours
- Qualified Technician: [X] hours
- Labourer: [X] hours

**Equipment Days:**
- Extraction units: [X] hours
- Thermal camera: [X] inspections
- Moisture meters: [X] day(s)

### 3. PHASE 2: DRYING (Day ${data.timeline.emergencyResponseDays + 1}-${data.timeline.emergencyResponseDays + data.timeline.dryingDays})

**Restoration Work Line Items:**
- Continuous dehumidification
- Air circulation and ventilation
- Structural drying monitoring
- Daily psychrometric readings
- Moisture content tracking
- Equipment maintenance and adjustment
- Chemical application (antimicrobial/mould prevention)

**Labour Requirements:**
- Daily site visits: Master Technician [X] hours/day
- Equipment checks: Qualified Technician [X] hours/day

**Equipment Days:**
Calculate based on equipment schedule above:
${data.equipment.dehumidifiers.map(d => `- ${d.type}: ${d.quantity} units × ${data.timeline.dryingDays} days`).join('\n')}
${data.equipment.airMovers.map(a => `- ${a.type}: ${a.quantity} units × ${data.timeline.dryingDays} days`).join('\n')}
${data.equipment.afdUnits.map(afd => `- ${afd.type}: ${afd.quantity} units × ${data.timeline.dryingDays} days`).join('\n')}

**Chemical Application:**
- Antimicrobial treatment: [X] sqm
- Mould prevention: [X] sqm (if applicable)

### 4. PHASE 3: VALIDATION (Day ${data.timeline.emergencyResponseDays + data.timeline.dryingDays + 1}-${data.timeline.emergencyResponseDays + data.timeline.dryingDays + data.timeline.validationDays})

**Restoration Work Line Items:**
- Final moisture content verification
- Psychrometric readings confirmation
- Thermal imaging scan
- Post-drying inspection report
- Equipment demobilisation
- Site cleanup and preparation for trades

**Labour Requirements:**
- Master Technician: [X] hours (final inspection)
- Labourer: [X] hours (equipment removal)

### 5. PHASE 4: LICENSED TRADES

**Licensed Trades Section:**
Provide detailed scope for each trade required, clearly indicating:
- Trade type (Plumber, Electrician, Builder, etc.)
- Scope description
- QBCC licensing requirements
- Estimated duration
- Whether estimate is required or confirmed
- Coordination dependencies

${Object.entries(data.licensedTrades).map(([trade, details]) =>
  details ? `
**${trade.charAt(0).toUpperCase() + trade.slice(1).replace(/([A-Z])/g, ' $1').trim()}**
- Scope: ${details.scope}
- Status: ${details.estimated ? 'Quote required - to be confirmed' : 'Scope confirmed'}
- Duration: ${data.timeline.licensedTradesDays} day(s)
- QBCC Licence: Required
` : ''
).join('\n')}

### 6. PHASE 5: CONTENTS RESTORATION

${data.insuranceBreakdown.contentsClaim ? `
**Contents Work Line Items:**
- Pack-out of affected contents
- Transportation to storage facility
- Cleaning and restoration (soft goods, hard goods)
- Ozone or thermal treatment (if required)
- Storage duration
- Pack-back and reinstallation

**Labour Requirements:**
- Packing crew: [X] hours
- Contents technician: [X] hours
- Pack-back crew: [X] hours

**Storage:**
- Duration: [X] weeks
- Volume: [X] cubic metres
` : 'No contents claim - contents restoration excluded from this scope'}

### 7. INSURANCE CLAIM BREAKDOWN

**Building Claim Components:**
${data.insuranceBreakdown.buildingClaim ? `
- Emergency response labour
- Drying equipment and materials
- Structural drying monitoring
- Licensed trades (plumbing, electrical, building)
- Chemical treatments
- Equipment hire
- Project management and administration
` : 'Not applicable - no building claim'}

**Contents Claim Components:**
${data.insuranceBreakdown.contentsClaim ? `
- Pack-out and pack-back labour
- Contents cleaning and restoration
- Storage costs
- Ozone/thermal treatment
- Replacement of non-restorable items
` : 'Not applicable - no contents claim'}

**Additional Costs:**
${data.insuranceBreakdown.tempAccommodation ? '- Temporary accommodation (if uninhabitable)\n' : ''}${data.insuranceBreakdown.businessInterruption ? '- Business interruption loss of income\n' : ''}

### 8. COORDINATION NOTES

**Project Management:**
- Daily progress reporting to client and insurer
- Coordination of licensed trades
- Documentation and photographic evidence
- Compliance with insurer requirements
- Change order management

**Access Requirements:**
- Site access hours: [Specify]
- Key holder contact: [Client details]
- Parking and equipment staging area
- Power supply requirements
- Water supply for equipment

**Communication Protocol:**
- Primary contact: ${data.inspectionReport.property.clientName}
- Insurance adjuster: [To be confirmed]
- Progress update frequency: Daily during active work
- Emergency contact: [Restoration company 24/7 line]

### 9. EXCLUSIONS

Clearly state what is NOT included in this scope:
- Work beyond water damage restoration
- Pre-existing conditions or defects
- Upgrading to current building code (unless required)
- Asbestos removal (if ACM identified - specialist required)
- Structural engineering certification
- Mould remediation beyond preventive treatment
- Contents not listed in initial inventory
- Work not approved by insurer

### 10. ASSUMPTIONS

Document key assumptions:
- Access to property maintained throughout project
- Power and water available on site
- Insurance approval obtained before commencement
- No concealed damages discovered during demolition
- Weather conditions permit outdoor equipment operation
- Licensed trades can commence immediately after validation
- No additional contamination sources identified

### 11. COMPLIANCE & STANDARDS

State adherence to:
- IICRC S500 Water Damage Restoration standard
- IICRC S520 Mould Remediation standard (if applicable)
- Queensland National Construction Code (NCC)
- WHS Act 2011 workplace safety requirements
- QBCC licensing and regulatory compliance
- AS/NZS 3666.1:2011 (HVAC contamination control if applicable)
- Insurance policy terms and conditions

## FORMATTING REQUIREMENTS

- Use clear section numbering and headings
- Present labour hours and equipment days in tabular format where appropriate
- Use bullet points for scope items
- Highlight licensed trades separately
- Clearly distinguish building vs contents claim items
- Include [X] placeholders for quantities to be calculated from inspection data
- Use professional, insurance-industry terminology
- Be specific and measurable where possible

Generate the complete scope of works document now.`
}

// ==========================================
// COST BREAKDOWN GENERATOR
// ==========================================

export async function generateCostBreakdown(
  data: CostBreakdownData,
  userApiKey: string
): Promise<string> {
  try {
    console.log('[ReportGen] Starting cost breakdown generation...')

    const anthropic = createAnthropicClient(userApiKey)
    const prompt = createCostBreakdownPrompt(data)

    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 8000,
      temperature: 0.2, // Lower temperature for accurate calculations
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    })

    if (response.content[0].type === 'text') {
      console.log('[ReportGen] Cost breakdown generated successfully')
      return response.content[0].text
    } else {
      throw new Error('Unexpected response format from Anthropic API')
    }
  } catch (error) {
    console.error('[ReportGen] Error generating cost breakdown:', error)
    throw new Error(
      `Failed to generate cost breakdown: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
  }
}

function createCostBreakdownPrompt(data: CostBreakdownData): string {
  // Calculate totals for reference
  const labourCost =
    (data.calculations.labourHours.masterTechnician.normal * data.pricing.masterTechnicianRate) +
    (data.calculations.labourHours.masterTechnician.afterHours * data.pricing.masterTechnicianRate * data.pricing.afterHoursMultipliers.weekday) +
    (data.calculations.labourHours.qualifiedTechnician.normal * data.pricing.qualifiedTechnicianRate) +
    (data.calculations.labourHours.qualifiedTechnician.afterHours * data.pricing.qualifiedTechnicianRate * data.pricing.afterHoursMultipliers.weekday) +
    (data.calculations.labourHours.labourer.normal * data.pricing.labourerRate) +
    (data.calculations.labourHours.labourer.afterHours * data.pricing.labourerRate * data.pricing.afterHoursMultipliers.weekday)

  const equipmentCost =
    (data.calculations.equipmentDays.dehumidifiers.large * data.pricing.dehumidifierLarge) +
    (data.calculations.equipmentDays.dehumidifiers.medium * data.pricing.dehumidifierMedium) +
    (data.calculations.equipmentDays.dehumidifiers.desiccant * data.pricing.dehumidifierDesiccant) +
    (data.calculations.equipmentDays.airMovers.axial * data.pricing.airmoverAxial) +
    (data.calculations.equipmentDays.airMovers.centrifugal * data.pricing.airmoverCentrifugal) +
    (data.calculations.equipmentDays.airMovers.layflat * data.pricing.airmoverLayflat) +
    (data.calculations.equipmentDays.afds.extraLarge * data.pricing.afdExtraLarge) +
    (data.calculations.equipmentDays.afds.large500cfm * data.pricing.afdLarge500cfm) +
    (data.calculations.equipmentDays.extraction.truckMounted * data.pricing.extractionTruckMounted) +
    (data.calculations.equipmentDays.extraction.electric * data.pricing.extractionElectric) +
    data.pricing.thermalCameraClaimCost

  const chemicalCost =
    (data.calculations.chemicalApplication.antiMicrobialArea * data.pricing.chemicalAntiMicrobial) +
    (data.calculations.chemicalApplication.mouldRemediationArea * data.pricing.chemicalMouldRemediation) +
    (data.calculations.chemicalApplication.bioHazardArea * data.pricing.chemicalBioHazard)

  const licensedTradesCost = Object.values(data.calculations.licensedTrades).reduce((sum, cost) => sum + (cost || 0), 0)

  const feesCost =
    (data.calculations.fees.callout ? data.pricing.minimalCalloutFee : 0) +
    (data.calculations.fees.administration ? data.pricing.administrationFee : 0)

  const subtotalExGST = labourCost + equipmentCost + chemicalCost + licensedTradesCost + feesCost
  const gst = subtotalExGST * data.pricing.taxRate
  const totalIncGST = subtotalExGST + gst

  return `You are a restoration estimator preparing a detailed cost breakdown for insurance claim submission and client approval.

Generate a comprehensive, itemized cost breakdown document based on the scope of works and pricing structure below.

## PROJECT CONTEXT

### Property Details
- Client: ${data.scope.inspectionReport.property.clientName}
- Property Address: ${data.scope.inspectionReport.property.propertyAddress}
- Loss Date: ${data.scope.inspectionReport.property.dateOfLoss}

## PRICING STRUCTURE (AUD, ex-GST unless stated)

### Labour Rates (per hour)
- Master Technician (Normal Hours): $${data.pricing.masterTechnicianRate.toFixed(2)}
- Qualified Technician (Normal Hours): $${data.pricing.qualifiedTechnicianRate.toFixed(2)}
- Labourer (Normal Hours): $${data.pricing.labourerRate.toFixed(2)}

### After-Hours Multipliers
- Weekday (after 4pm): ${data.pricing.afterHoursMultipliers.weekday}x
- Saturday: ${data.pricing.afterHoursMultipliers.saturday}x
- Sunday: ${data.pricing.afterHoursMultipliers.sunday}x

### Equipment Rates (per day)
**Dehumidifiers:**
- Large Dehumidifier: $${data.pricing.dehumidifierLarge.toFixed(2)}/day
- Medium Dehumidifier: $${data.pricing.dehumidifierMedium.toFixed(2)}/day
- Desiccant Dehumidifier: $${data.pricing.dehumidifierDesiccant.toFixed(2)}/day

**Air Movers:**
- Axial Air Mover: $${data.pricing.airmoverAxial.toFixed(2)}/day
- Centrifugal Air Mover: $${data.pricing.airmoverCentrifugal.toFixed(2)}/day
- Layflat Air Mover: $${data.pricing.airmoverLayflat.toFixed(2)}/day

**Air Filtration Devices:**
- Extra Large AFD: $${data.pricing.afdExtraLarge.toFixed(2)}/day
- Large AFD (500 CFM): $${data.pricing.afdLarge500cfm.toFixed(2)}/day

**Extraction Units (per hour):**
- Truck-Mounted Extraction: $${data.pricing.extractionTruckMounted.toFixed(2)}/hour
- Electric Extraction: $${data.pricing.extractionElectric.toFixed(2)}/hour

**Other Equipment:**
- Thermal Camera (claim cost): $${data.pricing.thermalCameraClaimCost.toFixed(2)}

### Chemical Costs (per sqm)
- Anti-Microbial Treatment: $${data.pricing.chemicalAntiMicrobial.toFixed(2)}/sqm
- Mould Remediation: $${data.pricing.chemicalMouldRemediation.toFixed(2)}/sqm
- Bio-Hazard Treatment: $${data.pricing.chemicalBioHazard.toFixed(2)}/sqm

### Fees
- Minimal Callout Fee: $${data.pricing.minimalCalloutFee.toFixed(2)}
- Administration Fee: $${data.pricing.administrationFee.toFixed(2)}

### Tax
- GST Rate: ${(data.pricing.taxRate * 100).toFixed(0)}%

## LABOUR CALCULATIONS

### Master Technician
- Normal Hours: ${data.calculations.labourHours.masterTechnician.normal} hrs @ $${data.pricing.masterTechnicianRate.toFixed(2)}/hr = $${(data.calculations.labourHours.masterTechnician.normal * data.pricing.masterTechnicianRate).toFixed(2)}
- After-Hours: ${data.calculations.labourHours.masterTechnician.afterHours} hrs @ $${(data.pricing.masterTechnicianRate * data.pricing.afterHoursMultipliers.weekday).toFixed(2)}/hr = $${(data.calculations.labourHours.masterTechnician.afterHours * data.pricing.masterTechnicianRate * data.pricing.afterHoursMultipliers.weekday).toFixed(2)}

### Qualified Technician
- Normal Hours: ${data.calculations.labourHours.qualifiedTechnician.normal} hrs @ $${data.pricing.qualifiedTechnicianRate.toFixed(2)}/hr = $${(data.calculations.labourHours.qualifiedTechnician.normal * data.pricing.qualifiedTechnicianRate).toFixed(2)}
- After-Hours: ${data.calculations.labourHours.qualifiedTechnician.afterHours} hrs @ $${(data.pricing.qualifiedTechnicianRate * data.pricing.afterHoursMultipliers.weekday).toFixed(2)}/hr = $${(data.calculations.labourHours.qualifiedTechnician.afterHours * data.pricing.qualifiedTechnicianRate * data.pricing.afterHoursMultipliers.weekday).toFixed(2)}

### Labourer
- Normal Hours: ${data.calculations.labourHours.labourer.normal} hrs @ $${data.pricing.labourerRate.toFixed(2)}/hr = $${(data.calculations.labourHours.labourer.normal * data.pricing.labourerRate).toFixed(2)}
- After-Hours: ${data.calculations.labourHours.labourer.afterHours} hrs @ $${(data.pricing.labourerRate * data.pricing.afterHoursMultipliers.weekday).toFixed(2)}/hr = $${(data.calculations.labourHours.labourer.afterHours * data.pricing.labourerRate * data.pricing.afterHoursMultipliers.weekday).toFixed(2)}

**Total Labour Cost: $${labourCost.toFixed(2)}**

## EQUIPMENT CALCULATIONS

### Dehumidifiers
- Large: ${data.calculations.equipmentDays.dehumidifiers.large} days @ $${data.pricing.dehumidifierLarge.toFixed(2)}/day = $${(data.calculations.equipmentDays.dehumidifiers.large * data.pricing.dehumidifierLarge).toFixed(2)}
- Medium: ${data.calculations.equipmentDays.dehumidifiers.medium} days @ $${data.pricing.dehumidifierMedium.toFixed(2)}/day = $${(data.calculations.equipmentDays.dehumidifiers.medium * data.pricing.dehumidifierMedium).toFixed(2)}
- Desiccant: ${data.calculations.equipmentDays.dehumidifiers.desiccant} days @ $${data.pricing.dehumidifierDesiccant.toFixed(2)}/day = $${(data.calculations.equipmentDays.dehumidifiers.desiccant * data.pricing.dehumidifierDesiccant).toFixed(2)}

### Air Movers
- Axial: ${data.calculations.equipmentDays.airMovers.axial} days @ $${data.pricing.airmoverAxial.toFixed(2)}/day = $${(data.calculations.equipmentDays.airMovers.axial * data.pricing.airmoverAxial).toFixed(2)}
- Centrifugal: ${data.calculations.equipmentDays.airMovers.centrifugal} days @ $${data.pricing.airmoverCentrifugal.toFixed(2)}/day = $${(data.calculations.equipmentDays.airMovers.centrifugal * data.pricing.airmoverCentrifugal).toFixed(2)}
- Layflat: ${data.calculations.equipmentDays.airMovers.layflat} days @ $${data.pricing.airmoverLayflat.toFixed(2)}/day = $${(data.calculations.equipmentDays.airMovers.layflat * data.pricing.airmoverLayflat).toFixed(2)}

### Air Filtration Devices
- Extra Large: ${data.calculations.equipmentDays.afds.extraLarge} days @ $${data.pricing.afdExtraLarge.toFixed(2)}/day = $${(data.calculations.equipmentDays.afds.extraLarge * data.pricing.afdExtraLarge).toFixed(2)}
- Large (500 CFM): ${data.calculations.equipmentDays.afds.large500cfm} days @ $${data.pricing.afdLarge500cfm.toFixed(2)}/day = $${(data.calculations.equipmentDays.afds.large500cfm * data.pricing.afdLarge500cfm).toFixed(2)}

### Extraction Units
- Truck-Mounted: ${data.calculations.equipmentDays.extraction.truckMounted} hrs @ $${data.pricing.extractionTruckMounted.toFixed(2)}/hr = $${(data.calculations.equipmentDays.extraction.truckMounted * data.pricing.extractionTruckMounted).toFixed(2)}
- Electric: ${data.calculations.equipmentDays.extraction.electric} hrs @ $${data.pricing.extractionElectric.toFixed(2)}/hr = $${(data.calculations.equipmentDays.extraction.electric * data.pricing.extractionElectric).toFixed(2)}

### Other Equipment
- Thermal Camera: $${data.pricing.thermalCameraClaimCost.toFixed(2)}

**Total Equipment Cost: $${equipmentCost.toFixed(2)}**

## CHEMICAL TREATMENT CALCULATIONS

- Anti-Microbial Treatment: ${data.calculations.chemicalApplication.antiMicrobialArea} sqm @ $${data.pricing.chemicalAntiMicrobial.toFixed(2)}/sqm = $${(data.calculations.chemicalApplication.antiMicrobialArea * data.pricing.chemicalAntiMicrobial).toFixed(2)}
- Mould Remediation: ${data.calculations.chemicalApplication.mouldRemediationArea} sqm @ $${data.pricing.chemicalMouldRemediation.toFixed(2)}/sqm = $${(data.calculations.chemicalApplication.mouldRemediationArea * data.pricing.chemicalMouldRemediation).toFixed(2)}
- Bio-Hazard Treatment: ${data.calculations.chemicalApplication.bioHazardArea} sqm @ $${data.pricing.chemicalBioHazard.toFixed(2)}/sqm = $${(data.calculations.chemicalApplication.bioHazardArea * data.pricing.chemicalBioHazard).toFixed(2)}

**Total Chemical Cost: $${chemicalCost.toFixed(2)}**

## LICENSED TRADES ESTIMATES

${Object.entries(data.calculations.licensedTrades).map(([trade, cost]) =>
  cost ? `- ${trade.charAt(0).toUpperCase() + trade.slice(1).replace(/([A-Z])/g, ' $1').trim()}: $${cost.toFixed(2)} (estimate)` : ''
).join('\n')}

**Total Licensed Trades: $${licensedTradesCost.toFixed(2)}**

## FEES & ADMINISTRATION

- Callout Fee: ${data.calculations.fees.callout ? `$${data.pricing.minimalCalloutFee.toFixed(2)}` : '$0.00 (waived)'}
- Administration Fee: ${data.calculations.fees.administration ? `$${data.pricing.administrationFee.toFixed(2)}` : '$0.00 (waived)'}

**Total Fees: $${feesCost.toFixed(2)}**

## COST SUMMARY

- Labour Subtotal: $${labourCost.toFixed(2)}
- Equipment Subtotal: $${equipmentCost.toFixed(2)}
- Chemical Subtotal: $${chemicalCost.toFixed(2)}
- Licensed Trades Subtotal: $${licensedTradesCost.toFixed(2)}
- Fees Subtotal: $${feesCost.toFixed(2)}

**Subtotal (ex-GST): $${subtotalExGST.toFixed(2)}**
**GST (${(data.pricing.taxRate * 100).toFixed(0)}%): $${gst.toFixed(2)}**
**TOTAL (inc-GST): $${totalIncGST.toFixed(2)}**

## REQUIRED COST BREAKDOWN DOCUMENT STRUCTURE

Generate a detailed, professional cost breakdown document with the following sections:

### 1. COST SUMMARY OVERVIEW

Present a high-level summary table:

| Category | Ex-GST | GST | Inc-GST |
|----------|--------|-----|---------|
| Labour | $X,XXX.XX | $XXX.XX | $X,XXX.XX |
| Equipment Rental | $X,XXX.XX | $XXX.XX | $X,XXX.XX |
| Chemical Treatments | $XXX.XX | $XX.XX | $XXX.XX |
| Licensed Trades | $X,XXX.XX | $XXX.XX | $X,XXX.XX |
| Fees & Administration | $XXX.XX | $XX.XX | $XXX.XX |
| **TOTAL** | **$XX,XXX.XX** | **$X,XXX.XX** | **$XX,XXX.XX** |

### 2. DETAILED LABOUR BREAKDOWN

Provide itemized labour costs by:
- Category (Emergency Response, Drying Monitoring, Validation, etc.)
- Technician type (Master, Qualified, Labourer)
- Hours worked (normal vs after-hours)
- Hourly rate
- Line total

Example format:
**Emergency Response - Day 1**
- Master Technician (Normal): 4 hrs @ $XXX/hr = $XXX.XX
- Labourer (After-Hours): 3 hrs @ $XXX/hr = $XXX.XX

### 3. DETAILED EQUIPMENT RENTAL BREAKDOWN

Itemize all equipment by:
- Equipment type and model/size
- Quantity
- Daily/hourly rate
- Number of days/hours
- Line total

Group by category (Dehumidifiers, Air Movers, AFDs, Extraction, etc.)

Example format:
**Dehumidifiers**
- Large Dehumidifier × 2 units × 5 days @ $XX/day/unit = $XXX.XX
- Medium Dehumidifier × 1 unit × 5 days @ $XX/day/unit = $XXX.XX

### 4. CHEMICAL TREATMENT COSTS

Detail all chemical applications:
- Treatment type (Anti-microbial, Mould remediation, Bio-hazard)
- Area treated (sqm)
- Rate per sqm
- Line total

### 5. LICENSED TRADES BREAKDOWN

For each licensed trade:
- Trade type
- Scope description
- Estimated cost (or "Quote to be provided")
- QBCC licensing note
- Whether cost is confirmed or provisional

### 6. FEES & ADMINISTRATION

Itemize:
- Callout fee (if applicable)
- Administration fee
- Project management fee (if separate)
- Any other applicable fees

### 7. INDUSTRY COMPARISON (OPTIONAL)

Provide context on pricing:
- Average industry rates for similar water damage projects in Queensland
- Factors affecting cost (water category, class, property size, access)
- Value proposition statement

### 8. EXCLUSIONS FROM COST BREAKDOWN

Clearly state what is NOT included in this estimate:
- Pre-existing damage or defects
- Asbestos removal (if identified - separate specialist quote required)
- Structural engineering certification
- Mould remediation beyond preventive treatment
- Contents restoration (if separate claim)
- Upgrades beyond like-for-like restoration
- Work not approved by insurer

### 9. ASSUMPTIONS AFFECTING COST

Document assumptions that affect pricing:
- Access to property maintained
- Power and water available on site
- Standard working hours (with specified after-hours work)
- Weather permits outdoor equipment operation
- No concealed damages discovered
- Insurance approval obtained before commencement
- Licensed trades available within specified timeline

### 10. COST ADJUSTMENT TRIGGERS

Identify scenarios that may adjust the estimate:
- Extended drying period required (additional equipment days)
- Concealed damage discovered during demolition
- Scope changes requested by client or insurer
- Delays caused by access issues or third parties
- Additional contamination requiring upgraded treatment
- Weather delays affecting timeline

### 11. PAYMENT TERMS & CONDITIONS

State:
- Payment schedule (e.g., deposit, progress payments, final payment)
- Accepted payment methods
- Invoice timing
- Insurance direct payment process
- Client excess/deductible responsibility
- Late payment terms

### 12. APPROVAL & VALIDITY

Include:
- Estimate validity period (e.g., "Valid for 30 days from issue date")
- Approval signature line for client
- Approval signature line for insurer (if applicable)
- Date of estimate
- Estimator name and credentials (IICRC certifications)

### 13. DISCLAIMER

Standard disclaimer text:
- Estimate based on visual inspection only
- Concealed damages may alter final cost
- Costs subject to insurer approval
- Compliance with IICRC S500 and NCC standards
- Right to adjust pricing if scope changes
- Final invoice based on actual work performed

## FORMATTING REQUIREMENTS

- Use professional table formatting for cost summaries
- Bold all category subtotals and grand totals
- Use currency formatting: $X,XXX.XX
- Include GST calculations separately
- Use clear section headings
- Number all line items
- Include page numbers if multi-page
- Use landscape orientation for wide tables if necessary

## TONE & STYLE

- Professional and transparent
- Clear and easy to understand for non-technical clients
- Detailed enough for insurance adjusters
- Compliant with insurance industry requirements
- Australian currency and terminology

Generate the complete detailed cost breakdown document now.`
}
