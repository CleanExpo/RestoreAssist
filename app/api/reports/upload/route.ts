import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import Anthropic from '@anthropic-ai/sdk'
import { createCachedSystemPrompt, extractCacheMetrics, logCacheMetrics } from '@/lib/anthropic/features/prompt-cache'

// Configuration constants
const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB
const REQUEST_TIMEOUT = 180000 // 180 seconds (3 minutes) for large/complex PDFs
const MAX_RETRIES = 3
const INITIAL_RETRY_DELAY = 1000 // 1 second
const MAX_RETRY_DELAY = 10000 // 10 seconds

/**
 * Validate PDF file
 */
function validatePDF(buffer: Buffer, fileName: string): { valid: boolean; error?: string } {
  // Check file size
  if (buffer.length > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `File size (${(buffer.length / 1024 / 1024).toFixed(2)}MB) exceeds maximum allowed size of ${MAX_FILE_SIZE / 1024 / 1024}MB. Please upload a smaller file.`
    }
  }

  // Check minimum size (PDFs should be at least a few bytes)
  if (buffer.length < 100) {
    return {
      valid: false,
      error: 'File is too small to be a valid PDF. The file may be corrupted.'
    }
  }

  // Check PDF header (PDF files start with %PDF)
  const header = buffer.slice(0, 4).toString('ascii')
  if (header !== '%PDF') {
    // Some PDFs might have BOM or whitespace, check first 10 bytes
    const headerWithPadding = buffer.slice(0, 10).toString('ascii')
    if (!headerWithPadding.includes('%PDF')) {
      return {
        valid: false,
        error: 'File does not appear to be a valid PDF. Please ensure the file is a PDF document.'
      }
    }
  }

  // Check for PDF footer (PDFs end with %%EOF)
  const footer = buffer.slice(-6).toString('ascii')
  if (!footer.includes('%%EOF') && !footer.includes('%%EOF\n') && !footer.includes('%%EOF\r')) {
    // Some PDFs might have additional data after EOF, check last 100 bytes
    const footerWithPadding = buffer.slice(-100).toString('ascii')
    if (!footerWithPadding.includes('%%EOF')) {
      // This is a warning, not an error - some valid PDFs might not have EOF marker
      console.warn(`PDF ${fileName} may not have proper EOF marker, but continuing...`)
    }
  }

  return { valid: true }
}

/**
 * Sleep utility for retry delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Retry function with exponential backoff
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = MAX_RETRIES,
  initialDelay: number = INITIAL_RETRY_DELAY
): Promise<T> {
  let lastError: Error | null = null
  let delay = initialDelay

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error: any) {
      lastError = error
      
      // Don't retry on certain errors
      if (
        error.message?.includes('invalid_api_key') ||
        error.message?.includes('401') ||
        error.message?.includes('403') ||
        error.message?.includes('file') && error.message?.includes('too large') ||
        error.message?.includes('file') && error.message?.includes('format')
      ) {
        throw error
      }

      // Check if it's a connection error that should be retried
      const isConnectionError = 
        error.message?.includes('connection') ||
        error.message?.includes('network') ||
        error.message?.includes('timeout') ||
        error.message?.includes('ECONNREFUSED') ||
        error.message?.includes('ENOTFOUND') ||
        error.message?.includes('ETIMEDOUT') ||
        error.code === 'ECONNREFUSED' ||
        error.code === 'ENOTFOUND' ||
        error.code === 'ETIMEDOUT'

      if (!isConnectionError && attempt < maxRetries - 1) {
        // For non-connection errors, still retry but log it
        console.warn(`Non-connection error on attempt ${attempt + 1}/${maxRetries}:`, error.message)
      }

      if (attempt < maxRetries - 1) {
        console.log(`Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms delay...`)
        await sleep(delay)
        delay = Math.min(delay * 2, MAX_RETRY_DELAY) // Exponential backoff with max cap
      }
    }
  }

  throw lastError || new Error('Max retries exceeded')
}

/**
 * Create timeout promise
 */
