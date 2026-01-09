import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generateForensicReportPDF } from '@/lib/generate-forensic-report-pdf'
import { detectStateFromPostcode, getStateInfo } from '@/lib/state-detection'

/**
 * GET /api/reports/[id]/generate-forensic-pdf
 * 
 * Generates a professional forensic inspection report PDF matching the
 * Disaster Recovery QLD format with exact layout and structure.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: reportId } = await params

    // Get user with business info
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: {
        id: true,
        name: true,
        email: true,
        businessName: true,
        businessAddress: true,
        businessLogo: true,
        businessABN: true,
        businessPhone: true,
        businessEmail: true,
        pricingConfig: true
      }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Get the report
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

    // Get user's Anthropic API integration for Google Drive standards retrieval
    const integrations = await prisma.integration.findMany({
      where: {
        userId: user.id,
        status: 'CONNECTED',
        apiKey: { not: null }
      }
    })

    const integration = integrations.find((i: any) => 
      i.name === 'Anthropic Claude' || 
      i.name === 'Anthropic API' ||
      i.name.toLowerCase().includes('anthropic')
    )

    // Retrieve standards from Google Drive if integration is available
    let standardsContext = ''
    if (integration?.apiKey) {
      try {
        const { retrieveRelevantStandards, buildStandardsContextPrompt } = await import('@/lib/standards-retrieval')

        // Determine report type
        const retrievalReportType: 'mould' | 'fire' | 'commercial' | 'water' | 'general' =
          report.hazardType === 'Mould' ? 'mould' :
          report.hazardType === 'Fire' ? 'fire' :
          report.hazardType === 'Commercial' ? 'commercial' : 'water'

        const retrievalQuery = {
          reportType: retrievalReportType,
          waterCategory: report.waterCategory as '1' | '2' | '3' | undefined,
          keywords: [
            report.waterCategory ? `Category ${report.waterCategory}` : '',
            report.waterClass ? `Class ${report.waterClass}` : '',
          ].filter(Boolean),
          materials: tier1?.T1_Q6_materialsAffected || [],
          technicianNotes: report.technicianFieldReport?.substring(0, 1000) || '',
        }

        const retrievedStandards = await retrieveRelevantStandards(retrievalQuery, integration.apiKey)

        standardsContext = buildStandardsContextPrompt(retrievedStandards)
      } catch (error: any) {
        console.error('[Generate Forensic PDF] Error retrieving standards:', error)
        // Continue without standards context - not critical for PDF generation
      }
    }

    // NEW: Retrieve regulatory context if user opted in AND feature flag is enabled
    let regulatoryContext = null
    if (
      process.env.ENABLE_REGULATORY_CITATIONS === 'true' &&
      report.includeRegulatoryCitations === true
    ) {
      try {
        const { retrieveRegulatoryContext } = await import('@/lib/regulatory-retrieval')

        // Determine report type for regulatory retrieval
        const retrievalReportType: 'water' | 'mould' | 'fire' | 'commercial' =
          report.hazardType === 'Mould' ? 'mould' :
          report.hazardType === 'Fire' ? 'fire' :
          report.hazardType === 'Commercial' ? 'commercial' : 'water'

        const regulatoryQuery = {
          reportType: retrievalReportType,
          waterCategory: report.waterCategory as '1' | '2' | '3' | undefined,
          state: stateCode,
          postcode: report.propertyPostcode,
          insurerName: report.insurerName || undefined,
          requiresElectricalWork: tier1?.T1_Q6_materialsAffected?.some((m: string) =>
            m.toLowerCase().includes('electrical') || m.toLowerCase().includes('appliance')
          ) || false
        }

        regulatoryContext = await retrieveRegulatoryContext(regulatoryQuery, integration?.apiKey)
      } catch (error: any) {
        console.error('[Generate Forensic PDF] Error retrieving regulatory context:', error)
        // Continue without regulatory context (graceful degradation)
      }
    }

    // Prepare report data with all assessment report fields
    const reportData = {
      report: {
        ...report,
        pricingConfig: user.pricingConfig,
        // Include all new assessment report fields
        buildingAge: report.buildingAge,
        structureType: report.structureType,
        accessNotes: report.accessNotes,
        methamphetamineScreen: report.methamphetamineScreen,
        methamphetamineTestCount: report.methamphetamineTestCount,
        biologicalMouldDetected: report.biologicalMouldDetected,
        biologicalMouldCategory: report.biologicalMouldCategory,
        phase1StartDate: report.phase1StartDate,
        phase1EndDate: report.phase1EndDate,
        phase2StartDate: report.phase2StartDate,
        phase2EndDate: report.phase2EndDate,
        phase3StartDate: report.phase3StartDate,
        phase3EndDate: report.phase3EndDate,
        insurerName: report.insurerName
      },
      analysis,
      tier1,
      tier2,
      tier3,
      stateInfo,
      psychrometricAssessment,
      scopeAreas,
      equipmentSelection,
      standardsContext,
      regulatoryContext,  // NEW: Add regulatory context if available
      businessInfo: {
        businessName: user.businessName,
        businessAddress: user.businessAddress,
        businessLogo: user.businessLogo,
        businessABN: user.businessABN,
        businessPhone: user.businessPhone,
        businessEmail: user.businessEmail
      }
    }

    // Generate PDF
    const pdfBytes = await generateForensicReportPDF(reportData)

    // Return PDF as response
    const filename = `Forensic-Report-${report.claimReferenceNumber || report.reportNumber || reportId}.pdf`
    
    return new NextResponse(pdfBytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': pdfBytes.length.toString()
      }
    })
  } catch (error: any) {
    console.error('Error generating forensic PDF:', error)
    return NextResponse.json(
      { error: 'Failed to generate forensic PDF', details: error.message },
      { status: 500 }
    )
  }
}

