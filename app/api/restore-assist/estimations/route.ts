import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// POST: Generate cost estimation from scope
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
    const { reportId, scopeId } = body

    if (!reportId) {
      return NextResponse.json(
        { success: false, error: 'Report ID is required' },
        { status: 400 }
      )
    }

    // Verify ownership
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

    // Get user's pricing structure
    const pricingStructure = await prisma.pricingStructure.findUnique({
      where: { userId }
    })

    if (!pricingStructure) {
      return NextResponse.json(
        { success: false, error: 'Pricing structure not configured' },
        { status: 400 }
      )
    }

    // Get scope if provided
    let scope = null
    if (scopeId) {
      scope = await prisma.scope.findFirst({
        where: {
          id: scopeId,
          userId
        }
      })
    }

    // Calculate estimate totals
    const calculations = calculateEstimate(report, scope, pricingStructure)

    // Create estimate
    const estimate = await prisma.estimate.create({
      data: {
        reportId,
        scopeId: scopeId || null,
        userId,
        status: 'DRAFT',
        version: 1,
        rateTables: JSON.stringify(extractRateTables(pricingStructure)),
        commercialParams: JSON.stringify({
          overheadPercent: 15,
          profitPercent: 20,
          contingencyPercent: 10,
          escalationPercent: 0
        }),
        ...calculations.totals,
        createdBy: userId,
        updatedBy: userId
      }
    })

    // Create line items
    const lineItems = await prisma.estimateLineItem.createMany({
      data: calculations.lineItems.map((item: any, index: number) => ({
        estimateId: estimate.id,
        category: item.category,
        description: item.description,
        qty: item.qty,
        unit: item.unit,
        rate: item.rate,
        subtotal: item.subtotal,
        formula: item.formula,
        isScopeLinked: item.isScopeLinked || false,
        isEstimatorAdded: true,
        createdBy: userId,
        displayOrder: index
      }))
    })

    // Audit log would go here (simplified for now)

    // Fetch complete estimate with line items
    const completeEstimate = await prisma.estimate.findUnique({
      where: { id: estimate.id },
      include: {
        lineItems: {
          orderBy: { displayOrder: 'asc' }
        },
        report: true,
        scope: true
      }
    })

    return NextResponse.json({
      success: true,
      data: completeEstimate
    })
  } catch (error) {
    console.error('Error creating estimation:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to create estimation' },
      { status: 500 }
    )
  }
}

// GET: List estimations
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
    const status = searchParams.get('status')

    const where: any = { userId }
    if (reportId) where.reportId = reportId
    if (status) where.status = status

    const estimates = await prisma.estimate.findMany({
      where,
      include: {
        report: {
          select: {
            id: true,
            title: true,
            clientName: true,
            propertyAddress: true
          }
        },
        lineItems: true
      },
      orderBy: { createdAt: 'desc' }
    })

    return NextResponse.json({
      success: true,
      data: estimates
    })
  } catch (error) {
    console.error('Error fetching estimations:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch estimations' },
      { status: 500 }
    )
  }
}

// Helper functions
function extractRateTables(pricing: any) {
  return {
    labour: {
      masterTechnician: pricing.masterTechnicianRate,
      qualifiedTechnician: pricing.qualifiedTechnicianRate,
      labourer: pricing.labourerRate
    },
    equipment: {
      dehumidifierLarge: pricing.dehumidifierLarge,
      dehumidifierMedium: pricing.dehumidifierMedium,
      airmoverAxial: pricing.airmoverAxial,
      airmoverCentrifugal: pricing.airmoverCentrifugal
    },
    chemicals: {
      antiMicrobial: pricing.chemicalAntiMicrobial,
      mouldRemediation: pricing.chemicalMouldRemediation
    }
  }
}