function createTimeoutPromise(timeoutMs: number): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Request timeout after ${timeoutMs / 1000} seconds. The PDF may be too large or complex. Please try a smaller file or contact support.`))
    }, timeoutMs)
  })
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user || !session.user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = session.user.id

    // Get appropriate API key based on subscription status
    // Free users: uses ANTHROPIC_API_KEY from .env
    // Upgraded users: uses API key from integrations
    const { getAnthropicApiKey } = await import('@/lib/ai-provider')
    let anthropicApiKey: string
    try {
      anthropicApiKey = await getAnthropicApiKey(userId)
    } catch (error: any) {
      return NextResponse.json(
        { 
          error: error.message || 'Failed to get Anthropic API key',
          details: 'Please connect an Anthropic API key in the Integrations page or ensure ANTHROPIC_API_KEY is set in environment variables.'
        },
        { status: 400 }
      )
    }

    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Validate file type
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json({ 
        error: 'File must be a PDF',
        details: `Received file type: ${file.type || 'unknown'}. Please upload a PDF document.`
      }, { status: 400 })
    }

    // Read and validate file
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    
    // Validate PDF
    const validation = validatePDF(buffer, file.name)
    if (!validation.valid) {
      return NextResponse.json({ 
        error: validation.error || 'Invalid PDF file',
        details: 'Please ensure the file is a valid, uncorrupted PDF document.'
      }, { status: 400 })
    }

    const base64Data = buffer.toString('base64')
    const fileSizeMB = (buffer.length / 1024 / 1024).toFixed(2)

    console.log(`Processing PDF: ${file.name} (${fileSizeMB}MB)`)

    const anthropic = new Anthropic({ 
      apiKey: anthropicApiKey,
      timeout: REQUEST_TIMEOUT, // Set timeout at client level
    })

    const systemPrompt = `You are an expert water damage restoration report analysis assistant with deep knowledge of ALL restoration report formats and systems. Your task is to analyze ANY water damage restoration report PDF, regardless of its format, structure, origin, or the system that generated it.

**CRITICAL ANALYSIS METHODOLOGY:**
1. **COMPREHENSIVE SCAN**: Read the ENTIRE document from start to finish - every page, every section, every table, every note, header, footer, sidebar, and appendix
2. **FORMAT AGNOSTIC**: Do NOT assume any specific format. Reports can be:
   - Structured forms with labeled fields
   - Narrative reports with embedded information
   - Tables and spreadsheets
   - Mixed formats combining multiple styles
   - Reports from RestoreAssist, Xactimate, Symbility, Matterport, DASH, Encircle, or any other system
3. **TERMINOLOGY FLEXIBILITY**: Recognize that different systems use different terms:
   - "Client" = "Customer" = "Insured" = "Property Owner" = "Claimant"
   - "Property Address" = "Site Address" = "Job Site" = "Location" = "Premises"
   - "Claim Reference" = "Job Number" = "Claim Number" = "Reference Number" = "File Number" = "Report Number"
   - "Technician" = "Inspector" = "Assessor" = "Field Technician" = "Restoration Specialist"
   - "Water Category" = "Category" = "Water Type" = "Contamination Level"
   - "Water Class" = "Class" = "Loss Category" = "Drying Class"
   - "Moisture Reading" = "Moisture Level" = "Moisture Content" = "WME" = "Moisture %"
   - "Affected Area" = "Damaged Area" = "Wet Area" = "Loss Area" = "Impact Zone"
4. **LOCATION INTELLIGENCE**: Information can appear ANYWHERE:
   - Headers and footers (often contain dates, report numbers, company info)
   - Cover pages (client name, property address, claim reference)
   - Summary sections (key dates, categories, classes)
   - Detailed sections (room-by-room breakdowns)
   - Tables (moisture readings, equipment, costs)
   - Appendices (additional data, photos with captions)
   - Sidebars and callout boxes (important notes, warnings)
5. **DATA EXTRACTION PRIORITY**: Extract information in this order:
   - First: Look for explicitly labeled fields (e.g., "Client Name:", "Property Address:")
   - Second: Look for structured data in tables
   - Third: Extract from narrative text using context clues
   - Fourth: Infer from related information (e.g., if you see "Category 2 water", extract waterCategory)
6. **MISSING DATA HANDLING**: 
   - If a field is not found, use null (not empty string) for optional fields
   - For required text fields, use empty string "" if truly not found
   - DO NOT guess or make up data - only extract what is actually present
   - If partial information exists, extract what you can (e.g., if only first name is visible, extract that)

