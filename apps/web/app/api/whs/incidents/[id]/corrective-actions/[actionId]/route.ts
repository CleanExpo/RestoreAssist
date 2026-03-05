import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

const VALID_STATUSES = ['PENDING', 'IN_PROGRESS', 'COMPLETED']

// Update corrective action
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; actionId: string }> }
) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id, actionId } = await params

    // Verify incident belongs to user
    const incident = await prisma.wHSIncident.findFirst({
      where: { id, userId: session.user.id },
      select: { id: true },
    })

    if (!incident) {
      return NextResponse.json({ error: 'Incident not found' }, { status: 404 })
    }

    const existing = await prisma.wHSCorrectiveAction.findFirst({
      where: { id: actionId, incidentId: id },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Corrective action not found' }, { status: 404 })
    }

    const body = await request.json()
    const { description, assignedTo, dueDate, status } = body

    const updateData: Record<string, unknown> = {}

    if (description !== undefined) updateData.description = description
    if (assignedTo !== undefined) updateData.assignedTo = assignedTo
    if (dueDate !== undefined) updateData.dueDate = dueDate ? new Date(dueDate) : null

    if (status !== undefined) {
      if (!VALID_STATUSES.includes(status)) {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
      }
      updateData.status = status
      if (status === 'COMPLETED') {
        updateData.completedAt = new Date()
      }
    }

    const action = await prisma.wHSCorrectiveAction.update({
      where: { id: actionId },
      data: updateData,
    })

    return NextResponse.json({ action })
  } catch (error: unknown) {
    console.error('Error updating corrective action:', error)
    return NextResponse.json(
      { error: 'Failed to update corrective action' },
      { status: 500 }
    )
  }
}

// Delete corrective action
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; actionId: string }> }
) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id, actionId } = await params

    // Verify incident belongs to user
    const incident = await prisma.wHSIncident.findFirst({
      where: { id, userId: session.user.id },
      select: { id: true },
    })

    if (!incident) {
      return NextResponse.json({ error: 'Incident not found' }, { status: 404 })
    }

    const existing = await prisma.wHSCorrectiveAction.findFirst({
      where: { id: actionId, incidentId: id },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Corrective action not found' }, { status: 404 })
    }

    await prisma.wHSCorrectiveAction.delete({ where: { id: actionId } })

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error('Error deleting corrective action:', error)
    return NextResponse.json(
      { error: 'Failed to delete corrective action' },
      { status: 500 }
    )
  }
}
