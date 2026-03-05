import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

// List corrective actions for an incident
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

    // Verify incident belongs to user
    const incident = await prisma.wHSIncident.findFirst({
      where: { id, userId: session.user.id },
      select: { id: true },
    })

    if (!incident) {
      return NextResponse.json({ error: 'Incident not found' }, { status: 404 })
    }

    const actions = await prisma.wHSCorrectiveAction.findMany({
      where: { incidentId: id },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ actions })
  } catch (error: unknown) {
    console.error('Error fetching corrective actions:', error)
    return NextResponse.json(
      { error: 'Failed to fetch corrective actions' },
      { status: 500 }
    )
  }
}

// Add new corrective action
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    // Verify incident belongs to user
    const incident = await prisma.wHSIncident.findFirst({
      where: { id, userId: session.user.id },
      select: { id: true },
    })

    if (!incident) {
      return NextResponse.json({ error: 'Incident not found' }, { status: 404 })
    }

    const body = await request.json()
    const { description, assignedTo, dueDate } = body

    if (!description) {
      return NextResponse.json(
        { error: 'Description is required' },
        { status: 400 }
      )
    }

    const action = await prisma.wHSCorrectiveAction.create({
      data: {
        incidentId: id,
        description,
        assignedTo: assignedTo || null,
        dueDate: dueDate ? new Date(dueDate) : null,
      },
    })

    return NextResponse.json({ action }, { status: 201 })
  } catch (error: unknown) {
    console.error('Error creating corrective action:', error)
    return NextResponse.json(
      { error: 'Failed to create corrective action' },
      { status: 500 }
    )
  }
}
