import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify company ownership
    const company = await prisma.company.findUnique({
      where: {
        id: params.id,
        userId: session.user.id
      }
    })

    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 })
    }

    // Get query parameters
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')
    const status = searchParams.get('status') // Filter by contact status
    const isPrimary = searchParams.get('isPrimary') // Filter by primary contact

    // Build where clause
    const where: any = {
      companyId: params.id
    }

    if (status) {
      where.status = status
    }

    if (isPrimary !== null && isPrimary !== undefined) {
      where.isPrimaryContact = isPrimary === 'true'
    }

    // Fetch contacts
    const [contacts, total] = await Promise.all([
      prisma.contact.findMany({
        where,
        orderBy: [
          { isPrimaryContact: 'desc' },
          { fullName: 'asc' }
        ],
        take: limit,
        skip: offset,
        include: {
          contactTags: {
            include: { tag: true }
          },
          _count: {
            select: {
              activities: true,
              tasks: true,
              reports: true
            }
          }
        }
      }),
      prisma.contact.count({ where })
    ])

    return NextResponse.json({
      contacts,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total
      }
    })
  } catch (error: any) {
    console.error('Error fetching company contacts:', error)
    return NextResponse.json(
      { error: 'Failed to fetch contacts' },
      { status: 500 }
    )
  }
}
