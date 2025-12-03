import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import Anthropic from '@anthropic-ai/sdk'
import { detectStateFromPostcode, getStateInfo } from '@/lib/state-detection'
import { tryClaudeModels } from '@/lib/anthropic-models'
import { getEquipmentGroupById } from '@/lib/equipment-matrix'

// POST - Generate complete professional inspection report with all 13 sections
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const { reportId, reportType = 'enhanced' } = await request.json()

    if (!reportId) {
      return NextResponse.json(
        { error: 'Report ID is required' },
        { status: 400 }
      )
    }

    // Get the complete report with all data
    const report = await prisma.report.findUnique({
      where: { id: reportId, userId: user.id }
    })

    if (!report) {
      return NextResponse.json(
        { error: 'Report not found' },
        { status: 404 }
      )
    }

    // Parse all stored data
    const analysis = report.technicianReportAnalysis 
      ? JSON.parse(report.technicianReportAnalysis) 
      : null
    const tier1 = report.tier1Responses 
      ? JSON.parse(report.tier1Responses) 
      : null
    const tier2 = report.tier2Responses 
      ? JSON.parse(report.tier2Responses) 
      : null
    const tier3 = report.tier3Responses 
      ? JSON.parse(report.tier3Responses) 
      : null
    const psychrometricAssessment = report.psychrometricAssessment
      ? JSON.parse(report.psychrometricAssessment)
      : null
    const scopeAreas = report.scopeAreas
      ? JSON.parse(report.scopeAreas)
      : null
    const equipmentSelection = report.equipmentSelection
      ? JSON.parse(report.equipmentSelection)
      : null

    // Detect state from postcode
    const stateCode = detectStateFromPostcode(report.propertyPostcode || '')
    const stateInfo = getStateInfo(stateCode)

    // Get user's Anthropic API integration
    const integrations = await prisma.integration.findMany({
      where: {
        userId: user.id,
        status: 'CONNECTED',
        apiKey: { not: null }
      }
    })

    const integration = integrations.find(i => 
      i.name === 'Anthropic Claude' || 
      i.name === 'Anthropic API' ||
      i.name.toLowerCase().includes('anthropic')
    )

    if (!integration?.apiKey) {
      return NextResponse.json(
        { error: 'No connected Anthropic API integration found. Please connect an Anthropic API key.' },
        { status: 400 }
      )
    }

    const anthropic = new Anthropic({
      apiKey: integration.apiKey
    })

    // STAGE 1: Retrieve relevant standards from Google Drive (IICRC Standards folder)
    let standardsContext = ''
    try {
      console.log('[Generate Inspection Report] Starting standards retrieval from Google Drive...')
      const { retrieveRelevantStandards, buildStandardsContextPrompt } = await import('@/lib/standards-retrieval')
      
      // Determine report type
      const retrievalReportType = reportType === 'mould' ? 'mould' : 
                                 reportType === 'fire' ? 'fire' : 
                                 reportType === 'commercial' ? 'commercial' : 'water'
      
      console.log(`[Generate Inspection Report] Report type: ${retrievalReportType}`)
      
      const retrievalQuery = {
        reportType: retrievalReportType,
        waterCategory: report.waterCategory as '1' | '2' | '3' | undefined,
        keywords: [
          report.waterCategory ? `Category ${report.waterCategory}` : '',
          report.waterClass ? `Class ${report.waterClass}` : '',
        ].filter(Boolean),
        materials: extractMaterialsFromReport(report),
        technicianNotes: report.technicianFieldReport?.substring(0, 1000) || '',
      }
      
      console.log('[Generate Inspection Report] Retrieving standards from Google Drive folder...')
      const retrievedStandards = await retrieveRelevantStandards(retrievalQuery, integration.apiKey)
      console.log(`[Generate Inspection Report] Retrieved ${retrievedStandards.documents.length} standards documents`)
      
      standardsContext = buildStandardsContextPrompt(retrievedStandards)
      console.log(`[Generate Inspection Report] Standards context length: ${standardsContext.length} characters`)
      
      if (standardsContext.length > 0) {
        console.log('[Generate Inspection Report] ✅ Successfully retrieved standards from Google Drive')
      } else {
        console.log('[Generate Inspection Report] ⚠️ No standards context generated (folder may be empty or no relevant files found)')
      }
    } catch (error: any) {
      console.error('[Generate Inspection Report] ❌ Error retrieving standards from Google Drive:', error.message)
      console.error('[Generate Inspection Report] Error stack:', error.stack)
      // Continue without standards - report will use general knowledge
    }
    
    // Build comprehensive prompt for all 13 sections
    const prompt = buildInspectionReportPrompt({
      report,
      analysis,
      tier1,
      tier2,
      tier3,
      stateInfo,
      reportType,
      standardsContext,
      psychrometricAssessment,
      scopeAreas,
      equipmentSelection
    })

    const systemPrompt = `You are RestoreAssist, an expert water damage restoration documentation system built for Australian restoration company administration teams. Generate comprehensive, professional inspection reports that strictly adhere to ALL relevant Australian standards, laws, regulations, and best practices. You MUST explicitly reference specific standards, codes, and regulations throughout the report.

CRITICAL: Only use the actual data provided in the REPORT DATA section above. Do NOT:
- Use placeholder text like "Not provided", "Not specified", "N/A", "Unknown", or similar
- Make up or invent information that is not in the provided data
- Include sections for which no data was provided
- Use dummy or default values

Only include information that is explicitly provided in the REPORT DATA section. If a field is not provided, do not mention it in the report.`

    // Generate report using utility with fallback models
    const response = await tryClaudeModels(
      anthropic,
      {
        system: systemPrompt,
        max_tokens: 16000,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      }
    )

    let inspectionReport = ''
    if (response.content && response.content.length > 0 && response.content[0].type === 'text') {
      inspectionReport = response.content[0].text
    } else {
      console.error('Unexpected response format:', response)
      return NextResponse.json(
        { error: 'Failed to generate inspection report: Unexpected response format from AI' },
        { status: 500 }
      )
    }

    if (!inspectionReport || inspectionReport.trim().length === 0) {
      return NextResponse.json(
        { error: 'Failed to generate inspection report: Empty response from AI' },
        { status: 500 }
      )
    }

    // Save the generated report
    await prisma.report.update({
      where: { id: reportId },
      data: {
        detailedReport: inspectionReport,
        reportDepthLevel: reportType === 'basic' ? 'Basic' : (report.reportDepthLevel || 'Enhanced'),
        status: 'PENDING'
      }
    })

    return NextResponse.json({ 
      report: {
        id: reportId,
        detailedReport: inspectionReport
      },
      message: 'Inspection report generated successfully'
    })
  } catch (error) {
    console.error('Error generating inspection report:', error)
    return NextResponse.json(
      { error: 'Failed to generate inspection report' },
      { status: 500 }
    )
  }
}

