import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// POST - Create initial report entry (Phase 2 Step 2)
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

    const data = await request.json()

    // Validate required fields
    if (!data.clientName || !data.clientName.trim()) {
      return NextResponse.json(
        { error: 'Client name is required' },
        { status: 400 }
      )
    }

    if (!data.propertyAddress || !data.propertyAddress.trim()) {
      return NextResponse.json(
        { error: 'Property address is required' },
        { status: 400 }
      )
    }

    if (!data.propertyPostcode || !data.propertyPostcode.trim()) {
      return NextResponse.json(
        { error: 'Property postcode is required' },
        { status: 400 }
      )
    }

    if (!data.technicianFieldReport || !data.technicianFieldReport.trim()) {
      return NextResponse.json(
        { error: 'Technician field report is required' },
        { status: 400 }
      )
    }

    // Generate report title/number
    const year = new Date().getFullYear()
    const timestamp = Date.now().toString().slice(-6)
    const reportTitle = `WD-${year}-${timestamp}`

    // Helper to sanitize string values (empty strings -> null)
    const sanitizeString = (value: any): string | null => {
      if (value === null || value === undefined) return null
      const str = String(value).trim()
      return str === '' ? null : str
    }
    
    // Helper to sanitize integer values
    const sanitizeInt = (value: any): number | null => {
      if (value === null || value === undefined) return null
      if (typeof value === 'string' && value.trim() === '') return null
      const parsed = parseInt(String(value), 10)
      return isNaN(parsed) ? null : parsed
    }
    
    // Parse dates - handle empty strings and invalid dates
    const parseDate = (dateValue: any): Date | null => {
      if (!dateValue) return null
      if (typeof dateValue === 'string' && dateValue.trim() === '') return null
      const parsed = new Date(dateValue)
      return isNaN(parsed.getTime()) ? null : parsed
    }
    
    const incidentDate = parseDate(data.incidentDate)
    const technicianAttendanceDate = parseDate(data.technicianAttendanceDate)

    // Extract email and phone from clientContactDetails if provided
    let clientEmail = ''
    let clientPhone = ''
    if (data.clientContactDetails) {
      const contactDetails = data.clientContactDetails.trim()
      // Try to extract email (look for @ symbol)
      const emailMatch = contactDetails.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i)
      if (emailMatch) {
        clientEmail = emailMatch[1]
      }
      // Try to extract phone (look for phone patterns)
      const phoneMatch = contactDetails.match(/(\+?\d{1,3}[\s-]?)?\(?\d{2,4}\)?[\s-]?\d{1,4}[\s-]?\d{1,4}[\s-]?\d{1,9}/)
      if (phoneMatch) {
        clientPhone = phoneMatch[0].trim()
      }
    }
    
    // If no email found, create a placeholder email
    if (!clientEmail) {
      clientEmail = `${data.clientName.trim().toLowerCase().replace(/\s+/g, '.')}@client.local`
    }

    // Find or create client record
    let clientId = null
    try {
      // First, try to find existing client by name or email
      const existingClient = await prisma.client.findFirst({
        where: {
          userId: user.id,
          OR: [
            { name: data.clientName.trim() },
            { email: clientEmail }
          ]
        }
      })

      if (existingClient) {
        clientId = existingClient.id
        // Update client with new information if available
        await prisma.client.update({
          where: { id: existingClient.id },
          data: {
            phone: clientPhone || existingClient.phone,
            address: data.propertyAddress.trim() || existingClient.address,
            // Update email if we found a real one
            email: clientEmail.includes('@client.local') ? existingClient.email : clientEmail
          }
        })
      } else {
        // Create new client record (no subscription check - allow creating clients from reports)
        const newClient = await prisma.client.create({
          data: {
            name: data.clientName.trim(),
            email: clientEmail,
            phone: clientPhone || null,
            address: data.propertyAddress.trim() || null,
            status: 'ACTIVE',
            userId: user.id
          }
        })
        clientId = newClient.id
      }
    } catch (error) {
      console.error('Error creating/updating client:', error)
      // Continue without clientId if there's an error - don't block report creation
    }

    // Create the report with initial data
    const report = await prisma.report.create({
      data: {
        title: reportTitle,
        description: 'Initial data entry - awaiting report generation',
        status: 'DRAFT',
        clientName: data.clientName.trim(),
        clientId: clientId, // Link to client if created/found
        propertyAddress: data.propertyAddress.trim(),
        hazardType: 'Water', // Default for water damage restoration
        insuranceType: 'Building and Contents Insurance', // Default
        userId: user.id,
        
        // Phase 2: Initial Data Entry Fields
        clientContactDetails: sanitizeString(data.clientContactDetails),
        propertyPostcode: data.propertyPostcode.trim(), // Required field, so no null check
        claimReferenceNumber: sanitizeString(data.claimReferenceNumber),
        incidentDate: incidentDate,
        technicianAttendanceDate: technicianAttendanceDate,
        technicianName: sanitizeString(data.technicianName),
        technicianFieldReport: data.technicianFieldReport.trim(), // Required field
        
        // Property Intelligence (Assessment Report Data Architecture)
        buildingAge: sanitizeInt(data.buildingAge),
        structureType: sanitizeString(data.structureType),
        accessNotes: sanitizeString(data.accessNotes),
        
        // Hazard Profile (Assessment Report Data Architecture)
        insurerName: sanitizeString(data.insurerName),
        methamphetamineScreen: sanitizeString(data.methamphetamineScreen),
        methamphetamineTestCount: sanitizeInt(data.methamphetamineTestCount),
        biologicalMouldDetected: data.biologicalMouldDetected === true || data.biologicalMouldDetected === 'true' || data.biologicalMouldDetected === 1,
        biologicalMouldCategory: sanitizeString(data.biologicalMouldCategory),
        
        // Timeline Estimation Data (Assessment Report Data Architecture)
        phase1StartDate: parseDate(data.phase1StartDate),
        phase1EndDate: parseDate(data.phase1EndDate),
        phase2StartDate: parseDate(data.phase2StartDate),
        phase2EndDate: parseDate(data.phase2EndDate),
        phase3StartDate: parseDate(data.phase3StartDate),
        phase3EndDate: parseDate(data.phase3EndDate),
        
        // Report Generation Stage
        reportDepthLevel: null, // Will be set when user chooses Basic/Enhanced
        reportVersion: 1,
        
        // Set report number
        reportNumber: reportTitle,
        inspectionDate: technicianAttendanceDate || incidentDate || new Date(),
      }
    })

    // After saving, trigger intelligent standards analysis in background
    // This prepares standards context for when user generates the report
    try {
      const { retrieveRelevantStandards } = await import('@/lib/standards-retrieval')
      
      // Get user's Anthropic integration
      const integration = await prisma.integration.findFirst({
        where: {
          userId: user.id,
          name: 'Anthropic'
        }
      })
      
      if (integration?.apiKey) {
        // Build intelligent query from submitted data
        const retrievalQuery = {
          reportType: 'water' as const, // Default for water damage
          waterCategory: report.waterCategory?.replace('Category ', '') as '1' | '2' | '3' | undefined,
          materials: report.structureType ? [report.structureType] : [],
          affectedAreas: [],
          keywords: [
            report.waterCategory || '',
            report.waterClass || '',
            report.biologicalMouldDetected ? 'mould' : '',
            report.methamphetamineScreen === 'POSITIVE' ? 'methamphetamine' : '',
          ].filter(Boolean) as string[],
          technicianNotes: report.technicianFieldReport || ''
        }
        
        // Pre-fetch standards in background (don't await - let it run async)
        retrieveRelevantStandards(retrievalQuery, integration.apiKey)
          .then(standards => {
            console.log(`[Initial Entry] Pre-fetched ${standards.documents.length} relevant standards for report ${report.id}`)
          })
          .catch(error => {
            console.error(`[Initial Entry] Error pre-fetching standards:`, error)
          })
      }
    } catch (error) {
      // Non-critical - just log the error
      console.error(`[Initial Entry] Error setting up standards pre-fetch:`, error)
    }

    return NextResponse.json({ 
      report,
      message: 'Initial data saved successfully. Standards analysis initiated. Proceed to report generation.'
    })
  } catch (error) {
    console.error('Error creating initial report entry:', error)
    return NextResponse.json(
      { error: 'Failed to save initial data' },
      { status: 500 }
    )
  }
}

