import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

const VALID_STATUSES = ['OPEN', 'UNDER_INVESTIGATION', 'CORRECTIVE_ACTION', 'CLOSED']

// Get single incident with corrective actions
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    const incident = await prisma.wHSIncident.findFirst({
      where: { id, userId: session.user.id },
      include: { correctiveActions: { orderBy: { createdAt: 'desc' } } },
    })

    if (!incident) {
      return NextResponse.json({ error: 'Incident not found' }, { status: 404 })
    }

    return NextResponse.json({ incident })
  } catch (error: unknown) {
    console.error('Error fetching WHS incident:', error)
    return NextResponse.json(
      { error: 'Failed to fetch incident' },
      { status: 500 }
    )
  }
}

// Update incident (status changes, add investigation notes)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    const existing = await prisma.wHSIncident.findFirst({
      where: { id, userId: session.user.id },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Incident not found' }, { status: 404 })
    }

    const body = await request.json()
    const {
      status,
      investigationNotes,
      reportedToSafework,
      safeworkRefNumber,
      location,
      description,
      severity,
      injuryType,
      affectedPerson,
      witnessNames,
      immediateAction,
      evidenceUrls,
    } = body

    const updateData: Record<string, unknown> = {}

    if (status !== undefined) {
      if (!VALID_STATUSES.includes(status)) {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
      }
      updateData.status = status
      if (status === 'CLOSED') {
        updateData.closedAt = new Date()
      }
    }

    if (investigationNotes !== undefined) updateData.investigationNotes = investigationNotes
    if (reportedToSafework !== undefined) updateData.reportedToSafework = reportedToSafework
    if (safeworkRefNumber !== undefined) updateData.safeworkRefNumber = safeworkRefNumber
    if (location !== undefined) updateData.location = location
    if (description !== undefined) updateData.description = description
    if (severity !== undefined) updateData.severity = severity
    if (injuryType !== undefined) updateData.injuryType = injuryType
    if (affectedPerson !== undefined) updateData.affectedPerson = affectedPerson
    if (witnessNames !== undefined) updateData.witnessNames = witnessNames
    if (immediateAction !== undefined) updateData.immediateAction = immediateAction
    if (evidenceUrls !== undefined) updateData.evidenceUrls = evidenceUrls

    const incident = await prisma.wHSIncident.update({
      where: { id },
      data: updateData,
      include: { correctiveActions: true },
    })

    return NextResponse.json({ incident })
  } catch (error: unknown) {
    console.error('Error updating WHS incident:', error)
    return NextResponse.json(
      { error: 'Failed to update incident' },
      { status: 500 }
    )
  }
}

// Delete incident
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    const existing = await prisma.wHSIncident.findFirst({
      where: { id, userId: session.user.id },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Incident not found' }, { status: 404 })
    }

    await prisma.wHSIncident.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error('Error deleting WHS incident:', error)
    return NextResponse.json(
      { error: 'Failed to delete incident' },
      { status: 500 }
    )
  }
}
