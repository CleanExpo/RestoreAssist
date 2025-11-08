import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isAdmin } from '@/lib/admin'
import Anthropic from '@anthropic-ai/sdk'

// POST: Generate/regenerate full inspection report
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const userId = session.user.id
    const reportId = params.id

    // Verify ownership and get report
    const report = await prisma.report.findFirst({
      where: {
        id: reportId,
        userId
      }
    })

    if (!report) {
      return NextResponse.json(
        { success: false, error: 'Inspection not found' },
        { status: 404 }
      )
    }

    // Get user with API key
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { anthropicApiKey: true, role: true }
    })

    // Check for API key (admin bypass)
    let apiKey = process.env.ANTHROPIC_API_KEY || ''
    if (!isAdmin(user?.role)) {
      if (!user?.anthropicApiKey) {
        return NextResponse.json(
          { success: false, error: 'API key not configured. Please add your Anthropic API key in settings.' },
          { status: 400 }
        )
      }
      apiKey = user.anthropicApiKey
    }

    // Generate detailed report using Anthropic
    const anthropic = new Anthropic({ apiKey })

    const prompt = generateReportPrompt(report)

    const message = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 4000,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    })

    const detailedReport = message.content[0].type === 'text'
      ? message.content[0].text
      : ''

    // Update report with generated content
    const updatedReport = await prisma.report.update({
      where: { id: reportId },
      data: {
        detailedReport,
        status: 'PENDING',
        updatedAt: new Date()
      }
    })

    // Audit log would go here (simplified for now)

    return NextResponse.json({
      success: true,
      data: {
        report: updatedReport,
        detailedReport
      }
    })
  } catch (error: any) {
    console.error('Error generating report:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to generate report' },
      { status: 500 }
    )
  }
}

function generateReportPrompt(report: any): string {
  return `You are an IICRC-certified restoration professional creating a comprehensive inspection report.

Generate a detailed, professional inspection report based on the following information:

**Property Information:**
- Client Name: ${report.clientName}
- Property Address: ${report.propertyAddress}
- Report Number: ${report.reportNumber}
- Inspection Date: ${report.inspectionDate ? new Date(report.inspectionDate).toLocaleDateString() : 'N/A'}

**Hazard Information:**
- Hazard Type: ${report.hazardType}
- Insurance Type: ${report.insuranceType}
${report.description ? `- Description: ${report.description}` : ''}

**Assessment Details:**
${report.waterCategory ? `- Water Category: ${report.waterCategory}` : ''}
${report.waterClass ? `- Water Class: ${report.waterClass}` : ''}
${report.sourceOfWater ? `- Source of Water: ${report.sourceOfWater}` : ''}
${report.affectedArea ? `- Affected Area: ${report.affectedArea} sqm` : ''}
${report.structuralDamage ? `- Structural Damage: ${report.structuralDamage}` : ''}
${report.contentsDamage ? `- Contents Damage: ${report.contentsDamage}` : ''}
${report.hvacAffected ? `- HVAC Affected: Yes` : ''}
${report.safetyHazards ? `- Safety Hazards: ${report.safetyHazards}` : ''}
${report.electricalHazards ? `- Electrical Hazards: ${report.electricalHazards}` : ''}
${report.microbialGrowth ? `- Microbial Growth: ${report.microbialGrowth}` : ''}

**Instructions:**
Create a comprehensive inspection report following IICRC S500 standards (for water damage) or appropriate standards for the hazard type. Include:

1. **Executive Summary**: Brief overview of findings
2. **Site Assessment**: Detailed description of property condition
3. **Scope of Damage**: Comprehensive damage assessment
4. **Recommendations**: Restoration steps and priorities
5. **Equipment Required**: List necessary equipment
6. **Safety Considerations**: Safety protocols and hazards
7. **Estimated Timeline**: Restoration duration estimate
8. **Compliance Notes**: Relevant standards and regulations

Format the report professionally with clear sections and proper technical terminology.`
}
