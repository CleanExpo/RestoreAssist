import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// POST: Generate scope from inspection
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const userId = session.user.id
    const body = await req.json()
    const { reportId } = body

    if (!reportId) {
      return NextResponse.json(
        { success: false, error: 'Report ID is required' },
        { status: 400 }
      )
    }

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

    // Check if scope already exists
    const existingScope = await prisma.scope.findUnique({
      where: { reportId }
    })

    if (existingScope) {
      return NextResponse.json(
        { success: false, error: 'Scope already exists for this inspection' },
        { status: 400 }
      )
    }

    // Determine scope type from hazard type
    const scopeType = report.hazardType.toUpperCase()

    // Calculate initial parameters based on report data
    const labourParameters = calculateLabourParameters(report)
    const equipmentParameters = calculateEquipmentParameters(report)
    const chemicalApplication = calculateChemicalApplication(report)
    const timeCalculations = calculateTimeEstimates(report)

    // Create scope
    const scope = await prisma.scope.create({
      data: {
        reportId,
        userId,
        scopeType,
        siteVariables: JSON.stringify(extractSiteVariables(report)),
        labourParameters: JSON.stringify(labourParameters),
        equipmentParameters: JSON.stringify(equipmentParameters),
        chemicalApplication: JSON.stringify(chemicalApplication),
        timeCalculations: JSON.stringify(timeCalculations),
        labourCostTotal: labourParameters.totalCost,
        equipmentCostTotal: equipmentParameters.totalCost,
        chemicalCostTotal: chemicalApplication.totalCost,
        totalDuration: timeCalculations.totalDays,
        createdBy: userId,
        updatedBy: userId
      }
    })

    // Audit log would go here (simplified for now)

    return NextResponse.json({
      success: true,
      data: scope
    })
  } catch (error) {
    console.error('Error creating scope:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to create scope' },
      { status: 500 }
    )
  }
}

// GET: List scopes
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const userId = session.user.id
    const { searchParams } = new URL(req.url)
    const reportId = searchParams.get('reportId')

    const where: any = { userId }
    if (reportId) {
      where.reportId = reportId
    }

    const scopes = await prisma.scope.findMany({
      where,
      include: {
        report: {
          select: {
            id: true,
            title: true,
            clientName: true,
            propertyAddress: true,
            status: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    })

    return NextResponse.json({
      success: true,
      data: scopes
    })
  } catch (error) {
    console.error('Error fetching scopes:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch scopes' },
      { status: 500 }
    )
  }
}

// Helper functions
function extractSiteVariables(report: any) {
  return {
    affectedArea: report.affectedArea,
    structureType: 'Residential', // Default
    materials: [],
    accessibility: 'Normal'
  }
}

function calculateLabourParameters(report: any) {
  // Simplified calculation - should be based on pricing structure
  const area = report.affectedArea || 0
  const hoursEstimate = Math.ceil(area * 0.5) // 0.5 hours per sqm

  return {
    roles: [
      { name: 'Master Technician', hours: hoursEstimate * 0.3, rate: 80 },
      { name: 'Qualified Technician', hours: hoursEstimate * 0.5, rate: 60 },
      { name: 'Labourer', hours: hoursEstimate * 0.2, rate: 40 }
    ],
    totalHours: hoursEstimate,
    totalCost: hoursEstimate * 60 // Average rate
  }
}

function calculateEquipmentParameters(report: any) {
  const area = report.affectedArea || 0

  return {
    equipment: [
      { name: 'Dehumidifier - Large', quantity: Math.ceil(area / 50), dailyRate: 50 },
      { name: 'Air Mover - Axial', quantity: Math.ceil(area / 20), dailyRate: 20 }
    ],
    totalCost: Math.ceil(area / 50) * 50 + Math.ceil(area / 20) * 20
  }
}

function calculateChemicalApplication(report: any) {
  const area = report.affectedArea || 0

  return {
    chemicals: [
      { name: 'Anti-Microbial', area, rate: 1.5 }
    ],
    totalCost: area * 1.5
  }
}

function calculateTimeEstimates(report: any) {
  const area = report.affectedArea || 0
  const daysEstimate = Math.ceil(area / 100) + 2 // Base 2 days + area factor

  return {
    totalDays: daysEstimate,
    phases: [
      { name: 'Setup', days: 1 },
      { name: 'Active Drying', days: daysEstimate - 2 },
      { name: 'Completion', days: 1 }
    ]
  }
}