function buildInspectionReportPrompt(data: {
  report: any
  analysis: any
  tier1: any
  tier2: any
  tier3: any
  stateInfo: any
  reportType: string
  standardsContext?: string
  psychrometricAssessment?: any
  scopeAreas?: any[]
  equipmentSelection?: any[]
}): string {
  const { report, analysis, tier1, tier2, tier3, stateInfo, reportType, standardsContext, psychrometricAssessment, scopeAreas, equipmentSelection } = data
  
  // Log if standards context is provided
  if (standardsContext && standardsContext.length > 0) {
    console.log(`[Build Prompt] Including standards context (${standardsContext.length} characters)`)
  } else {
    console.log('[Build Prompt] No standards context provided - using general knowledge only')
  }

  // Extract water category from tier1 or analysis (only if exists)
  const waterCategory = tier1?.T1_Q3_waterSource 
    ? extractWaterCategory(tier1.T1_Q3_waterSource)
    : (analysis?.waterCategory || null)

  // Extract hazards from tier1
  const hazards = tier1?.T1_Q7_hazards || []
  const hasHazards = hazards.length > 0 && !hazards.includes('None identified')

  // Extract materials from tier1
  const materials = tier1?.T1_Q6_materialsAffected || []

  // Extract occupancy info (only if exists)
  const occupancyStatus = tier1?.T1_Q4_occupancyStatus || null
  const petsPresent = tier1?.T1_Q4_petsPresent || null
  const isOccupied = occupancyStatus ? occupancyStatus.includes('Occupied') : false
  const hasVulnerablePersons = occupancyStatus ? (occupancyStatus.includes('children') || 
                               occupancyStatus.includes('elderly') || 
                               occupancyStatus.includes('respiratory') || 
                               occupancyStatus.includes('disability')) : false

  // Extract water duration (only if exists)
  const waterDuration = tier1?.T1_Q8_waterDuration || null

  // Extract affected areas (only if exists)
  const affectedAreas = tier1?.T1_Q5_roomsAffected || analysis?.affectedAreas?.join(', ') || null

  // Extract equipment from tier2 or analysis (only if exists)
  const equipmentDeployed = tier2?.T2_Q3_equipmentDeployed || 
                            analysis?.equipmentDeployed?.join(', ') || 
                            null

  // Extract moisture readings (only if exists)
  const moistureReadings = tier2?.T2_Q1_moistureReadings || null

  // Extract water migration pattern (only if exists)
  const waterMigration = tier2?.T2_Q2_waterMigrationPattern || null

  // Extract affected contents (only if exists)
  const affectedContents = tier2?.T2_Q4_affectedContents || null

  // Extract structural concerns (only if exists)
  const structuralConcerns = tier2?.T2_Q5_structuralConcerns || []

  // Extract building services affected (only if exists)
  const buildingServices = tier2?.T2_Q6_buildingServicesAffected || []

  // Extract insurance considerations (only if exists)
  const insuranceConsiderations = tier2?.T2_Q7_insuranceConsiderations || null

  // Extract timeline requirements (only if exists)
  const timelineRequirements = tier3?.T3_Q1_timelineRequirements || null

  // Extract drying preferences (only if exists)
  const dryingPreferences = tier3?.T3_Q2_dryingPreferences || null

  // Extract chemical treatment (only if exists)
  const chemicalTreatment = tier3?.T3_Q3_chemicalTreatment || null

  // Extract total affected area (only if exists)
  const totalAffectedArea = tier3?.T3_Q4_totalAffectedArea || null

  // Extract class 4 drying assessment (only if exists)
  const class4Drying = tier3?.T3_Q5_class4DryingAssessment || null

  // Build state-specific regulatory text
  const stateRegulatoryText = stateInfo 
    ? `State: ${stateInfo.name} (${stateInfo.code})
Building Authority: ${stateInfo.buildingAuthority}
Building Code: ${stateInfo.buildingCode}
Work Safety Authority: ${stateInfo.workSafetyAuthority} (Contact: ${stateInfo.workSafetyContact})
EPA Authority: ${stateInfo.epaAuthority} (Contact: ${stateInfo.epaContact})
WHS Act: ${stateInfo.whsAct}
EPA Act: ${stateInfo.epaAct}`
    : 'State information not available (postcode required)'

  // Calculate total amps from equipment selection (only if equipment exists)
  const totalAmps = equipmentSelection && equipmentSelection.length > 0
    ? equipmentSelection.reduce((total: number, sel: any) => {
        const group = getEquipmentGroupById(sel.groupId)
        return total + (group?.amps || 0) * sel.quantity
      }, 0).toFixed(1)
    : null

  return `Generate a comprehensive Professional Inspection Report for RestoreAssist with the following structure. This is a ${reportType === 'basic' ? 'BASIC' : 'ENHANCED'} report.

# REPORT DATA

## Cover Page Information
- Report Title: RestoreAssist Inspection Report
${report.claimReferenceNumber || report.reportNumber ? `- Claim Reference: ${report.claimReferenceNumber || report.reportNumber}` : ''}
- Date Generated: ${new Date().toLocaleString('en-AU', { timeZone: 'Australia/Sydney' })}
- Property Address: ${report.propertyAddress}
${report.propertyPostcode ? `- Postcode: ${report.propertyPostcode}` : ''}
- Client Name: ${report.clientName}
${report.clientContactDetails ? `- Client Contact: ${report.clientContactDetails}` : ''}
${report.technicianName ? `- Technician Name: ${report.technicianName}` : ''}
- Report Depth Level: ${report.reportDepthLevel || (reportType === 'basic' ? 'Basic' : 'Enhanced')}
- Version: ${report.reportVersion || 1}

## Incident Information
${report.incidentDate ? `- Date of Loss: ${new Date(report.incidentDate).toLocaleDateString('en-AU')}` : ''}
${report.technicianAttendanceDate ? `- Technician Attendance Date: ${new Date(report.technicianAttendanceDate).toLocaleDateString('en-AU')}` : ''}
${tier1?.T1_Q3_waterSource || analysis?.waterSource ? `- Water Source: ${tier1?.T1_Q3_waterSource || analysis?.waterSource}` : ''}
${waterCategory ? `- Water Category: ${waterCategory}` : ''}
${waterDuration ? `- Water Duration: ${waterDuration}` : ''}

## Property Information
${tier1?.T1_Q1_propertyType ? `- Property Type: ${tier1.T1_Q1_propertyType}` : ''}
${tier1?.T1_Q2_constructionYear ? `- Construction Year: ${tier1.T1_Q2_constructionYear}` : ''}
${occupancyStatus ? `- Occupancy Status: ${occupancyStatus}` : ''}
${petsPresent ? `- Pets Present: ${petsPresent}` : ''}

${affectedAreas ? `## Affected Areas
${affectedAreas}` : ''}

${materials.length > 0 ? `## Affected Materials
${materials.join(', ')}` : ''}

${equipmentDeployed ? `## Equipment Deployed
${equipmentDeployed}` : ''}

${moistureReadings ? `## Moisture Readings
${moistureReadings}` : ''}

${waterMigration ? `## Water Migration Pattern
${waterMigration}` : ''}

${affectedContents ? `## Affected Contents
${affectedContents}` : ''}

${structuralConcerns.length > 0 ? `## Structural Concerns
${structuralConcerns.join(', ')}` : ''}

${buildingServices.length > 0 ? `## Building Services Affected
${buildingServices.join(', ')}` : ''}

${hazards.length > 0 && hasHazards ? `## Hazards Identified
${hazards.join(', ')}` : ''}

${insuranceConsiderations ? `## Insurance Considerations
${insuranceConsiderations}` : ''}

${timelineRequirements || dryingPreferences || chemicalTreatment || totalAffectedArea || class4Drying ? `## Timeline & Preferences
${timelineRequirements ? `- Timeline Requirements: ${timelineRequirements}` : ''}
${dryingPreferences ? `- Drying Preferences: ${dryingPreferences}` : ''}
${chemicalTreatment ? `- Chemical Treatment: ${chemicalTreatment}` : ''}
${totalAffectedArea ? `- Total Affected Area: ${totalAffectedArea}` : ''}
${class4Drying ? `- Class 4 Drying Assessment: ${class4Drying}` : ''}` : ''}

## State Regulatory Framework
${stateRegulatoryText}

${report.technicianFieldReport ? `## Technician Field Report
${report.technicianFieldReport}` : ''}

${psychrometricAssessment ? `## Psychrometric Assessment Data
${psychrometricAssessment.waterClass ? `- Water Loss Class: Class ${psychrometricAssessment.waterClass}` : ''}
${psychrometricAssessment.temperature ? `- Temperature: ${psychrometricAssessment.temperature}°C` : ''}
${psychrometricAssessment.humidity ? `- Humidity: ${psychrometricAssessment.humidity}%` : ''}
${psychrometricAssessment.systemType ? `- System Type: ${psychrometricAssessment.systemType} Ventilation` : ''}
${psychrometricAssessment.dryingPotential?.dryingIndex ? `- Drying Index: ${psychrometricAssessment.dryingPotential.dryingIndex}` : ''}
${psychrometricAssessment.dryingPotential?.status ? `- Drying Status: ${psychrometricAssessment.dryingPotential.status}` : ''}
${psychrometricAssessment.dryingPotential?.recommendation ? `- Recommendation: ${psychrometricAssessment.dryingPotential.recommendation}` : ''}

${scopeAreas && scopeAreas.length > 0 ? `## Scope Areas (${scopeAreas.length} areas)
${scopeAreas.map((area: any, idx: number) => `
Area ${idx + 1}: ${area.name}
- Dimensions: ${area.length}m × ${area.width}m × ${area.height}m
- Volume: ${(area.length * area.width * area.height).toFixed(1)} m³
- Wet Area: ${(area.length * area.width * (area.wetPercentage / 100)).toFixed(1)} m²
- Wet Percentage: ${area.wetPercentage}%
`).join('\n')}
- Total Volume: ${scopeAreas.reduce((sum: number, a: any) => sum + (a.length * a.width * a.height), 0).toFixed(1)} m³
- Total Affected Area: ${scopeAreas.reduce((sum: number, a: any) => sum + (a.length * a.width * (a.wetPercentage / 100)), 0).toFixed(1)} m²
` : ''}

${equipmentSelection && equipmentSelection.length > 0 ? `## Equipment Selection
${equipmentSelection.map((sel: any) => {
  const group = getEquipmentGroupById(sel.groupId)
  return `- ${group?.name || sel.groupId}: ${sel.quantity} units @ $${sel.dailyRate || group?.dailyRate || 0}/day`
}).join('\n')}
- Total Daily Cost: $${report.equipmentCostTotal ? (report.equipmentCostTotal / (report.estimatedDryingDuration || 1)).toFixed(2) : '0.00'}
- Estimated Duration: ${report.estimatedDryingDuration || 'N/A'} days
- Total Equipment Cost: $${report.equipmentCostTotal?.toFixed(2) || '0.00'}
` : ''}
` : ''}

${standardsContext ? standardsContext + '\n\n' : ''}

# REPORT STRUCTURE REQUIREMENTS

${standardsContext ? '**IMPORTANT: The standards documents above have been retrieved from the Google Drive "IICRC Standards" folder. You MUST reference and cite specific sections from these documents throughout the report. Use exact standard numbers, section references, and terminology from the retrieved documents.**\n\n' : ''}

${data.standardsContext ? '**IMPORTANT: The standards documents above have been retrieved from the Google Drive "IICRC Standards" folder. You MUST reference and cite specific sections from these documents throughout the report. Use exact standard numbers, section references, and terminology from the retrieved documents.**\n\n' : ''}

Generate a comprehensive Professional Inspection Report with ALL of the following sections. **CRITICAL: You MUST use proper Markdown heading syntax (# for H1, ## for H2, ### for H3) for all section headers. Do NOT use plain text for section titles.**

# PRELIMINARY ASSESSMENT — NOT FINAL ESTIMATE

## RestoreAssist Inspection Report

Include all cover page information listed above in a structured format.

## SECTION 1: EXECUTIVE SUMMARY
One paragraph overview including:
- Type of incident
- Areas affected
- Primary remediation approach
- Key compliance considerations
Use the example format provided in the specification.

## SECTION 2: LOSS DETAILS
- Date of Loss & Discovery Timeline
- Source of Water Ingress (with IICRC Category classification)
- Weather/Environmental Context (if Tier 2/3 completed)
- Client Contact & Occupancy Status
- Technician Attendance Notes

## SECTION 3: PSYCHROMETRIC ASSESSMENT
${psychrometricAssessment ? `Include a comprehensive psychrometric assessment section with:

### KEY PERFORMANCE METRICS
**CRITICAL: Use ### for subsection headers like this one.**
${psychrometricAssessment.dryingPotential?.dryingIndex ? `- Drying Index: ${psychrometricAssessment.dryingPotential.dryingIndex}${psychrometricAssessment.dryingPotential?.status ? ` (Status: ${psychrometricAssessment.dryingPotential.status})` : ''}` : ''}
${report.dehumidificationCapacity ? `- Liters/Day Target: ${report.dehumidificationCapacity} L/Day` : ''}
${report.airmoversCount ? `- Air Movers Required: ${report.airmoversCount} units` : ''}
${scopeAreas && scopeAreas.length > 0 ? `- Total Volume: ${scopeAreas.reduce((sum: number, a: any) => sum + (a.length * a.width * a.height), 0).toFixed(1)} m³` : ''}

### ENVIRONMENTAL CONDITIONS
${psychrometricAssessment.waterClass ? `- Water Class: Class ${psychrometricAssessment.waterClass} (IICRC Standard)` : ''}
${psychrometricAssessment.temperature ? `- Temperature: ${psychrometricAssessment.temperature}°C (Ambient)` : ''}
${psychrometricAssessment.humidity ? `- Humidity: ${psychrometricAssessment.humidity}% (Relative)` : ''}
${psychrometricAssessment.systemType ? `- System Type: ${psychrometricAssessment.systemType} (Ventilation)` : ''}

${psychrometricAssessment.dryingPotential?.recommendation ? `### DRYING STRATEGY ANALYSIS
${psychrometricAssessment.dryingPotential.recommendation}` : ''}

### DRYING POTENTIAL REFERENCE GUIDE
- 0-30 (POOR): Air saturated or cold. Minimal evaporation. Action: Increase heat or dehumidification.
- 30-50 (FAIR): Slow evaporation. Action: Add air movement and monitor closely.
- 50-80 (GOOD): Optimal range. Action: Maintain current setup.
- 80+ (EXCELLENT): Rapid evaporation. Action: Watch for over-drying.


${equipmentSelection && equipmentSelection.length > 0 ? `### EQUIPMENT LOADOUT SCHEDULE
${equipmentSelection.reduce((sum: number, sel: any) => sum + sel.quantity, 0)} Total Units

${equipmentSelection.map((sel: any) => {
  const group = getEquipmentGroupById(sel.groupId)
  const type = group?.id.includes('lgr') ? 'DEHUMIDIFIER TYPE' : 
               group?.id.includes('desiccant') ? 'DEHUMIDIFIER TYPE' :
               group?.id.includes('airmover') ? 'AIR_MOVER TYPE' :
               group?.id.includes('heat') ? 'HEAT TYPE' : 'EQUIPMENT TYPE'
  return `- ${group?.capacity || sel.groupId} (${type}): ×${sel.quantity} Units`
}).join('\n')}

${report.estimatedDryingDuration || report.equipmentCostTotal || totalAmps ? `**Estimated Consumption:**
${report.estimatedDryingDuration ? `- Duration: ${report.estimatedDryingDuration} Days` : ''}
${report.equipmentCostTotal ? `- Total Cost: $${report.equipmentCostTotal.toFixed(2)}` : ''}
${totalAmps ? `- Total Draw: ${totalAmps} Amps` : ''}` : ''}
` : ''}

### REPORT CERTIFICATION
This report has been generated using the AuRestor Proprietary Psychrometric Engine. All calculations comply with ANSI/IICRC S500 Standards for Professional Water Damage Restoration.

Generated by AuRestor Industries
© ${new Date().getFullYear()} AuRestor Industries. All rights reserved.
` : 'Psychrometric assessment data not available. Include standard IICRC S500 psychrometric assessment based on available data.'}

## SECTION 4: AREAS AFFECTED
Detailed room-by-room breakdown with:
- Affected materials
- Visible damage description
- Water depth estimate (if known)
- Progression observed

## SECTION 5: STANDARDS COMPLIANCE FRAMEWORK
### Subsection A: IICRC Water Damage Standards
### Subsection B: Building Code Compliance (use state-specific building code)
### Subsection C: Work Health and Safety (use state-specific WHS Act)
### Subsection D: Environmental Protection (use state-specific EPA Act)
### Subsection E: Local Council Requirements (if postcode available)

## SECTION 6: HAZARD ASSESSMENT FLAGS
${hasHazards ? `For EACH hazard identified, create a STOP WORK FLAG block with:
- 🚩 STOP WORK FLAG: [Hazard Name]
- Description
- IICRC/WHS Requirement
- Specialist Referral
- Notification Required (use state-specific authorities)
- Cost Impact
- Timeline Impact` : 'No hazards identified - this section can be brief or omitted.'}

## SECTION 7: INITIAL REMEDIATION ACTIONS COMPLETED
- Standing Water Extraction
- Equipment Deployed (with details from data)
- Moisture Assessment
- Initial PPE & Safety

## SECTION 8: DRYING PROTOCOL AND METHODOLOGY
For each material type identified, provide specific protocols:
${materials.includes('Yellow tongue particleboard') ? '- Yellow Tongue Particleboard Subfloor (Class 3/4 drying) - IICRC S500 Section 5.2' : ''}
${materials.includes('Floating timber floors') ? '- Floating Timber Floors (Class 2/3) - IICRC S500 Section 5.1' : ''}
${materials.includes('Carpet on concrete slab') ? '- Carpet on Concrete Slab (Class 1) - IICRC S500 Section 4.2' : ''}
${materials.some(m => m.includes('Plasterboard')) ? '- Plasterboard Walls & Ceilings - IICRC S500 Section 5.3' : ''}

## SECTION 9: OCCUPANCY AND SAFETY CONSIDERATIONS
${isOccupied ? 'Include: Access Restrictions, Air Quality, Utilities, Pet/Children Safety' : ''}
${hasVulnerablePersons ? 'Include: Respiratory Health, Mobility, Medical Equipment' : ''}
${petsPresent ? 'Include: Dogs/Cats, Exotic Animals, Pest Activity considerations' : ''}
${occupancyStatus && occupancyStatus.includes('Vacant') ? 'Include: Security, Timeline Flexibility, Utility Access' : ''}

## SECTION 10: SECONDARY DAMAGE AND MOULD RISK
- Mould Growth Risk Assessment (based on water duration)
- Preventative Measures
- If Active Mould Detected (protocol)
- Occupant Health Considerations

## SECTION 11: POWER AND EQUIPMENT REQUIREMENTS
- Power Draw Calculation (calculate from equipment deployed)
- Context and recommendations
- Alternative options if needed

## SECTION 12: THINGS TO CONSIDER
- Insurance Coverage
- Timeframe Expectations
- Occupant Communication
- Building Certifier (use state-specific building authority)
- Temporary Accommodation
- Contents Replacement

## SECTION 13: AUTHORITY NOTIFICATION CHECKLIST
${stateInfo ? `Use state-specific authorities:
- ${stateInfo.workSafetyAuthority} - Contact: ${stateInfo.workSafetyContact}
- ${stateInfo.epaAuthority} - Contact: ${stateInfo.epaContact}
- Local Council Building Certifier
- Insurance Company
- ${stateInfo.buildingAuthority} (if structural repairs required)` : 'Use generic Australian authorities'}

## SECTION 14: RECOMMENDATIONS AND NEXT STEPS
- Immediate (Day 0–1)
- Short-term (Days 1–7)
- If Class 4 Drying Required
- If Specialist Referrals Triggered
- Final Validation

## SIGNATURE
${report.technicianName ? `At the end of the report, include a signature section aligned to the right side with:
- Technician Name: ${report.technicianName}
- Date: ${new Date().toLocaleDateString('en-AU')}
- Position: Water Damage Restoration Technician
- Company: RestoreAssist

Format the signature section at the bottom right of the report with appropriate spacing.` : 'Include a signature section at the bottom right of the report with the date of report generation.'}

# CRITICAL REQUIREMENTS

1. **MARKDOWN FORMATTING IS MANDATORY**: You MUST use proper Markdown heading syntax:
   - Use single hash (#) followed by space for the main title "PRELIMINARY ASSESSMENT — NOT FINAL ESTIMATE"
   - Use double hash (##) followed by space for all major section headers like "## SECTION 1: EXECUTIVE SUMMARY"
   - Use triple hash (###) followed by space for all subsection headers like "### KEY PERFORMANCE METRICS"
   - Do NOT use plain text for section titles - they must have markdown heading syntax
2. Use state-specific regulatory information provided (${stateInfo ? stateInfo.name : 'generic Australian'})
3. Reference IICRC S500:2025 and S520 standards explicitly
4. Reference ${stateInfo ? stateInfo.buildingCode : 'NCC'} explicitly
5. Reference ${stateInfo ? stateInfo.whsAct : 'Work Health and Safety Act 2011'} explicitly
6. Use ONLY the actual data provided in the REPORT DATA section - do not make up information
7. Do NOT include any placeholder text like "Not provided", "Not specified", "N/A", or "Unknown"
8. Only include sections and fields for which actual data was provided
9. Include all required subsections
10. Use Australian English spelling
11. Make it comprehensive and professional

Generate the complete report now.`
}