Extract ALL structured information from the PDF document.

Extract the following fields if available in the document:

**Basic Information (CRITICAL - Extract from ANY location in document):**
- clientName: Full name of the client/property owner. Look for: "Client Name", "Customer", "Insured", "Property Owner", "Claimant", "Name", or any name field. May appear in header, cover page, or first section.
- clientContactDetails: Phone number, email, contact information. Look for: "Contact", "Phone", "Email", "Mobile", "Tel", phone numbers (various formats), email addresses. May be near client name or in contact section.
- propertyAddress: Full property address including street, suburb, state. Look for: "Address", "Property Address", "Site Address", "Location", "Premises", "Job Site". Extract complete address even if split across lines.
- propertyPostcode: Postcode (4 digits, Australian format). Look for 4-digit numbers near address, or extract from full address string.
- claimReferenceNumber: Claim reference, job number, or report number. Look for: "Claim #", "Job #", "Reference", "File #", "Report #", "Claim Number", "Job Number", "Reference Number". Often in header/footer or cover page.
- incidentDate: Date of water damage incident (format: YYYY-MM-DD). Look for: "Incident Date", "Date of Loss", "Loss Date", "Water Damage Date", "Date of Incident", "Occurrence Date". Handle all date formats (DD/MM/YYYY, MM/DD/YYYY, DD-MM-YYYY, etc.)
- technicianAttendanceDate: Date technician attended site (format: YYYY-MM-DD). Look for: "Inspection Date", "Attendance Date", "Site Visit Date", "Assessment Date", "Date Attended", "Visit Date". May be same as incident date if not specified separately.
- technicianName: Name of technician/inspector who attended. Look for: "Technician", "Inspector", "Assessor", "Field Technician", "Restoration Specialist", "Prepared By", "Inspected By", "Assessed By". May be in header, footer, or signature section.
- technicianFieldReport: Complete technician field report text/notes. Look for: "Field Report", "Technician Notes", "Observations", "Findings", "Assessment", "Report", "Comments", "Notes", or large blocks of narrative text describing the damage/assessment.

**Property Intelligence (Extract building and access information):**
- buildingAge: Year the building was constructed (integer, e.g., 1995). Look for: "Year Built", "Built", "Construction Year", "Age", "Building Age", or year mentioned near property description. Extract 4-digit year.
- structureType: Building structure type (e.g., "Brick Veneer", "Slab on Ground", "Timber Frame", "Concrete", "Brick", "Weatherboard", "Fibro", "Double Brick"). Look for: "Structure Type", "Building Type", "Construction Type", "Structure", or descriptions in property section.
- accessNotes: Access notes (e.g., "Level driveway", "Truck mount access", "Stairs only", "Elevator access", "Restricted access"). Look for: "Access", "Access Notes", "Site Access", "Accessibility", "Entry", or notes about how to access the property.

**Hazard Profile (Extract all safety and health hazards):**
- insurerName: Insurance company name. Look for: "Insurer", "Insurance Company", "Insurance", "Insured By", "Carrier", "Underwriter", company names that sound like insurance companies (e.g., "Suncorp", "IAG", "Allianz", "QBE").
- methamphetamineScreen: "POSITIVE" or "NEGATIVE" (if mentioned). Look for: "Meth Screen", "Meth Test", "Methamphetamine", "Meth", "P Test", "Drug Test", "POSITIVE" or "NEGATIVE" results.
- methamphetamineTestCount: Number of meth tests performed (integer, if mentioned). Look for numbers near meth test mentions, or "X tests performed", "X samples".
- biologicalMouldDetected: true or false (if mould/biological growth mentioned). Look for: "Mould", "Mold", "Biological Growth", "Fungal Growth", "Microbial Growth", "Fungi", "Spores". Set to true if any mention found, false if explicitly stated as "No mould" or "No biological growth".
- biologicalMouldCategory: Mould category if mentioned (e.g., "CAT 1", "CAT 2", "CAT 3", "Category 1", "Category 2", "Category 3"). Look for category classifications near mould mentions.

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

