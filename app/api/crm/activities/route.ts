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
    const type = searchParams.get('type')
    const contactId = searchParams.get('contactId')
    const companyId = searchParams.get('companyId')
    const opportunityId = searchParams.get('opportunityId')

    const where: any = { userId: session.user.id }

    if (type) where.type = type
    if (contactId) where.contactId = contactId
    if (companyId) where.companyId = companyId
    if (opportunityId) where.opportunityId = opportunityId

    const [activities, total] = await Promise.all([
      prisma.activity.findMany({
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
          user: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
        },
        orderBy: { activityDate: 'desc' },
        skip: (page - 1) * limit,
        take: limit
      }),
      prisma.activity.count({ where })
    ])

    return NextResponse.json({
      activities,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    })
  } catch (error: any) {
    console.error('Error fetching activities:', error)
    return NextResponse.json(
      { error: 'Failed to fetch activities' },
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
      type,
      subject,
      description,
      outcome,
      activityDate,
      duration,
      contactId,
      companyId,
      opportunityId,
      reportId
    } = body

    if (!type) {
      return NextResponse.json({ error: 'Activity type is required' }, { status: 400 })
    }

    if (!subject) {
      return NextResponse.json({ error: 'Subject is required' }, { status: 400 })
    }

    const activity = await prisma.activity.create({
      data: {
        type,
        subject,
        description,
        outcome,
        activityDate: activityDate ? new Date(activityDate) : new Date(),
        duration,
        contactId,
        companyId,
        opportunityId,
        reportId,
        userId: session.user.id
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
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    })

    return NextResponse.json({ activity }, { status: 201 })
  } catch (error: any) {
    console.error('Error creating activity:', error)
    return NextResponse.json(
      { error: 'Failed to create activity' },
      { status: 500 }
    )
  }
}
