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

    // Parse dates
    const incidentDate = data.incidentDate ? new Date(data.incidentDate) : null
    const technicianAttendanceDate = data.technicianAttendanceDate 
      ? new Date(data.technicianAttendanceDate) 
      : null

    // Create the report with initial data
    const report = await prisma.report.create({
      data: {
        title: reportTitle,
        description: 'Initial data entry - awaiting report generation',
        status: 'DRAFT',
        clientName: data.clientName.trim(),
        propertyAddress: data.propertyAddress.trim(),
        hazardType: 'Water', // Default for water damage restoration
        insuranceType: 'Building and Contents Insurance', // Default
        userId: user.id,
        
        // Phase 2: Initial Data Entry Fields
        clientContactDetails: data.clientContactDetails?.trim() || null,
        propertyPostcode: data.propertyPostcode.trim(),
        claimReferenceNumber: data.claimReferenceNumber?.trim() || null,
        incidentDate: incidentDate,
        technicianAttendanceDate: technicianAttendanceDate,
        technicianName: data.technicianName?.trim() || null,
        technicianFieldReport: data.technicianFieldReport.trim(),
        
        // Report Generation Stage
        reportDepthLevel: null, // Will be set when user chooses Basic/Enhanced
        reportVersion: 1,
        
        // Set report number
        reportNumber: reportTitle,
        inspectionDate: technicianAttendanceDate || new Date(),
      }
    })

    return NextResponse.json({ 
      report,
      message: 'Initial data saved successfully. Proceed to report generation.'
    })
  } catch (error) {
    console.error('Error creating initial report entry:', error)
    return NextResponse.json(
      { error: 'Failed to save initial data' },
      { status: 500 }
    )
  }
}