function extractMaterialsFromReport(report: any): string[] {
  const materials: string[] = []
  
  // Extract from tier1Responses
  if (report.tier1Responses) {
    try {
      const tier1 = JSON.parse(report.tier1Responses)
      if (tier1.T1_Q6_materialsAffected && Array.isArray(tier1.T1_Q6_materialsAffected)) {
        materials.push(...tier1.T1_Q6_materialsAffected)
      }
    } catch (error) {
      // Invalid JSON, skip
    }
  }
  
  // Extract from technicianReportAnalysis
  if (report.technicianReportAnalysis) {
    try {
      const analysis = JSON.parse(report.technicianReportAnalysis)
      if (analysis.materialsAffected && Array.isArray(analysis.materialsAffected)) {
        materials.push(...analysis.materialsAffected)
      }
    } catch (error) {
      // Invalid JSON, skip
    }
  }
  
  // Extract from technicianFieldReport text
  if (report.technicianFieldReport) {
    const lowerNotes = report.technicianFieldReport.toLowerCase()
    const materialKeywords = [
      'timber', 'wood', 'carpet', 'plasterboard', 'gyprock', 'concrete',
      'particleboard', 'yellow tongue', 'floating floor', 'tiles', 'vinyl',
      'drywall', 'insulation', 'ceiling', 'flooring', 'subfloor'
    ]
    
    materialKeywords.forEach(material => {
      if (lowerNotes.includes(material) && !materials.includes(material)) {
        materials.push(material)
      }
    })
  }
  
  return [...new Set(materials)] // Deduplicate
}

function extractWaterCategory(waterSource: string): string {
  if (!waterSource) return 'Not specified'
  
  const category1Sources = ['Burst pipe', 'Roof leak', 'Hot water service failure', 'Washing machine', 'Dishwasher']
  const category2Sources = ['Overflowing toilet', 'Grey water']
  const category3Sources = ['Flood', 'Sewage backup', 'Biohazard', 'Contaminated']
  
  if (category1Sources.some(s => waterSource.includes(s))) return 'Category 1'
  if (category2Sources.some(s => waterSource.includes(s))) return 'Category 2'
  if (category3Sources.some(s => waterSource.includes(s))) return 'Category 3'
  
  return 'Category 1' // Default
}

