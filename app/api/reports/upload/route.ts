import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import Anthropic from '@anthropic-ai/sdk'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user || !(session.user as any).id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = (session.user as any).id

    // Get user's connected integration (Anthropic, OpenAI, or Gemini)
    const integration = await prisma.integration.findFirst({
      where: {
        userId,
        status: 'CONNECTED',
        apiKey: { not: null },
        OR: [
          { name: { contains: 'Anthropic' } },
          { name: { contains: 'OpenAI' } },
          { name: { contains: 'Gemini' } },
          { name: { contains: 'Claude' } },
          { name: { contains: 'GPT' } }
        ]
      },
      orderBy: {
        createdAt: 'desc' // Use most recently connected
      }
    })

    if (!integration || !integration.apiKey) {
      return NextResponse.json(
        { 
          error: 'No connected API integration found',
          details: 'Please connect an Anthropic, OpenAI, or other AI API integration in the Integrations page.'
        },
        { status: 400 }
      )
    }

    const anthropicApiKey = integration.apiKey

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

    const systemPrompt = `You are a professional water damage restoration report analysis assistant. Your task is to analyze ANY water damage restoration report PDF, regardless of its format, structure, or origin (whether from this system or any other restoration company).

**CRITICAL INSTRUCTIONS:**
- Analyze the document THOROUGHLY - examine every section, table, paragraph, header, footer, and note
- Extract information even if it's in different formats, layouts, or terminology than expected
- Look for information in various locations: headers, body text, tables, lists, sidebars, appendices
- Handle reports from ANY restoration company or system - don't assume a specific format
- If information is missing or unclear, use null or empty string appropriately
- Be flexible with date formats, measurements, and terminology variations
- Extract ALL available data - don't skip anything valuable

Extract ALL structured information from the PDF document.

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

**Additional Contact Information - Builder/Developer:**
- builderDeveloperCompanyName: Builder/Developer company name (if mentioned)
- builderDeveloperContact: Builder/Developer contact person name (if mentioned)
- builderDeveloperAddress: Builder/Developer address (if mentioned)
- builderDeveloperPhone: Builder/Developer phone number (if mentioned)

**Additional Contact Information - Owner/Management:**
- ownerManagementContactName: Owner/Management contact name (if mentioned)
- ownerManagementPhone: Owner/Management phone number (if mentioned)
- ownerManagementEmail: Owner/Management email address (if mentioned)

**Previous Maintenance & Repair History:**
- lastInspectionDate: Date of last inspection (format: YYYY-MM-DD, if mentioned)
- buildingChangedSinceLastInspection: "Yes" or "No" or description (if mentioned)
- structureChangesSinceLastInspection: Description of structural changes (if mentioned)
- previousLeakage: "Yes" or "No" or description (if mentioned)
- emergencyRepairPerformed: "Yes" or "No" or description (if mentioned)

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

**Equipment & Tools Selection - Equipment Deployment:**
CRITICAL: Extract ALL equipment deployment data from tables or sections showing "Equipment Deployment", "Equipment", "Equipment List", or similar headings. Look for tables with columns like:
- Equipment name/type (e.g., "55L/Day", "800 CFM", "LGR Dehumidifier", "Air Mover", "Desiccant")
- Quantity (number of units)
- Daily Rate (price per day, e.g., "$45.00", "$25.00")
- Duration (number of days, e.g., "4 days", "5 days")
- Total Cost (total cost for that equipment, e.g., "$360.00", "$400.00")

Also look for "Total Equipment Cost" or similar summary lines.

For each equipment item found in the deployment table/section, create an object with:
  - equipmentName: Name/type of equipment (e.g., "55L/Day", "800 CFM", "LGR Dehumidifier", "Air Mover")
  - quantity: Number of units (integer, extract from "Qty", "Quantity", or the number before the equipment name)
  - dailyRate: Daily rental rate in dollars (float, extract from "Daily Rate" column or price per day)
  - duration: Duration in days (integer, extract from "Duration" column or "X days")
  - totalCost: Total cost for this equipment (float, extract from "Total Cost" column or calculate: quantity × dailyRate × duration)

Example format: [
  {"equipmentName": "55L/Day", "quantity": 2, "dailyRate": 45.00, "duration": 4, "totalCost": 360.00},
  {"equipmentName": "800 CFM", "quantity": 4, "dailyRate": 25.00, "duration": 4, "totalCost": 400.00}
]

- equipmentMentioned: Array of equipment types mentioned in document (for reference, if deployment table not found). Look for: "LGR dehumidifier", "desiccant", "air mover", "air mover fan", "dehumidifier", "drying equipment", "extraction equipment". Extract all equipment mentions.
- estimatedDryingDuration: Estimated drying duration in days (integer). Look for "4 days", "drying period", "estimated duration", "drying time". Extract the number of days. If equipment deployment table has duration, use that.
- totalEquipmentCost: Total equipment cost from the report (float). Look for "Total Equipment Cost", "Total Cost", or sum of all equipment totalCost values.

**NIR Inspection Data - Moisture Readings:**
CRITICAL: Extract ALL moisture readings mentioned in the document. Look for:
- Tables with moisture readings, moisture meters, moisture levels, moisture percentages
- Mentions like "Kitchen wall: 45%", "Bedroom floor: 32% moisture", "moisture reading: 28%"
- Surface types: "Drywall", "Wood", "Carpet", "Concrete", "Tile", "Vinyl", "Hardwood", "Particle Board", "Plaster", "Other"
- Depth: "Surface" or "Subsurface" (look for "surface moisture", "subsurface", "deep moisture", "penetrating")

For each moisture reading found, create an object with:
  - location: Room/area name where reading was taken (e.g., "Kitchen", "Master Bedroom", "Lounge Room")
  - surfaceType: Type of surface (must be one of: "Drywall", "Wood", "Carpet", "Concrete", "Tile", "Vinyl", "Hardwood", "Particle Board", "Plaster", "Other")
  - moistureLevel: Moisture percentage (float, 0-100). Extract the numeric value.
  - depth: "Surface" or "Subsurface" (default to "Surface" if not specified)

Example format: [{"location": "Kitchen", "surfaceType": "Drywall", "moistureLevel": 45.5, "depth": "Surface"}, {"location": "Master Bedroom", "surfaceType": "Carpet", "moistureLevel": 32.0, "depth": "Subsurface"}]

**NIR Inspection Data - Affected Areas:**
CRITICAL: Extract ALL affected areas mentioned in the document. Look for:
- Room/zone names with water damage, affected areas, wet areas
- Square footage or area measurements (convert to square feet if needed: 1 sq m = 10.764 sq ft)
- Water source: "Clean Water", "Grey Water", or "Black Water" (look for "clean", "grey", "gray", "black", "contaminated", "sewage")
- Time since loss: Look for "hours since loss", "time since incident", "elapsed time", "hours ago"

For each affected area found, create an object with:
  - roomZoneId: Room/zone name (e.g., "Kitchen", "Master Bedroom", "Lounge Room")
  - affectedSquareFootage: Affected area in square feet (float). Extract from measurements or estimates.
  - waterSource: "Clean Water", "Grey Water", or "Black Water" (default to "Clean Water" if not specified)
  - timeSinceLoss: Hours since water loss occurred (float). Extract numeric value.

Example format: [{"roomZoneId": "Kitchen", "affectedSquareFootage": 150.5, "waterSource": "Clean Water", "timeSinceLoss": 24.0}, {"roomZoneId": "Master Bedroom", "affectedSquareFootage": 200.0, "waterSource": "Grey Water", "timeSinceLoss": 48.0}]

**NIR Inspection Data - Scope Items:**
Extract scope of work items mentioned in the document. Match to these IDs:
- "remove_carpet": Look for "remove carpet", "carpet removal", "carpet extraction"
- "sanitize_materials": Look for "sanitize", "sanitization", "disinfect", "antimicrobial"
- "install_dehumidification": Look for "dehumidifier", "dehumidification", "drying equipment"
- "install_air_movers": Look for "air mover", "air mover fan", "air circulation", "fans"
- "extract_standing_water": Look for "extract water", "water extraction", "standing water", "remove water"
- "demolish_drywall": Look for "demolish", "remove drywall", "cut out", "remove wall"
- "apply_antimicrobial": Look for "antimicrobial", "antimicrobial treatment", "biocide"
- "dry_out_structure": Look for "dry out", "drying", "structural drying"
- "containment_setup": Look for "containment", "barrier", "isolation", "seal off"
- "ppe_required": Look for "PPE", "personal protective equipment", "safety equipment", "protective gear"

Return an array of scope item IDs that match items mentioned in the document.
Example format: ["remove_carpet", "install_dehumidification", "install_air_movers", "extract_standing_water"]

**Additional Information:**
- fullText: All text content from the PDF document

**CRITICAL EXTRACTION REQUIREMENTS:**
- Extract dates in YYYY-MM-DD format (handle various date formats: DD/MM/YYYY, MM/DD/YYYY, DD-MM-YYYY, etc.)
- Use null for missing optional fields, empty string "" for missing required text fields
- For boolean fields, use true/false or null
- For numeric fields, extract the number or use null
- Analyze the document THOROUGHLY - examine every section, table, paragraph, header, footer, and note
- Look for dates, measurements, test results, phase information, room dimensions, equipment mentions in ANY location
- If dates are mentioned in text format, convert to YYYY-MM-DD (be flexible with date parsing)
- For scope areas: Extract EVERY room/area mentioned, even if dimensions are approximate. Don't miss any affected areas.
- For psychrometric data: Look in tables, assessment sections, environmental readings, technical data sections, or anywhere environmental conditions are mentioned
- For equipment: Extract ALL equipment mentions, even if just mentioned in passing or in different terminology
- DO NOT skip any valuable information - if you see it in the document, extract it
- If measurements are in different units, convert to metres (e.g., feet to metres: multiply by 0.3048, inches to metres: multiply by 0.0254)
- Handle reports from ANY system - be flexible with terminology, formats, and layouts
- If a field uses different terminology (e.g., "customer" instead of "client", "job site" instead of "property"), extract it anyway
- Look for information in unexpected places - some reports have data in headers, footers, or sidebars

**Return ONLY a valid JSON object with ALL extracted fields. Ensure no valuable records are missed.**
**If the report format is unusual or different, still extract as much information as possible.**`

    console.log(`[PDF Upload] Starting PDF analysis for user ${userId} using integration: ${integration.name}`)
    
    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8192, // Increased for larger/complex reports
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
                text: 'Extract all the structured data from this PDF document and return it as JSON. Analyze the document thoroughly, regardless of its format or origin. Extract all available information.'
              }
            ]
          }
        ]
      })
      
      console.log(`[PDF Upload] Claude API response received`)

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
        
        // Remove markdown code blocks if present
        jsonText = jsonText.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/g, '')
        
        // Try to find JSON object in the response
        const jsonMatch = jsonText.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          try {
            parsedData = JSON.parse(jsonMatch[0])
          } catch (parseError: any) {
            console.error('JSON parse error:', parseError.message)
            console.error('JSON text snippet:', jsonText.substring(0, 500))
            
            // Try to fix common JSON issues
            let fixedJson = jsonMatch[0]
            // Fix trailing commas
            fixedJson = fixedJson.replace(/,(\s*[}\]])/g, '$1')
            // Fix single quotes to double quotes
            fixedJson = fixedJson.replace(/'/g, '"')
            
            try {
              parsedData = JSON.parse(fixedJson)
            } catch (retryError) {
              throw new Error(`Failed to parse JSON: ${parseError.message}`)
            }
          }
        } else {
          // If no JSON object found, try to extract as much as possible
          console.warn('No JSON object found in Claude response, attempting to extract data')
          throw new Error('No JSON found in response. The AI may have returned an unexpected format.')
        }
      } catch (parseError: any) {
        console.error('Error parsing extracted data:', parseError)
        return NextResponse.json(
          { 
            error: 'Failed to parse extracted data from PDF.',
            details: parseError.message || 'The AI response format was unexpected. Please try uploading the PDF again.',
            suggestion: 'If this persists, the PDF format may be too complex. Try a simpler report or contact support.'
          },
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
        
        // Additional Contact Information - Builder/Developer
        builderDeveloperCompanyName: parsedData.builderDeveloperCompanyName || '',
        builderDeveloperContact: parsedData.builderDeveloperContact || '',
        builderDeveloperAddress: parsedData.builderDeveloperAddress || '',
        builderDeveloperPhone: parsedData.builderDeveloperPhone || '',
        
        // Additional Contact Information - Owner/Management
        ownerManagementContactName: parsedData.ownerManagementContactName || '',
        ownerManagementPhone: parsedData.ownerManagementPhone || '',
        ownerManagementEmail: parsedData.ownerManagementEmail || '',
        
        // Previous Maintenance & Repair History
        lastInspectionDate: parsedData.lastInspectionDate || '',
        buildingChangedSinceLastInspection: parsedData.buildingChangedSinceLastInspection || '',
        structureChangesSinceLastInspection: parsedData.structureChangesSinceLastInspection || '',
        previousLeakage: parsedData.previousLeakage || '',
        emergencyRepairPerformed: parsedData.emergencyRepairPerformed || '',
        
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
        
        // Equipment & Tools Selection - Equipment Deployment
        equipmentDeployment: Array.isArray(parsedData.equipmentDeployment) ? parsedData.equipmentDeployment.map((eq: any) => ({
          equipmentName: eq.equipmentName || eq.name || '',
          quantity: typeof eq.quantity === 'number' ? eq.quantity : parseInt(eq.quantity) || 0,
          dailyRate: typeof eq.dailyRate === 'number' ? eq.dailyRate : parseFloat(eq.dailyRate) || 0,
          duration: typeof eq.duration === 'number' ? eq.duration : parseInt(eq.duration) || 0,
          totalCost: typeof eq.totalCost === 'number' ? eq.totalCost : parseFloat(eq.totalCost) || 0
        })) : [],
        equipmentMentioned: parsedData.equipmentMentioned || [],
        estimatedDryingDuration: parsedData.estimatedDryingDuration || (parsedData.equipmentDeployment && Array.isArray(parsedData.equipmentDeployment) && parsedData.equipmentDeployment.length > 0 
          ? Math.max(...parsedData.equipmentDeployment.map((eq: any) => eq.duration || 0))
          : null),
        totalEquipmentCost: parsedData.totalEquipmentCost || (parsedData.equipmentDeployment && Array.isArray(parsedData.equipmentDeployment) && parsedData.equipmentDeployment.length > 0
          ? parsedData.equipmentDeployment.reduce((sum: number, eq: any) => sum + (typeof eq.totalCost === 'number' ? eq.totalCost : parseFloat(eq.totalCost) || 0), 0)
          : null),
        
        // NIR Inspection Data
        nirData: {
          moistureReadings: Array.isArray(parsedData.moistureReadings) ? parsedData.moistureReadings.map((r: any) => ({
            location: r.location || '',
            surfaceType: r.surfaceType || 'Drywall',
            moistureLevel: typeof r.moistureLevel === 'number' ? r.moistureLevel : parseFloat(r.moistureLevel) || 0,
            depth: r.depth === 'Subsurface' ? 'Subsurface' : 'Surface'
          })) : [],
          affectedAreas: Array.isArray(parsedData.affectedAreas) ? parsedData.affectedAreas.map((a: any) => ({
            roomZoneId: a.roomZoneId || '',
            affectedSquareFootage: typeof a.affectedSquareFootage === 'number' ? a.affectedSquareFootage : parseFloat(a.affectedSquareFootage) || 0,
            waterSource: a.waterSource || 'Clean Water',
            timeSinceLoss: typeof a.timeSinceLoss === 'number' ? a.timeSinceLoss : parseFloat(a.timeSinceLoss) || 0
          })) : [],
          scopeItems: Array.isArray(parsedData.scopeItems) ? parsedData.scopeItems : []
        }
      }

      console.log(`[PDF Upload] Successfully extracted data:`, {
        hasClientName: !!extractedData.clientName,
        hasPropertyAddress: !!extractedData.propertyAddress,
        moistureReadingsCount: extractedData.nirData?.moistureReadings?.length || 0,
        affectedAreasCount: extractedData.nirData?.affectedAreas?.length || 0,
        scopeAreasCount: extractedData.scopeAreas?.length || 0,
        scopeItemsCount: extractedData.nirData?.scopeItems?.length || 0,
        // Equipment Deployment
        equipmentDeploymentCount: extractedData.equipmentDeployment?.length || 0,
        equipmentDeployment: extractedData.equipmentDeployment || [],
        totalEquipmentCost: extractedData.totalEquipmentCost,
        estimatedDryingDuration: extractedData.estimatedDryingDuration,
        // Additional Contact Information
        hasBuilderDeveloperCompanyName: !!extractedData.builderDeveloperCompanyName,
        hasBuilderDeveloperContact: !!extractedData.builderDeveloperContact,
        hasBuilderDeveloperAddress: !!extractedData.builderDeveloperAddress,
        hasBuilderDeveloperPhone: !!extractedData.builderDeveloperPhone,
        hasOwnerManagementContactName: !!extractedData.ownerManagementContactName,
        hasOwnerManagementPhone: !!extractedData.ownerManagementPhone,
        hasOwnerManagementEmail: !!extractedData.ownerManagementEmail,
        // Previous Maintenance & Repair History
        hasLastInspectionDate: !!extractedData.lastInspectionDate,
        hasBuildingChangedSinceLastInspection: !!extractedData.buildingChangedSinceLastInspection,
        hasStructureChangesSinceLastInspection: !!extractedData.structureChangesSinceLastInspection,
        hasPreviousLeakage: !!extractedData.previousLeakage,
        hasEmergencyRepairPerformed: !!extractedData.emergencyRepairPerformed
      })

      return NextResponse.json({
        success: true,
        extractedText: parsedData.fullText || '',
        parsedData: extractedData,
        message: 'PDF parsed successfully. All available data extracted. Please review and complete the form.'
      })

    } catch (claudeError: any) {
      console.error('Claude API error during PDF upload:', claudeError)
      
      // Provide more helpful error messages
      if (claudeError.message?.includes('rate_limit') || claudeError.message?.includes('429')) {
        return NextResponse.json(
          { error: 'API rate limit exceeded. Please try again in a moment.' },
          { status: 429 }
        )
      }
      
      if (claudeError.message?.includes('invalid_api_key') || claudeError.message?.includes('401')) {
        return NextResponse.json(
          { error: 'Invalid API key. Please check your integration settings.' },
          { status: 401 }
        )
      }
      
      if (claudeError.message?.includes('file') || claudeError.message?.includes('document')) {
        return NextResponse.json(
          { error: 'Failed to process PDF document. The file may be corrupted or in an unsupported format.' },
          { status: 400 }
        )
      }
      
      return NextResponse.json(
        { 
          error: `Failed to analyze PDF: ${claudeError.message || 'Unknown error'}`,
          details: 'Please ensure the PDF is a valid water damage restoration report and try again.'
        },
        { status: 500 }
      )
    }

  } catch (error: any) {
    console.error('Error in PDF upload route:', error)
    return NextResponse.json(
      { 
        error: `Failed to process PDF: ${error.message || 'Unknown error'}`,
        details: 'Please check the file format and try again.'
      },
      { status: 500 }
    )
  }
}