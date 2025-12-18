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
- waterClass: "Class 1", "Class 2", "Class 3", or "Class 4" (integer: 1, 2, 3, or 4)
- sourceOfWater: Source of water (e.g., "Burst pipe", "Storm damage", "Appliance failure")
- affectedArea: Affected area in square metres (float)

**Equipment & Tools Selection - Psychrometric Assessment:**
Look for psychrometric readings, environmental conditions, or drying assessment data:
- psychrometricWaterClass: Water loss class (integer: 1, 2, 3, or 4). Extract from mentions like "Class 1", "Class 2", "Class 3", "Class 4", or "Water Class 2". If not mentioned, use the waterClass value from Water Damage Details.
- psychrometricTemperature: Temperature in Celsius (integer). Look for phrases like "temperature", "ambient temp", "room temp", "25°C", "25 degrees". Extract the numeric value.
- psychrometricHumidity: Humidity percentage (integer, 0-100). Look for "humidity", "RH", "relative humidity", "60% RH", "60% humidity". Extract the numeric percentage value.
- psychrometricSystemType: "open" or "closed" (ventilation system type). Look for "open system", "closed system", "ventilated", "sealed". Default to "closed" if not mentioned.

**Equipment & Tools Selection - Scope Areas (Room Management):**
CRITICAL: Extract ALL rooms/areas mentioned in the document with their dimensions. Look for:
- Room names: Kitchen, Bedroom, Lounge, Dining Room, Bathroom, Hallway, etc.
- Dimensions: Look for measurements like "4.5m x 3.5m", "length 5m width 3.6m", "4.5 × 3.5", room dimensions, floor area measurements
- Height: Usually 2.7m for standard rooms, but extract if mentioned (look for "ceiling height", "room height")
- Wet percentage: Look for "85% wet", "90% affected", "partially wet", "fully saturated", "40% of floor area"

For each room/area found, create an object with:
  - name: Room/area name (e.g., "Kitchen", "Master Bedroom", "Lounge Room")
  - length: Length in metres (float, extract from dimensions)
  - width: Width in metres (float, extract from dimensions)
  - height: Height in metres (float, default to 2.7 if not mentioned)
  - wetPercentage: Percentage of area that is wet (integer, 0-100. If not specified, estimate based on descriptions like "fully affected" = 100%, "partially" = 50%, "minor" = 25%)

Example format: [{"name": "Kitchen", "length": 4.5, "width": 3.5, "height": 2.7, "wetPercentage": 85}, {"name": "Dining Room", "length": 5.0, "width": 3.6, "height": 2.7, "wetPercentage": 90}]

**Equipment & Tools Selection - Equipment:**
- equipmentMentioned: Array of equipment types mentioned in document. Look for: "LGR dehumidifier", "desiccant", "air mover", "air mover fan", "dehumidifier", "drying equipment", "extraction equipment". Extract all equipment mentions.
- estimatedDryingDuration: Estimated drying duration in days (integer). Look for "4 days", "drying period", "estimated duration", "drying time". Extract the number of days.

**Additional Information:**
- fullText: All text content from the PDF document

**CRITICAL EXTRACTION REQUIREMENTS:**
- Extract dates in YYYY-MM-DD format
- Use null for missing optional fields, empty string "" for missing required text fields
- For boolean fields, use true/false or null
- For numeric fields, extract the number or use null
- Analyze the document THOROUGHLY - examine every section, table, and paragraph
- Look for dates, measurements, test results, phase information, room dimensions, equipment mentions
- If dates are mentioned in text format, convert to YYYY-MM-DD
- For scope areas: Extract EVERY room/area mentioned, even if dimensions are approximate. Don't miss any affected areas.
- For psychrometric data: Look in tables, assessment sections, environmental readings, and technical data sections
- For equipment: Extract ALL equipment mentions, even if just mentioned in passing
- DO NOT skip any valuable information - if you see it in the document, extract it
- If measurements are in different units, convert to metres (e.g., feet to metres: multiply by 0.3048)

**Return ONLY a valid JSON object with ALL extracted fields. Ensure no valuable records are missed.**`

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
        phase3EndDate: parsedData.phase3EndDate || '',
        
        // Equipment & Tools Selection - Psychrometric Assessment
        psychrometricWaterClass: parsedData.psychrometricWaterClass || parsedData.waterClass || 2,
        psychrometricTemperature: parsedData.psychrometricTemperature || null,
        psychrometricHumidity: parsedData.psychrometricHumidity || null,
        psychrometricSystemType: parsedData.psychrometricSystemType || 'closed',
        
        // Equipment & Tools Selection - Scope Areas
        scopeAreas: parsedData.scopeAreas || [],
        
        // Equipment & Tools Selection - Equipment
        equipmentMentioned: parsedData.equipmentMentioned || [],
        estimatedDryingDuration: parsedData.estimatedDryingDuration || null
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