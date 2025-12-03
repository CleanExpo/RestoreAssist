import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import Anthropic from '@anthropic-ai/sdk'
import { tryClaudeModels } from '@/lib/anthropic-models'

// POST - Analyze technician report using AI
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

    const { reportId } = await request.json()

    if (!reportId) {
      return NextResponse.json(
        { error: 'Report ID is required' },
        { status: 400 }
      )
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

    if (!report.technicianFieldReport) {
      return NextResponse.json(
        { error: 'Technician field report is required for analysis' },
        { status: 400 }
      )
    }

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

    // Create Anthropic client with user's API key
    const anthropic = new Anthropic({
      apiKey: integration.apiKey
    })

    // Build analysis prompt
    const prompt = `You are an expert water damage restoration specialist analyzing a technician's field report. 

Analyze the following technician field report and extract structured information:

TECHNICIAN FIELD REPORT:
${report.technicianFieldReport}

PROPERTY INFORMATION:
- Address: ${report.propertyAddress}
- Postcode: ${report.propertyPostcode || 'Not provided'}
- Incident Date: ${report.incidentDate ? new Date(report.incidentDate).toLocaleDateString('en-AU') : 'Not provided'}
- Technician Attendance Date: ${report.technicianAttendanceDate ? new Date(report.technicianAttendanceDate).toLocaleDateString('en-AU') : 'Not provided'}

Your task is to analyze this report and extract the following information in JSON format:

{
  "affectedAreas": ["List of rooms/areas mentioned (e.g., Kitchen, Master Bedroom, Hallway)"],
  "waterSource": "Identified water source (e.g., burst pipe, toilet overflow, roof leak, etc.)",
  "waterCategory": "Category 1, 2, or 3 based on water source",
  "affectedMaterials": ["List of materials mentioned (e.g., carpet, timber, plasterboard, yellow tongue, etc.)"],
  "equipmentDeployed": ["List of equipment mentioned (e.g., air movers, dehumidifiers, AFD units, etc.)"],
  "moistureReadings": ["List any moisture readings mentioned with locations"],
  "hazardsIdentified": ["List any hazards mentioned (e.g., mould, asbestos, electrical, etc.)"],
  "observations": "Key observations from the technician's report",
  "complexityLevel": "simple" | "moderate" | "complex" (based on number of areas, materials, hazards)
}

Be thorough and extract all relevant information. If information is not explicitly stated, use "Not specified" or empty arrays as appropriate.`

    // Call Anthropic API with fallback models
    const systemPrompt = `You are an expert water damage restoration specialist. Analyze technician field reports and extract structured information accurately. Always return valid JSON.`

    // Use the utility function to try multiple models with fallback
    const response = await tryClaudeModels(
      anthropic,
      {
        system: systemPrompt,
        max_tokens: 2000,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      }
    )

    let analysisText = ''
    if (response.content && response.content.length > 0 && response.content[0].type === 'text') {
      analysisText = response.content[0].text
    } else {
      console.error('Unexpected response format:', response)
      throw new Error('Unexpected response format from AI')
    }

    // Try to parse JSON from the response
    let analysis: any = {}
    try {
      // Extract JSON from markdown code blocks if present
      const jsonMatch = analysisText.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || 
                       analysisText.match(/\{[\s\S]*\}/)
      const jsonText = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : analysisText
      analysis = JSON.parse(jsonText)
    } catch (parseError) {
      // If JSON parsing fails, create a structured response from the text
      console.error('Failed to parse JSON from AI response:', parseError)
      analysis = {
        affectedAreas: [],
        waterSource: 'Not specified',
        waterCategory: 'Not specified',
        affectedMaterials: [],
        equipmentDeployed: [],
        moistureReadings: [],
        hazardsIdentified: [],
        observations: analysisText,
        complexityLevel: 'moderate'
      }
    }

    // Save analysis to report
    await prisma.report.update({
      where: { id: reportId },
      data: {
        technicianReportAnalysis: JSON.stringify(analysis)
      }
    })

    return NextResponse.json({ 
      analysis,
      message: 'Technician report analyzed successfully'
    })
  } catch (error) {
    console.error('Error analyzing technician report:', error)
    return NextResponse.json(
      { error: 'Failed to analyze technician report' },
      { status: 500 }
    )
  }
}

