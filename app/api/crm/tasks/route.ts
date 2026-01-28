import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50)
    const status = searchParams.get('status')
    const priority = searchParams.get('priority')
    const assignedToId = searchParams.get('assignedToId')
    const contactId = searchParams.get('contactId')
    const companyId = searchParams.get('companyId')

    const where: any = {
      OR: [
        { createdById: session.user.id },
        { assignedToId: session.user.id }
      ]
    }

    if (status) where.status = status
    if (priority) where.priority = priority
    if (assignedToId) where.assignedToId = assignedToId
    if (contactId) where.contactId = contactId
    if (companyId) where.companyId = companyId

    const [tasks, total] = await Promise.all([
      prisma.crmTask.findMany({
        where,
        include: {
          contact: {
            select: {
              id: true,
              fullName: true,
              email: true
            }
          },
          company: {
            select: {
              id: true,
              name: true
            }
          },
          opportunity: {
            select: {
              id: true,
              title: true
            }
          },
          report: {
            select: {
              id: true,
              title: true
            }
          },
          assignedTo: {
            select: {
              id: true,
              name: true,
              email: true
            }
          },
          createdBy: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
        },
        orderBy: [
          { status: 'asc' },
          { dueDate: 'asc' }
        ],
        skip: (page - 1) * limit,
        take: limit
      }),
      prisma.crmTask.count({ where })
    ])

    return NextResponse.json({
      tasks,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    })
  } catch (error: any) {
    console.error('Error fetching tasks:', error)
    return NextResponse.json(
      { error: 'Failed to fetch tasks' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      title,
      description,
      dueDate,
      priority,
      status,
      contactId,
      companyId,
      opportunityId,
      reportId,
      assignedToId,
      reminderDate
    } = body

    if (!title) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 })
    }

    const task = await prisma.crmTask.create({
      data: {
        title,
        description,
        dueDate: dueDate ? new Date(dueDate) : undefined,
        priority: priority || 'MEDIUM',
        status: status || 'TODO',
        contactId,
        companyId,
        opportunityId,
        reportId,
        assignedToId: assignedToId || session.user.id,
        createdById: session.user.id,
        reminderDate: reminderDate ? new Date(reminderDate) : undefined
      },
      include: {
        contact: {
          select: {
            id: true,
            fullName: true,
            email: true
          }
        },
        company: {
          select: {
            id: true,
            name: true
          }
        },
        opportunity: {
          select: {
            id: true,
            title: true
          }
        },
        assignedTo: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    })

    return NextResponse.json({ task }, { status: 201 })
  } catch (error: any) {
    console.error('Error creating task:', error)
    return NextResponse.json(
      { error: 'Failed to create task' },
      { status: 500 }
    )
  }
}
