import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

const VALID_SEVERITIES = ['NEAR_MISS', 'MINOR', 'MODERATE', 'SERIOUS', 'CRITICAL']
const VALID_INJURY_TYPES = ['NONE', 'STRAIN', 'LACERATION', 'FRACTURE', 'BURN', 'OTHER']

// Get current user's incidents (with pagination, severity filter)
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const severity = searchParams.get('severity')
    const status = searchParams.get('status')
    const page = parseInt(searchParams.get('page') || '1', 10)
    const limit = parseInt(searchParams.get('limit') || '20', 10)
    const skip = (page - 1) * limit

    const where: Record<string, unknown> = { userId: session.user.id }
    if (severity && VALID_SEVERITIES.includes(severity)) {
      where.severity = severity
    }
    if (status) {
      where.status = status
    }

    const [incidents, total] = await Promise.all([
      prisma.wHSIncident.findMany({
        where,
        include: { correctiveActions: true },
        orderBy: { incidentDate: 'desc' },
        skip,
        take: limit,
      }),
      prisma.wHSIncident.count({ where }),
    ])

    return NextResponse.json({ incidents, total, page, limit })
  } catch (error: unknown) {
    console.error('Error fetching WHS incidents:', error)
    return NextResponse.json(
      { error: 'Failed to fetch incidents' },
      { status: 500 }
    )
  }
}

// Create new incident (auto-generate incidentNumber)
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      incidentDate,
      location,
      description,
      severity,
      injuryType,
      affectedPerson,
      witnessNames,
      immediateAction,
      reportedToSafework,
      safeworkRefNumber,
      evidenceUrls,
    } = body

    if (!incidentDate || !location || !description || !severity) {
      return NextResponse.json(
        { error: 'Incident date, location, description, and severity are required' },
        { status: 400 }
      )
    }

    if (!VALID_SEVERITIES.includes(severity)) {
      return NextResponse.json(
        { error: 'Invalid severity level' },
        { status: 400 }
      )
    }

    if (injuryType && !VALID_INJURY_TYPES.includes(injuryType)) {
      return NextResponse.json(
        { error: 'Invalid injury type' },
        { status: 400 }
      )
    }

    // Generate incident number: INC-YYYY-NNN
    const year = new Date().getFullYear()
    const count = await prisma.wHSIncident.count({
      where: {
        userId: session.user.id,
        incidentDate: { gte: new Date(`${year}-01-01`) },
      },
    })
    const incidentNumber = `INC-${year}-${String(count + 1).padStart(3, '0')}`

    const incident = await prisma.wHSIncident.create({
      data: {
        userId: session.user.id,
        incidentNumber,
        incidentDate: new Date(incidentDate),
        location,
        description,
        severity,
        injuryType: injuryType || null,
        affectedPerson: affectedPerson || null,
        witnessNames: witnessNames || null,
        immediateAction: immediateAction || null,
        reportedToSafework: reportedToSafework || false,
        safeworkRefNumber: safeworkRefNumber || null,
        evidenceUrls: evidenceUrls || [],
      },
      include: { correctiveActions: true },
    })

    return NextResponse.json({ incident }, { status: 201 })
  } catch (error: unknown) {
    console.error('Error creating WHS incident:', error)
    return NextResponse.json(
      { error: 'Failed to create incident' },
      { status: 500 }
    )
  }
}