**Water Damage Details (CRITICAL - Extract classification and source):**
- waterCategory: "Category 1", "Category 2", or "Category 3". Look for: "Category 1/2/3", "Cat 1/2/3", "Water Category", "Category", "Contamination Level", "Clean/Grey/Black Water", or descriptions like "clean water", "grey water", "contaminated", "sewage", "black water". Category 1 = clean, Category 2 = grey, Category 3 = black/contaminated.
- waterClass: "Class 1", "Class 2", "Class 3", or "Class 4" (integer: 1, 2, 3, or 4). Look for: "Class 1/2/3/4", "Water Class", "Class", "Loss Category", "Drying Class", "IICRC Class". May be written as "Class 1" or just "1". Extract the number.
- sourceOfWater: Source of water (e.g., "Burst pipe", "Storm damage", "Appliance failure", "Roof leak", "Toilet overflow", "Plumbing failure"). Look for: "Source", "Water Source", "Cause", "Origin", "Source of Loss", "Cause of Damage", or narrative descriptions of how water entered.
- affectedArea: Affected area in square metres (float). Look for: "Affected Area", "Damaged Area", "Wet Area", "Loss Area", "Area", measurements like "X sqm", "X m²", "X square metres", or area calculations. Convert from square feet if needed (1 sq ft = 0.0929 sq m).

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

**ADVANCED EXTRACTION STRATEGIES FOR DIFFERENT REPORT FORMATS:**

1. **FORM-BASED REPORTS** (Structured with labeled fields):
   - Look for field labels followed by colons (e.g., "Client Name:", "Address:")
   - Extract values immediately after labels
   - Check both left-aligned and right-aligned label formats

2. **NARRATIVE REPORTS** (Paragraph-based descriptions):
   - Read entire paragraphs for context
   - Extract information from sentences (e.g., "The incident occurred on [date]")
   - Look for key phrases and extract associated data
   - Use context clues (e.g., if paragraph mentions "burst pipe", extract as sourceOfWater)

3. **TABLE-BASED REPORTS** (Data in tables/grids):
   - Read all table headers to understand structure
   - Extract data from all rows, not just first few
   - Handle merged cells and multi-row entries
   - Look for summary rows that might contain totals

4. **MIXED FORMAT REPORTS** (Combination of above):
   - Scan entire document first to understand structure
   - Extract from each section using appropriate method
   - Cross-reference information across sections for validation

5. **SYSTEM-SPECIFIC PATTERNS**:
   - **Xactimate/Symbility**: Look for claim numbers, line items, room-by-room breakdowns
   - **Matterport/Encircle**: Look for 360° tour references, photo annotations, room measurements
   - **DASH**: Look for detailed equipment lists, drying logs, moisture tracking
   - **Generic Reports**: Use flexible terminology matching and context extraction

**CRITICAL EXTRACTION REQUIREMENTS:**
- Extract dates in YYYY-MM-DD format (handle ALL date formats: DD/MM/YYYY, MM/DD/YYYY, DD-MM-YYYY, DD.MM.YYYY, "January 15, 2024", "15th January 2024", etc.)
- Use null for missing optional fields, empty string "" for missing required text fields
- For boolean fields, use true/false or null (never use strings like "yes"/"no")
- For numeric fields, extract the number or use null (handle decimals, percentages, units)
- Analyze the document THOROUGHLY - examine every section, table, paragraph, header, footer, note, appendix, and attachment reference
- Look for dates, measurements, test results, phase information, room dimensions, equipment mentions in ANY location
- If dates are mentioned in text format, convert to YYYY-MM-DD (be extremely flexible with date parsing - try multiple interpretations)
- For scope areas: Extract EVERY room/area mentioned, even if dimensions are approximate or missing. Don't miss any affected areas.
- For psychrometric data: Look in tables, assessment sections, environmental readings, technical data sections, drying logs, or anywhere environmental conditions are mentioned
- For equipment: Extract ALL equipment mentions, even if just mentioned in passing, in different terminology, or in photo captions
- DO NOT skip any valuable information - if you see it in the document, extract it
- If measurements are in different units, convert to metres (e.g., feet to metres: multiply by 0.3048, inches to metres: multiply by 0.0254, square feet to square metres: multiply by 0.0929)
- Handle reports from ANY system - be extremely flexible with terminology, formats, and layouts
- If a field uses different terminology (e.g., "customer" instead of "client", "job site" instead of "property", "loss" instead of "incident"), extract it anyway using context
- Look for information in unexpected places - some reports have critical data in headers, footers, sidebars, watermarks, or even in photo captions
- If information appears multiple times with slight variations, use the most complete/accurate version
- For partial matches (e.g., only first name visible), extract what you can rather than skipping entirely

