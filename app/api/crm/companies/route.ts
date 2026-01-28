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
    const search = searchParams.get('search')
    const stage = searchParams.get('stage')
    const size = searchParams.get('size')
    const status = searchParams.get('status')

    const where: any = { userId: session.user.id }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { industry: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } }
      ]
    }

    if (stage) where.lifecycleStage = stage
    if (size) where.companySize = size
    if (status) where.status = status

    const [companies, total] = await Promise.all([
      prisma.company.findMany({
        where,
        include: {
          _count: {
            select: {
              contacts: true,
              activities: true,
              tasks: { where: { status: { not: 'COMPLETED' } } },
              opportunities: true
            }
          },
          companyTags: {
            include: { tag: true }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit
      }),
      prisma.company.count({ where })
    ])

    return NextResponse.json({
      companies,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    })
  } catch (error: any) {
    console.error('Error fetching companies:', error)
    return NextResponse.json(
      { error: 'Failed to fetch companies' },
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
      name,
      industry,
      website,
      companySize,
      addressLine1,
      addressLine2,
      city,
      state,
      postcode,
      country,
      abn,
      acn,
      description,
      lifecycleStage,
      status,
      source,
      notes,
      tagIds
    } = body

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    const company = await prisma.company.create({
      data: {
        name,
        industry,
        website,
        companySize,
        addressLine1,
        addressLine2,
        city,
        state,
        postcode,
        country: country || 'Australia',
        abn,
        acn,
        description,
        lifecycleStage: lifecycleStage || 'LEAD',
        status: status || 'ACTIVE',
        source,
        notes,
        userId: session.user.id,
        ...(tagIds && tagIds.length > 0 && {
          companyTags: {
            create: tagIds.map((tagId: string) => ({
              tagId
            }))
          }
        })
      },
      include: {
        companyTags: {
          include: { tag: true }
        },
        _count: {
          select: {
            contacts: true,
            activities: true,
            tasks: true,
            opportunities: true
          }
        }
      }
    })

    // Create activity
    await prisma.activity.create({
      data: {
        type: 'NOTE',
        subject: 'Company created',
        description: `Company "${name}" was created`,
        companyId: company.id,
        userId: session.user.id
      }
    })

    return NextResponse.json({ company }, { status: 201 })
  } catch (error: any) {
    console.error('Error creating company:', error)
    return NextResponse.json(
      { error: 'Failed to create company' },
      { status: 500 }
    )
  }
}
