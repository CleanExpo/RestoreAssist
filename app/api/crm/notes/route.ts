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
    const contactId = searchParams.get('contactId')
    const companyId = searchParams.get('companyId')
    const opportunityId = searchParams.get('opportunityId')
    const reportId = searchParams.get('reportId')
    const isPinned = searchParams.get('isPinned')

    const where: any = { userId: session.user.id }

    if (contactId) where.contactId = contactId
    if (companyId) where.companyId = companyId
    if (opportunityId) where.opportunityId = opportunityId
    if (reportId) where.reportId = reportId
    if (isPinned !== null) where.isPinned = isPinned === 'true'

    const [notes, total] = await Promise.all([
      prisma.crmNote.findMany({
        where,
        include: {
          contact: {
            select: {
              id: true,
              fullName: true
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
        orderBy: [
          { isPinned: 'desc' },
          { createdAt: 'desc' }
        ],
        skip: (page - 1) * limit,
        take: limit
      }),
      prisma.crmNote.count({ where })
    ])

    return NextResponse.json({
      notes,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    })
  } catch (error: any) {
    console.error('Error fetching notes:', error)
    return NextResponse.json(
      { error: 'Failed to fetch notes' },
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
      content,
      isPinned,
      contactId,
      companyId,
      opportunityId,
      reportId
    } = body

    if (!content) {
      return NextResponse.json({ error: 'Content is required' }, { status: 400 })
    }

    const note = await prisma.crmNote.create({
      data: {
        content,
        isPinned: isPinned || false,
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
            fullName: true
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

    return NextResponse.json({ note }, { status: 201 })
  } catch (error: any) {
    console.error('Error creating note:', error)
    return NextResponse.json(
      { error: 'Failed to create note' },
      { status: 500 }
    )
  }
}