function calculateEstimate(report: any, scope: any, pricing: any) {
  const lineItems: any[] = []
  const area = report.affectedArea || 0

  // Callout fees
  lineItems.push({
    category: 'Prelims',
    description: 'Minimal Callout Fee',
    qty: 1,
    unit: 'ea',
    rate: pricing.minimalCalloutFee,
    subtotal: pricing.minimalCalloutFee,
    formula: '1 × ' + pricing.minimalCalloutFee,
    isScopeLinked: false
  })

  lineItems.push({
    category: 'Admin',
    description: 'Administration Fee',
    qty: 1,
    unit: 'ea',
    rate: pricing.administrationFee,
    subtotal: pricing.administrationFee,
    formula: '1 × ' + pricing.administrationFee,
    isScopeLinked: false
  })

  // Labour
  const labourHours = Math.ceil(area * 0.5)
  lineItems.push({
    category: 'Mitigation',
    description: 'Qualified Technician - Water Extraction',
    qty: labourHours,
    unit: 'hr',
    rate: pricing.qualifiedTechnicianRate,
    subtotal: labourHours * pricing.qualifiedTechnicianRate,
    formula: `${labourHours} × ${pricing.qualifiedTechnicianRate}`,
    isScopeLinked: true
  })

  // Equipment
  const dehumidifiers = Math.ceil(area / 50)
  const days = Math.ceil(area / 100) + 2

  lineItems.push({
    category: 'Mitigation',
    description: 'Dehumidifier - Large',
    qty: dehumidifiers * days,
    unit: 'day',
    rate: pricing.dehumidifierLarge,
    subtotal: dehumidifiers * days * pricing.dehumidifierLarge,
    formula: `${dehumidifiers} units × ${days} days × ${pricing.dehumidifierLarge}`,
    isScopeLinked: true
  })

  const airmovers = Math.ceil(area / 20)
  lineItems.push({
    category: 'Mitigation',
    description: 'Air Mover - Axial',
    qty: airmovers * days,
    unit: 'day',
    rate: pricing.airmoverAxial,
    subtotal: airmovers * days * pricing.airmoverAxial,
    formula: `${airmovers} units × ${days} days × ${pricing.airmoverAxial}`,
    isScopeLinked: true
  })

  // Chemicals
  lineItems.push({
    category: 'Mitigation',
    description: 'Anti-Microbial Treatment',
    qty: area,
    unit: 'sqm',
    rate: pricing.chemicalAntiMicrobial,
    subtotal: area * pricing.chemicalAntiMicrobial,
    formula: `${area} × ${pricing.chemicalAntiMicrobial}`,
    isScopeLinked: true
  })

  // Calculate totals
  const labourSubtotal = lineItems
    .filter(item => item.category === 'Mitigation' && item.unit === 'hr')
    .reduce((sum, item) => sum + item.subtotal, 0)

  const equipmentSubtotal = lineItems
    .filter(item => item.category === 'Mitigation' && item.unit === 'day')
    .reduce((sum, item) => sum + item.subtotal, 0)

  const chemicalsSubtotal = lineItems
    .filter(item => item.category === 'Mitigation' && item.unit === 'sqm')
    .reduce((sum, item) => sum + item.subtotal, 0)

  const subtotal = lineItems.reduce((sum, item) => sum + item.subtotal, 0)

  // Commercial params
  const overheads = subtotal * 0.15
  const profit = subtotal * 0.20
  const contingency = subtotal * 0.10

  const subtotalExGST = subtotal + overheads + profit + contingency
  const gst = subtotalExGST * (pricing.taxRate || 0.10)
  const totalIncGST = subtotalExGST + gst

  return {
    lineItems,
    totals: {
      labourSubtotal,
      equipmentSubtotal,
      chemicalsSubtotal,
      subcontractorSubtotal: 0,
      travelSubtotal: 0,
      wasteSubtotal: 0,
      overheads,
      profit,
      contingency,
      escalation: 0,
      subtotalExGST,
      gst,
      totalIncGST
    }
  }
}
