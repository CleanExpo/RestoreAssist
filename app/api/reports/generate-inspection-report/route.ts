import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import Anthropic from '@anthropic-ai/sdk'
import { detectStateFromPostcode, getStateInfo } from '@/lib/state-detection'
import { tryClaudeModels } from '@/lib/anthropic-models'

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

    // Build comprehensive prompt for all 13 sections
    const prompt = buildInspectionReportPrompt({
      report,
      analysis,
      tier1,
      tier2,
      tier3,
      stateInfo,
      reportType
    })

    const systemPrompt = `You are RestoreAssist, an expert water damage restoration documentation system built for Australian restoration company administration teams. Generate comprehensive, professional inspection reports that strictly adhere to ALL relevant Australian standards, laws, regulations, and best practices. You MUST explicitly reference specific standards, codes, and regulations throughout the report. Always use the actual information provided - NEVER use placeholder text or "[Redacted for Privacy]".`

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
}): string {
  const { report, analysis, tier1, tier2, tier3, stateInfo, reportType } = data

  // Extract water category from tier1 or analysis
  const waterCategory = tier1?.T1_Q3_waterSource 
    ? extractWaterCategory(tier1.T1_Q3_waterSource)
    : (analysis?.waterCategory || 'Not specified')

  // Extract hazards from tier1
  const hazards = tier1?.T1_Q7_hazards || []
  const hasHazards = hazards.length > 0 && !hazards.includes('None identified')

  // Extract materials from tier1
  const materials = tier1?.T1_Q6_materialsAffected || []

  // Extract occupancy info
  const occupancyStatus = tier1?.T1_Q4_occupancyStatus || 'Unknown'
  const petsPresent = tier1?.T1_Q4_petsPresent || ''
  const isOccupied = occupancyStatus.includes('Occupied')
  const hasVulnerablePersons = occupancyStatus.includes('children') || 
                               occupancyStatus.includes('elderly') || 
                               occupancyStatus.includes('respiratory') || 
                               occupancyStatus.includes('disability')

  // Extract water duration
  const waterDuration = tier1?.T1_Q8_waterDuration || 'Unknown'

  // Extract affected areas
  const affectedAreas = tier1?.T1_Q5_roomsAffected || analysis?.affectedAreas?.join(', ') || 'Not specified'

  // Extract equipment from tier2 or analysis
  const equipmentDeployed = tier2?.T2_Q3_equipmentDeployed || 
                            analysis?.equipmentDeployed?.join(', ') || 
                            'Not specified'

  // Extract moisture readings
  const moistureReadings = tier2?.T2_Q1_moistureReadings || 'Not provided'

  // Extract water migration pattern
  const waterMigration = tier2?.T2_Q2_waterMigrationPattern || 'Not provided'

  // Extract affected contents
  const affectedContents = tier2?.T2_Q4_affectedContents || 'Not provided'

  // Extract structural concerns
  const structuralConcerns = tier2?.T2_Q5_structuralConcerns || []

  // Extract building services affected
  const buildingServices = tier2?.T2_Q6_buildingServicesAffected || []

  // Extract insurance considerations
  const insuranceConsiderations = tier2?.T2_Q7_insuranceConsiderations || 'Not provided'

  // Extract timeline requirements
  const timelineRequirements = tier3?.T3_Q1_timelineRequirements || 'No specific deadline'

  // Extract drying preferences
  const dryingPreferences = tier3?.T3_Q2_dryingPreferences || 'Balanced'

  // Extract chemical treatment
  const chemicalTreatment = tier3?.T3_Q3_chemicalTreatment || 'Standard antimicrobial treatment'

  // Extract total affected area
  const totalAffectedArea = tier3?.T3_Q4_totalAffectedArea || 'Not specified'

  // Extract class 4 drying assessment
  const class4Drying = tier3?.T3_Q5_class4DryingAssessment || 'Uncertain'

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

  return `Generate a comprehensive Professional Inspection Report for RestoreAssist with the following structure. This is a ${reportType === 'basic' ? 'BASIC' : 'ENHANCED'} report.

# REPORT DATA

## Cover Page Information
- Report Title: RestoreAssist Inspection Report
- Claim Reference: ${report.claimReferenceNumber || report.reportNumber || 'Not provided'}
- Date Generated: ${new Date().toLocaleString('en-AU', { timeZone: 'Australia/Sydney' })}
- Property Address: ${report.propertyAddress}
- Postcode: ${report.propertyPostcode || 'Not provided'}
- Client Name: ${report.clientName}
- Client Contact: ${report.clientContactDetails || 'Not provided'}
- Technician Name: ${report.technicianName || 'Not provided'}
- Report Depth Level: ${report.reportDepthLevel || (reportType === 'basic' ? 'Basic' : 'Enhanced')}
- Version: ${report.reportVersion || 1}

## Incident Information
- Date of Loss: ${report.incidentDate ? new Date(report.incidentDate).toLocaleDateString('en-AU') : 'Not provided'}
- Technician Attendance Date: ${report.technicianAttendanceDate ? new Date(report.technicianAttendanceDate).toLocaleDateString('en-AU') : 'Not provided'}
- Water Source: ${tier1?.T1_Q3_waterSource || analysis?.waterSource || 'Not specified'}
- Water Category: ${waterCategory}
- Water Duration: ${waterDuration}

## Property Information
- Property Type: ${tier1?.T1_Q1_propertyType || 'Not specified'}
- Construction Year: ${tier1?.T1_Q2_constructionYear || 'Unknown'}
- Occupancy Status: ${occupancyStatus}
- Pets Present: ${petsPresent || 'Not specified'}

## Affected Areas
${affectedAreas}

## Affected Materials
${materials.join(', ') || 'Not specified'}

## Equipment Deployed
${equipmentDeployed}

## Moisture Readings
${moistureReadings}

## Water Migration Pattern
${waterMigration}

## Affected Contents
${affectedContents}

## Structural Concerns
${structuralConcerns.join(', ') || 'None identified'}

## Building Services Affected
${buildingServices.join(', ') || 'No services affected'}

## Hazards Identified
${hazards.join(', ') || 'None identified'}

## Insurance Considerations
${insuranceConsiderations}

## Timeline & Preferences
- Timeline Requirements: ${timelineRequirements}
- Drying Preferences: ${dryingPreferences}
- Chemical Treatment: ${chemicalTreatment}
- Total Affected Area: ${totalAffectedArea}
- Class 4 Drying Assessment: ${class4Drying}

## State Regulatory Framework
${stateRegulatoryText}

## Technician Field Report
${report.technicianFieldReport || 'Not provided'}

# REPORT STRUCTURE REQUIREMENTS

Generate a comprehensive Professional Inspection Report with ALL of the following 13 sections:

## COVER PAGE
Include prominently: "PRELIMINARY ASSESSMENT — NOT FINAL ESTIMATE"
All cover page information listed above.

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

## SECTION 3: AREAS AFFECTED
Detailed room-by-room breakdown with:
- Affected materials
- Visible damage description
- Water depth estimate (if known)
- Progression observed

## SECTION 4: STANDARDS COMPLIANCE FRAMEWORK
Subsection A: IICRC Water Damage Standards
Subsection B: Building Code Compliance (use state-specific building code)
Subsection C: Work Health and Safety (use state-specific WHS Act)
Subsection D: Environmental Protection (use state-specific EPA Act)
Subsection E: Local Council Requirements (if postcode available)

## SECTION 5: HAZARD ASSESSMENT FLAGS
${hasHazards ? `For EACH hazard identified, create a STOP WORK FLAG block with:
- 🚩 STOP WORK FLAG: [Hazard Name]
- Description
- IICRC/WHS Requirement
- Specialist Referral
- Notification Required (use state-specific authorities)
- Cost Impact
- Timeline Impact` : 'No hazards identified - this section can be brief or omitted.'}

## SECTION 6: INITIAL REMEDIATION ACTIONS COMPLETED
- Standing Water Extraction
- Equipment Deployed (with details from data)
- Moisture Assessment
- Initial PPE & Safety

## SECTION 7: DRYING PROTOCOL AND METHODOLOGY
For each material type identified, provide specific protocols:
${materials.includes('Yellow tongue particleboard') ? '- Yellow Tongue Particleboard Subfloor (Class 3/4 drying) - IICRC S500 Section 5.2' : ''}
${materials.includes('Floating timber floors') ? '- Floating Timber Floors (Class 2/3) - IICRC S500 Section 5.1' : ''}
${materials.includes('Carpet on concrete slab') ? '- Carpet on Concrete Slab (Class 1) - IICRC S500 Section 4.2' : ''}
${materials.some(m => m.includes('Plasterboard')) ? '- Plasterboard Walls & Ceilings - IICRC S500 Section 5.3' : ''}

## SECTION 8: OCCUPANCY AND SAFETY CONSIDERATIONS
${isOccupied ? 'Include: Access Restrictions, Air Quality, Utilities, Pet/Children Safety' : ''}
${hasVulnerablePersons ? 'Include: Respiratory Health, Mobility, Medical Equipment' : ''}
${petsPresent ? 'Include: Dogs/Cats, Exotic Animals, Pest Activity considerations' : ''}
${occupancyStatus.includes('Vacant') ? 'Include: Security, Timeline Flexibility, Utility Access' : ''}

## SECTION 9: SECONDARY DAMAGE AND MOULD RISK
- Mould Growth Risk Assessment (based on water duration)
- Preventative Measures
- If Active Mould Detected (protocol)
- Occupant Health Considerations

## SECTION 10: POWER AND EQUIPMENT REQUIREMENTS
- Power Draw Calculation (calculate from equipment deployed)
- Context and recommendations
- Alternative options if needed

## SECTION 11: THINGS TO CONSIDER
- Insurance Coverage
- Timeframe Expectations
- Occupant Communication
- Building Certifier (use state-specific building authority)
- Temporary Accommodation
- Contents Replacement

## SECTION 12: AUTHORITY NOTIFICATION CHECKLIST
${stateInfo ? `Use state-specific authorities:
- ${stateInfo.workSafetyAuthority} - Contact: ${stateInfo.workSafetyContact}
- ${stateInfo.epaAuthority} - Contact: ${stateInfo.epaContact}
- Local Council Building Certifier
- Insurance Company
- ${stateInfo.buildingAuthority} (if structural repairs required)` : 'Use generic Australian authorities'}

## SECTION 13: RECOMMENDATIONS AND NEXT STEPS
- Immediate (Day 0–1)
- Short-term (Days 1–7)
- If Class 4 Drying Required
- If Specialist Referrals Triggered
- Final Validation

# CRITICAL REQUIREMENTS

1. Use state-specific regulatory information provided (${stateInfo ? stateInfo.name : 'generic Australian'})
2. Reference IICRC S500:2025 and S520 standards explicitly
3. Reference ${stateInfo ? stateInfo.buildingCode : 'NCC'} explicitly
4. Reference ${stateInfo ? stateInfo.whsAct : 'Work Health and Safety Act 2011'} explicitly
5. Use actual data provided - do not make up information
6. If information is "Not provided" or "Not specified", note it appropriately
7. Format professionally with clear headings and sections
8. Include all required subsections
9. Use Australian English spelling
10. Make it comprehensive and professional

Generate the complete report now.`
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

