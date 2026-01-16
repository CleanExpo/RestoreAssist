import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import Anthropic from "@anthropic-ai/sdk"
import { getIntegrationsForUser } from "@/lib/ai-provider"

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { reportId, technicianNotes, dateOfAttendance, clientContacted, clientName, propertyAddress, clientEmail, clientPhone, photos, conversationHistory } = body

    if (!technicianNotes || !technicianNotes.trim()) {
      return NextResponse.json({ error: "Technician notes are required" }, { status: 400 })
    }

    // Get integrations (Admin's for Managers/Technicians, own for Admins)
    const integrations = await getIntegrationsForUser(session.user.id, {
      status: "CONNECTED",
      nameContains: ["Anthropic", "Claude"]
    })

    // Find Anthropic integration (check for both old and new naming conventions)
    const integration = integrations.find(i => 
      i.name === "Anthropic Claude" || 
      i.name === "Anthropic API" ||
      i.name.toLowerCase().includes("anthropic")
    )

    if (!integration) {
      return NextResponse.json(
        { error: "No connected Anthropic API integration found. Please connect an Anthropic API key." },
        { status: 400 }
      )
    }

    if (!integration.apiKey) {
      return NextResponse.json(
        { error: "No valid API key found" },
        { status: 400 }
      )
    }

    // Check credits and get user info (including technician name)
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        name: true,
        email: true,
        subscriptionStatus: true,
        creditsRemaining: true,
        totalCreditsUsed: true,
      }
    })

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    if (user.subscriptionStatus === 'TRIAL' && user.creditsRemaining < 1) {
      return NextResponse.json(
        { 
          error: "Insufficient credits. Please upgrade your plan to create more reports.",
          upgradeRequired: true,
          creditsRemaining: user.creditsRemaining
        },
        { status: 402 }
      )
    }

    // Initialize Anthropic API client
    const anthropic = new Anthropic({ apiKey: integration.apiKey })

    // STAGE 1: Retrieve relevant standards from Google Drive (IICRC Standards folder)
    let standardsContext = ''
    try {
      const { retrieveRelevantStandards, buildStandardsContextPrompt } = await import('@/lib/standards-retrieval')
      
      // Determine report type from technician notes
      const reportType = determineReportType(technicianNotes)
      
      const retrievalQuery = {
        reportType,
        keywords: extractKeywords(technicianNotes),
        materials: extractMaterials(technicianNotes),
        technicianNotes: technicianNotes.substring(0, 1000),
      }
      
      // Use the user's Anthropic API key to retrieve and analyze standards
      const retrievedStandards = await retrieveRelevantStandards(retrievalQuery, integration.apiKey)
      standardsContext = buildStandardsContextPrompt(retrievedStandards)
    } catch (error: any) {
      console.error('[Generate Enhanced Report] Error retrieving standards from Google Drive:', error.message)
      // Error retrieving standards from Google Drive (continuing without)
    }

    // Build conversation context if available
    let conversationContext = ""
    if (conversationHistory && Array.isArray(conversationHistory) && conversationHistory.length > 0) {
      conversationContext = `\n\nClient Conversation History:\n${conversationHistory.map((msg: any) => 
        `${msg.role === "client" ? "Client" : "System"}: ${msg.content}`
      ).join("\n")}`
    }

    // Get technician name
    const technicianName = user?.name || session.user?.name || "Technician"
    
    // Build the AI prompt for generating enhanced professional report
    const prompt = `You are a professional water damage restoration report writer operating in Australia. A technician has provided basic inspection notes. Your task is to transform these simple notes into a comprehensive, professional inspection report that strictly adheres to ALL relevant Australian standards, laws, regulations, and best practices.

Technician Information:
- Technician Name: ${technicianName}
${dateOfAttendance ? `- Date of Attendance: ${dateOfAttendance}` : ''}

Client Information:
${clientName ? `- Client Name: ${clientName}` : ''}
${propertyAddress ? `- Property Address: ${propertyAddress}` : ''}
${clientEmail ? `- Client Email: ${clientEmail}` : ''}
${clientPhone ? `- Client Phone: ${clientPhone}` : ''}
${clientContacted ? `- Client Contacted Notes: ${clientContacted}` : ''}

Technician's Basic Notes:
${technicianNotes}

${conversationContext}
${photos && photos.length > 0 ? `Photos: ${photos.length} photos attached` : ''}

${standardsContext}

CRITICAL REQUIREMENTS - You MUST explicitly reference and comply with:

**Australian Standards:**
- AS-IICRC S500:2025 - Standard for Professional Water Damage Restoration
- AS-IICRC S520 - Standard for Professional Mold Remediation
- AS/NZS 3000:2018 - Electrical Installations (Wiring Rules)
- AS/NZS 3500 - Plumbing and Drainage Standards
- AS 3959 - Construction of Buildings in Bushfire-Prone Areas (if applicable)
- AS 1684 - Residential Timber-Framed Construction
- AS 2870 - Residential Slabs and Footings

**IICRC Standards (International Institute of Cleaning and Restoration Certification):**
- IICRC S500 Standard and Reference Guide for Professional Water Damage Restoration
- IICRC S520 Standard and Reference Guide for Professional Mold Remediation
- IICRC S540 Standard for Trauma and Crime Scene Cleanup
- IICRC RIA - Restoration Industry Association Standards

**Australian OH&S (Work Health and Safety) Requirements:**
- Work Health and Safety Act 2011 (Commonwealth)
- State-specific WHS Acts (e.g., Work Health and Safety Act 2011 (QLD))
- Safe Work Australia Guidelines
- Personal Protective Equipment (PPE) requirements
- Hazard identification and risk assessment protocols
- Electrical safety standards (AS/NZS 3000)
- Confined space entry procedures (if applicable)
- Asbestos management (if applicable - refer to state-specific regulations)

**State Building Codes:**
- National Construction Code (NCC) - Building Code of Australia
- Queensland Development Code (QDC) - specifically QDC 4.5 for wet areas
- State-specific building regulations and standards
- Local council building requirements

**Insurance Policy Standards:**
- General Insurance Code of Practice
- Australian Prudential Regulation Authority (APRA) guidelines
- Insurance Council of Australia (ICA) standards
- Policy wording compliance
- Claims documentation requirements

**HVAC and Air Systems:**
- AS 1668 - The use of ventilation and airconditioning in buildings
- AS/NZS 3666 - Air-handling and water systems of buildings
- ASHRAE standards (where applicable in Australia)
- Indoor air quality standards
- Air filtration and purification requirements

**Electrical Systems:**
- AS/NZS 3000:2018 - Electrical Installations (Wiring Rules)
- AS/NZS 3012 - Electrical installations - Construction and demolition sites
- Electrical safety standards for equipment operation
- Power distribution and load calculations
- Circuit protection requirements

**Building Materials:**
- Australian Building Codes Board (ABCB) material standards
- Material-specific drying protocols (timber, concrete, plasterboard, etc.)
- Material compatibility and interaction
- Australian Standards for building materials (AS 1684, AS 2870, etc.)

**Local Laws and Regulations:**
- State-specific environmental protection laws
- Water discharge regulations
- Waste disposal requirements
- Noise regulations for equipment operation
- Local council bylaws

Generate a comprehensive Professional Inspection Report (Enhanced Version) that includes ALL of the following sections:

1. **Report Header**: Include technician name (${technicianName}), date of attendance, client name (${clientName || 'if provided'}), property address (${propertyAddress || 'if provided'}), client email (${clientEmail || 'if provided'}), and client phone (${clientPhone || 'if provided'}). DO NOT use "[Redacted for Privacy]" - use the actual information provided.
2. **Date of Attendance**: Format the date professionally
3. **Client Contacted**: Expand on client contact information and context
4. **Weather/Seasonal Context**: Add relevant weather/seasonal information if applicable
5. **Areas Affected**: Detailed breakdown of all affected areas (upstairs, downstairs, specific rooms, materials)
6. **Standards & Compliance**: 
   - EXPLICITLY reference AS-IICRC S500:2025
   - EXPLICITLY reference relevant IICRC standards
   - EXPLICITLY reference National Construction Code (NCC) and state building codes (e.g., QDC 4.5)
   - EXPLICITLY reference Australian OH&S requirements
   - EXPLICITLY reference relevant Australian Standards (AS/NZS)
   - EXPLICITLY reference insurance policy standards and requirements
   - EXPLICITLY reference HVAC and air system standards (AS 1668, AS/NZS 3666)
   - EXPLICITLY reference electrical system standards (AS/NZS 3000)
   - EXPLICITLY reference building material standards
   - EXPLICITLY reference local laws and regulations
7. **Material Identification**: Identify materials mentioned (e.g., Yellow tongue particleboard, floating timber, plasterboard, etc.) and drying requirements per Australian standards
8. **Procedures Completed**: 
   - Site risk assessment (per Australian OH&S requirements)
   - Water category classification (per AS-IICRC S500:2025)
   - Moisture and thermal imaging (per IICRC standards)
   - Extraction methods (per AS-IICRC S500:2025)
   - Equipment deployed (with quantities)
9. **Specific Drying Recommendations**: Detailed recommendations for each material type per Australian standards and IICRC guidelines
10. **Equipment and Power Requirements**: 
   - Calculate and document power requirements for all equipment
   - Reference AS/NZS 3000:2018 for electrical safety
   - Include circuit protection and load distribution per Australian electrical standards
11. **OH&S Compliance**: 
    - EXPLICITLY reference Work Health and Safety Act requirements
    - Safety procedures per Safe Work Australia guidelines
    - PPE requirements per Australian OH&S standards
    - Site signage and containment per WHS requirements
    - Hazard identification and risk assessment
12. **Insurance Claim Limitations**: 
    - Reference General Insurance Code of Practice
    - Document per Insurance Council of Australia standards
    - Include policy compliance information
13. **HVAC and Air Systems Assessment**: 
    - Reference AS 1668 and AS/NZS 3666
    - Indoor air quality assessment
    - Air filtration requirements
    - Split system air conditioning assessment (if applicable)
14. **Electrical Systems Assessment**: 
    - Reference AS/NZS 3000:2018
    - Electrical safety assessment
    - Power supply adequacy
    - Circuit protection requirements
15. **Monitoring & Documentation**: 
    - Photo documentation per IICRC standards
    - Moisture logs per AS-IICRC S500:2025
    - Thermal images per IICRC standards
    - Compliance documentation
16. **Conclusion & Risk Factors**: 
    - Summary of findings
    - Recommendations per Australian standards
    - Risk factors and mitigation strategies
    - Compliance summary

CRITICAL INSTRUCTIONS:
- You MUST explicitly mention and reference specific standards, codes, and regulations throughout the report
- Use proper Australian technical terminology and standards nomenclature
- Include specific standard numbers (e.g., "AS-IICRC S500:2025", "AS/NZS 3000:2018", "NCC", "QDC 4.5")
- Reference Australian OH&S requirements by name (e.g., "Work Health and Safety Act 2011", "Safe Work Australia Guidelines")
- Reference IICRC standards explicitly (e.g., "IICRC S500 Standard", "IICRC S520 Standard")
- Include material-specific standards where applicable
- Reference electrical standards for power requirements (AS/NZS 3000:2018)
- Reference HVAC standards for air systems (AS 1668, AS/NZS 3666)
- Reference insurance standards and codes of practice
- Reference state building codes (NCC, QDC, etc.)
- Expand on the technician's notes intelligently - add professional context and details
- Include specific equipment counts and power calculations per Australian electrical standards
- Add material-specific drying recommendations per Australian building material standards
- Include comprehensive safety and compliance information per Australian OH&S requirements
- Make it comprehensive and professional while staying true to the technician's observations
- Ensure all recommendations comply with Australian laws and regulations
- IMPORTANT: Use the actual client information provided (name, address, email, phone) - DO NOT use "[Redacted for Privacy]" or any placeholder text. Include all provided information in the report header and throughout the report where relevant.

Format the response as a well-structured professional report with clear sections and headings. Each section should explicitly reference the relevant Australian standards, codes, and regulations.`

    // Call Anthropic API to generate enhanced report
    const systemPrompt = `You are a professional water damage restoration report writer operating in Australia. Generate comprehensive, professional reports that strictly adhere to ALL relevant Australian standards, laws, regulations, and best practices. You MUST explicitly reference and mention specific standards, codes, and regulations throughout the report. Always use the actual client information provided (name, address, email, phone, technician name) - NEVER use "[Redacted for Privacy]" or placeholder text.`

    // Use utility function to try multiple models with fallback
    const { tryClaudeModels } = await import('@/lib/anthropic-models')
    
    const message = await tryClaudeModels(
      anthropic,
      {
          system: systemPrompt,
        max_tokens: 8000,
          messages: [
            {
              role: "user",
              content: prompt
            }
          ]
      }
    )

    const enhancedReport = message.content[0].type === 'text' 
          ? message.content[0].text 
          : JSON.stringify(message.content[0])
    
    // If still no report, throw error
    if (!enhancedReport) {
      const errorMessage = "All model attempts failed. Please check your API key and model availability."
      console.error("All model attempts failed")
      return NextResponse.json(
        { 
          error: errorMessage
        },
        { status: 500 }
      )
    }

    // Save or update report
    let savedReport
    if (reportId) {
      // Update existing report - don't deduct credits
      savedReport = await prisma.report.update({
        where: { id: reportId },
        data: {
          detailedReport: enhancedReport,
          ...(clientName && { clientName }),
          ...(propertyAddress && { propertyAddress }),
          equipmentUsed: JSON.stringify({
            technicianNotes,
            dateOfAttendance,
            clientContacted,
            technicianName,
            clientEmail,
            clientPhone,
            photos: photos || []
          })
        }
      })
    } else {
      // Create new report - deduct credits and track usage
      const { deductCreditsAndTrackUsage } = await import('@/lib/report-limits')
      await deductCreditsAndTrackUsage(session.user.id)
      
      savedReport = await prisma.report.create({
        data: {
          title: `WD-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`,
          clientName: clientName || "To be completed",
          propertyAddress: propertyAddress || "To be completed",
          hazardType: "Water",
          insuranceType: "Building and Contents Insurance",
          status: "DRAFT",
          userId: session.user.id,
          detailedReport: enhancedReport,
          equipmentUsed: JSON.stringify({
            technicianNotes,
            dateOfAttendance,
            clientContacted,
            technicianName,
            clientEmail,
            clientPhone,
            photos: photos || []
          })
        }
      })
    }

    return NextResponse.json({
      success: true,
      reportId: savedReport.id,
      enhancedReport,
      message: "Enhanced professional report generated successfully"
    })
  } catch (error: any) {
    console.error("Error generating enhanced report:", error)
    return NextResponse.json(
      { error: error.message || "Failed to generate enhanced report" },
      { status: 500 }
    )
  }
}

