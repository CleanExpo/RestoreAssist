import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify task ownership
    const existingTask = await prisma.crmTask.findUnique({
      where: {
        id: params.id,
        userId: session.user.id
      },
      include: {
        company: {
          select: {
            id: true,
            name: true
          }
        },
        contact: {
          select: {
            id: true,
            fullName: true
          }
        }
      }
    })

    if (!existingTask) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    // Parse request body for optional completion notes
    const body = await request.json().catch(() => ({}))
    const { completionNotes } = body

    // Mark task as completed
    const task = await prisma.crmTask.update({
      where: { id: params.id },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        completionNotes: completionNotes || null
      },
      include: {
        company: {
          select: {
            id: true,
            name: true
          }
        },
        contact: {
          select: {
            id: true,
            fullName: true
          }
        }
      }
    })

    // Create activity log
    const activityData: any = {
      type: 'TASK',
      subject: `Task completed: ${task.title}`,
      description: completionNotes || `Task "${task.title}" was marked as completed`,
      activityDate: new Date(),
      userId: session.user.id
    }

    if (task.companyId) {
      activityData.companyId = task.companyId
    }

    if (task.contactId) {
      activityData.contactId = task.contactId
    }

    await prisma.activity.create({
      data: activityData
    })

    return NextResponse.json({ task })
  } catch (error: any) {
    console.error('Error completing task:', error)
    return NextResponse.json(
      { error: 'Failed to complete task' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify task ownership
    const existingTask = await prisma.crmTask.findUnique({
      where: {
        id: params.id,
        userId: session.user.id
      }
    })

    if (!existingTask) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    // Mark task as not completed (reopen)
    const task = await prisma.crmTask.update({
      where: { id: params.id },
      data: {
        status: existingTask.dueDate && new Date() > existingTask.dueDate ? 'OVERDUE' : 'PENDING',
        completedAt: null,
        completionNotes: null
      },
      include: {
        company: {
          select: {
            id: true,
            name: true
          }
        },
        contact: {
          select: {
            id: true,
            fullName: true
          }
        }
      }
    })

    return NextResponse.json({ task })
  } catch (error: any) {
    console.error('Error uncompleting task:', error)
    return NextResponse.json(
      { error: 'Failed to uncomplete task' },
      { status: 500 }
    )
  }
}