**VALIDATION AND QUALITY CHECKS:**
- Verify extracted dates are reasonable (not in future, not too far in past)
- Check that numeric values make sense (e.g., moisture readings 0-100%, areas positive numbers)
- Ensure extracted arrays contain valid objects with required fields
- If a field seems incorrect, re-check the document before extracting

**Return ONLY a valid JSON object with ALL extracted fields. Ensure no valuable records are missed.**
**If the report format is unusual or different, still extract as much information as possible.**
**Prioritize accuracy - it's better to extract partial data correctly than to guess or make assumptions.**`

    try {
      // Use retry logic with timeout for the API call
      const response = await retryWithBackoff(async () => {
        // Race between the API call and timeout
        return Promise.race([
          // Use prompt caching for cost optimization (90% savings on cache hits)
          anthropic.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 8192, // Increased for larger/complex reports
            system: [createCachedSystemPrompt(systemPrompt)],
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
                    text: `Extract ALL structured data from this PDF document and return it as a complete JSON object. 

CRITICAL INSTRUCTIONS:
1. Read the ENTIRE document from first page to last page - do not skip any sections
2. Extract information from headers, footers, cover pages, tables, paragraphs, lists, and any other locations
3. Handle reports from ANY restoration system (RestoreAssist, Xactimate, Symbility, Matterport, Encircle, DASH, or any other format)
4. Be extremely flexible with terminology - extract data even if field names are different
5. Extract partial information if full information is not available (e.g., extract first name if full name not visible)
6. For dates: Convert ALL date formats to YYYY-MM-DD (handle DD/MM/YYYY, MM/DD/YYYY, text dates, etc.)
7. For measurements: Convert to standard units (metres for dimensions, square metres for areas)
8. Extract ALL rooms/areas mentioned, ALL moisture readings, ALL equipment, and ALL other available data
9. Do NOT skip any fields - if information exists anywhere in the document, extract it
10. Return a complete JSON object with ALL extracted fields - missing fields should be null or empty string as appropriate

IMPORTANT: This PDF may be:
- Text-based (standard PDF with selectable text)
- Image-based/scanned (PDF created from scanned documents or images)
- Mixed format (combination of text and images)
- Complex layout (tables, forms, multi-column layouts)
- From any restoration system or format

Regardless of the PDF type, extract as much information as possible. For image-based PDFs, use OCR capabilities to read text from images. For complex layouts, carefully analyze table structures and form fields.

Analyze this document thoroughly and extract every piece of available information, regardless of the report format or system that generated it.`
                  }
                ]
              }
            ]
          }),
          createTimeoutPromise(REQUEST_TIMEOUT)
        ])
      })

      // Log cache metrics
      const metrics = extractCacheMetrics(response)
      logCacheMetrics('ReportUploadParser', metrics, response.id)

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
          throw new Error('No JSON found in response. The AI may have returned an unexpected format.')
        }
      } catch (parseError: any) {
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

      return NextResponse.json({
        success: true,
        extractedText: parsedData.fullText || '',
        parsedData: extractedData,
        message: 'PDF parsed successfully. All available data extracted. Please review and complete the form.'
      })

    } catch (claudeError: any) {
      console.error('PDF analysis error:', {
        message: claudeError.message,
        code: claudeError.code,
        fileName: file.name,
        fileSize: fileSizeMB + 'MB'
      })

      // Handle specific error types with helpful messages
      const errorMessage = claudeError.message || 'Unknown error'
      const errorCode = claudeError.code || ''
      
      // Rate limiting
      if (errorMessage.includes('rate_limit') || errorMessage.includes('429') || errorCode === 'rate_limit_exceeded') {
        return NextResponse.json(
          { 
            error: 'API rate limit exceeded',
            details: 'Too many requests. Please wait a moment and try again.',
            suggestion: 'If this persists, consider upgrading your plan or reducing the frequency of uploads.'
          },
          { status: 429 }
        )
      }
      
      // Authentication errors
      if (errorMessage.includes('invalid_api_key') || errorMessage.includes('401') || errorCode === 'authentication_error') {
        return NextResponse.json(
          { 
            error: 'Invalid API key',
            details: 'The API key is invalid or expired. Please check your integration settings.',
            suggestion: 'Go to Settings > Integrations and verify your Anthropic API key is correct and active.'
          },
          { status: 401 }
        )
      }

      // Authorization errors
      if (errorMessage.includes('403') || errorCode === 'permission_denied') {
        return NextResponse.json(
          { 
            error: 'Access denied',
            details: 'You do not have permission to use this API key.',
            suggestion: 'Please check your API key permissions or contact support.'
          },
          { status: 403 }
        )
      }
      
      // Connection errors (after retries)
      if (
        errorMessage.includes('connection') ||
        errorMessage.includes('network') ||
        errorMessage.includes('ECONNREFUSED') ||
        errorMessage.includes('ENOTFOUND') ||
        errorMessage.includes('ETIMEDOUT') ||
        errorCode === 'connection_error' ||
        errorCode === 'ECONNREFUSED' ||
        errorCode === 'ENOTFOUND' ||
        errorCode === 'ETIMEDOUT'
      ) {
        return NextResponse.json(
          { 
            error: 'Connection error',
            details: 'Failed to connect to the analysis service after multiple retry attempts.',
            suggestion: 'Please check your internet connection and try again. If the problem persists, the service may be temporarily unavailable.',
            retryable: true
          },
          { status: 503 }
        )
      }

      // Timeout errors
      if (errorMessage.includes('timeout') || errorCode === 'timeout') {
        return NextResponse.json(
          { 
            error: 'Request timeout',
            details: `The PDF analysis took longer than ${REQUEST_TIMEOUT / 1000} seconds to complete.`,
            suggestion: 'The PDF may be too large or complex. Try uploading a smaller file, or split the document into smaller sections. For very large reports, consider processing sections separately.',
            fileSize: fileSizeMB + 'MB'
          },
          { status: 408 }
        )
      }
      
      // File/document errors
      if (errorMessage.includes('file') || errorMessage.includes('document') || errorMessage.includes('format')) {
        return NextResponse.json(
          { 
            error: 'Failed to process PDF document',
            details: 'The file may be corrupted, password-protected, or in an unsupported format.',
            suggestion: 'Please ensure the PDF is: (1) Not password-protected, (2) Not corrupted, (3) A valid PDF format. Try opening the PDF in a PDF viewer first to verify it\'s valid.',
            fileName: file.name
          },
          { status: 400 }
        )
      }

      // File too large
      if (errorMessage.includes('too large') || errorMessage.includes('size limit')) {
        return NextResponse.json(
          { 
            error: 'File too large',
            details: `The PDF (${fileSizeMB}MB) exceeds the maximum processing size.`,
            suggestion: `Please upload a PDF smaller than ${MAX_FILE_SIZE / 1024 / 1024}MB, or split the document into smaller sections.`,
            maxSize: `${MAX_FILE_SIZE / 1024 / 1024}MB`
          },
          { status: 413 }
        )
      }
      
      // Generic error with helpful context
      return NextResponse.json(
        { 
          error: 'Failed to analyze PDF',
          details: errorMessage || 'An unexpected error occurred while processing the PDF.',
          suggestion: 'Please ensure the PDF is a valid water damage restoration report. If the problem persists, try: (1) Re-saving the PDF, (2) Converting to a different PDF format, (3) Contacting support with the error details.',
          fileName: file.name,
          fileSize: fileSizeMB + 'MB'
        },
        { status: 500 }
      )
    }

  } catch (error: any) {
    console.error('Unexpected error in PDF upload handler:', error)
    
    return NextResponse.json(
      { 
        error: 'Failed to process PDF upload',
        details: error.message || 'An unexpected error occurred. Please try again.',
        suggestion: 'If this problem persists, please contact support with details about the file you\'re trying to upload.'
      },
      { status: 500 }
    )
  }
}