import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import Anthropic from '@anthropic-ai/sdk'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user || !(session.user as any).id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const anthropicApiKey = process.env.ANTHROPIC_API_KEY
    if (!anthropicApiKey) {
      return NextResponse.json(
        { error: 'ANTHROPIC_API_KEY is not configured' },
        { status: 500 }
      )
    }

    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    if (file.type !== 'application/pdf') {
      return NextResponse.json({ error: 'File must be a PDF' }, { status: 400 })
    }

    const arrayBuffer = await file.arrayBuffer()
    const base64Data = Buffer.from(arrayBuffer).toString('base64')

    const anthropic = new Anthropic({ apiKey: anthropicApiKey })

    const systemPrompt = `You are a professional water damage restoration report analysis assistant. Extract ALL structured information from the PDF document.

Extract the following fields if available in the document:

**Basic Information:**
- clientName: Full name of the client/property owner
- clientContactDetails: Phone number, email, contact information
- propertyAddress: Full property address including street, suburb, state
- propertyPostcode: Postcode (4 digits, Australian format)
- claimReferenceNumber: Claim reference, job number, or report number
- incidentDate: Date of water damage incident (format: YYYY-MM-DD)
- technicianAttendanceDate: Date technician attended site (format: YYYY-MM-DD)
- technicianName: Name of technician/inspector who attended
- technicianFieldReport: Complete technician field report text/notes

**Property Intelligence:**
- buildingAge: Year the building was constructed (integer, e.g., 1995)
- structureType: Building structure type (e.g., "Brick Veneer", "Slab on Ground", "Timber Frame", "Concrete")
- accessNotes: Access notes (e.g., "Level driveway", "Truck mount access", "Stairs only")

**Hazard Profile:**
- insurerName: Insurance company name
- methamphetamineScreen: "POSITIVE" or "NEGATIVE" (if mentioned)
- methamphetamineTestCount: Number of meth tests performed (integer, if mentioned)
- biologicalMouldDetected: true or false (if mould/biological growth mentioned)
- biologicalMouldCategory: Mould category if mentioned (e.g., "CAT 1", "CAT 2", "CAT 3")

**Timeline Estimation:**
- phase1StartDate: Phase 1 (Make-safe) start date (format: YYYY-MM-DD)
- phase1EndDate: Phase 1 (Make-safe) end date (format: YYYY-MM-DD)
- phase2StartDate: Phase 2 (Remediation/Drying) start date (format: YYYY-MM-DD)
- phase2EndDate: Phase 2 (Remediation/Drying) end date (format: YYYY-MM-DD)
- phase3StartDate: Phase 3 (Verification/Handover) start date (format: YYYY-MM-DD)
- phase3EndDate: Phase 3 (Verification/Handover) end date (format: YYYY-MM-DD)

**Water Damage Details:**
- waterCategory: "Category 1", "Category 2", or "Category 3"
- waterClass: "Class 1", "Class 2", "Class 3", or "Class 4"
- sourceOfWater: Source of water (e.g., "Burst pipe", "Storm damage", "Appliance failure")
- affectedArea: Affected area in square metres (float)

**Additional Information:**
- fullText: All text content from the PDF document

**Important:**
- Extract dates in YYYY-MM-DD format
- Use null for missing optional fields, empty string "" for missing required text fields
- For boolean fields, use true/false or null
- For numeric fields, extract the number or use null
- Analyze the document thoroughly - look for dates, measurements, test results, and phase information
- If dates are mentioned in text format, convert to YYYY-MM-DD

Return ONLY a valid JSON object with all extracted fields.`

    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'document',
                source: {
                  type: 'base64',
                  media_type: 'application/pdf',
                  data: base64Data
                }
              },
              {
                type: 'text',
                text: 'Extract all the structured data from this PDF document and return it as JSON.'
              }
            ]
          }
        ]
      })

      if (!response.content || response.content.length === 0) {
        return NextResponse.json(
          { error: 'Claude returned empty response' },
          { status: 500 }
        )
      }

      const content = response.content[0]
      if (content.type !== 'text') {
        return NextResponse.json(
          { error: 'Unexpected response format from Claude' },
          { status: 500 }
        )
      }

      let parsedData: any = {}
      try {
        let jsonText = content.text.trim()
        jsonText = jsonText.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '')
        
        const jsonMatch = jsonText.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          parsedData = JSON.parse(jsonMatch[0])
        } else {
          throw new Error('No JSON found in response')
        }
      } catch (parseError) {
        return NextResponse.json(
          { error: 'Failed to parse extracted data. Please try again.' },
          { status: 500 }
        )
      }

      // Extract and format all fields
      const extractedData: any = {
        // Basic Information
        clientName: parsedData.clientName || '',
        clientContactDetails: parsedData.clientContactDetails || '',
        propertyAddress: parsedData.propertyAddress || '',
        propertyPostcode: parsedData.propertyPostcode || '',
        claimReferenceNumber: parsedData.claimReferenceNumber || '',
        incidentDate: parsedData.incidentDate || '',
        technicianAttendanceDate: parsedData.technicianAttendanceDate || '',
        technicianName: parsedData.technicianName || '',
        technicianFieldReport: parsedData.technicianFieldReport || parsedData.fullText || '',
        
        // Property Intelligence
        buildingAge: parsedData.buildingAge ? String(parsedData.buildingAge) : '',
        structureType: parsedData.structureType || '',
        accessNotes: parsedData.accessNotes || '',
        
        // Hazard Profile
        insurerName: parsedData.insurerName || '',
        methamphetamineScreen: parsedData.methamphetamineScreen || 'NEGATIVE',
        methamphetamineTestCount: parsedData.methamphetamineTestCount ? String(parsedData.methamphetamineTestCount) : '',
        biologicalMouldDetected: parsedData.biologicalMouldDetected === true || parsedData.biologicalMouldDetected === 'true',
        biologicalMouldCategory: parsedData.biologicalMouldCategory || '',
        
        // Timeline Estimation
        phase1StartDate: parsedData.phase1StartDate || '',
        phase1EndDate: parsedData.phase1EndDate || '',
        phase2StartDate: parsedData.phase2StartDate || '',
        phase2EndDate: parsedData.phase2EndDate || '',
        phase3StartDate: parsedData.phase3StartDate || '',
        phase3EndDate: parsedData.phase3EndDate || ''
      }

      return NextResponse.json({
        success: true,
        extractedText: parsedData.fullText || '',
        parsedData: extractedData,
        message: 'PDF parsed successfully. All available data extracted. Please review and complete the form.'
      })

    } catch (claudeError: any) {
      return NextResponse.json(
        { error: `Claude API error: ${claudeError.message}` },
        { status: 500 }
      )
    }

  } catch (error: any) {
    return NextResponse.json(
      { error: `Failed to process PDF: ${error.message}` },
      { status: 500 }
    )
  }
}