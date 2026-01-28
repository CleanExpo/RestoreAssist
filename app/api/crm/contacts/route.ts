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
    const status = searchParams.get('status')
    const companyId = searchParams.get('companyId')

    const where: any = { userId: session.user.id }

    if (search) {
      where.OR = [
        { fullName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } }
      ]
    }

    if (stage) where.lifecycleStage = stage
    if (status) where.status = status
    if (companyId) where.companyId = companyId

    const [contacts, total] = await Promise.all([
      prisma.contact.findMany({
        where,
        include: {
          company: {
            select: {
              id: true,
              name: true
            }
          },
          _count: {
            select: {
              activities: true,
              tasks: { where: { status: { not: 'COMPLETED' } } },
              opportunities: true
            }
          },
          contactTags: {
            include: { tag: true }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit
      }),
      prisma.contact.count({ where })
    ])

    return NextResponse.json({
      contacts,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    })
  } catch (error: any) {
    console.error('Error fetching contacts:', error)
    return NextResponse.json(
      { error: 'Failed to fetch contacts' },
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
      firstName,
      lastName,
      email,
      phone,
      mobilePhone,
      title,
      companyId,
      addressLine1,
      addressLine2,
      city,
      state,
      postcode,
      country,
      preferredContactMethod,
      doNotEmail,
      doNotCall,
      lifecycleStage,
      status,
      isPrimaryContact,
      source,
      notes,
      tagIds
    } = body

    if (!firstName) {
      return NextResponse.json({ error: 'First name is required' }, { status: 400 })
    }

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    const fullName = `${firstName} ${lastName || ''}`.trim()

    const contact = await prisma.contact.create({
      data: {
        firstName,
        lastName: lastName || '',
        fullName,
        email,
        phone,
        mobilePhone,
        title,
        companyId,
        addressLine1,
        addressLine2,
        city,
        state,
        postcode,
        country: country || 'Australia',
        preferredContactMethod: preferredContactMethod || 'EMAIL',
        doNotEmail: doNotEmail || false,
        doNotCall: doNotCall || false,
        lifecycleStage: lifecycleStage || 'LEAD',
        status: status || 'ACTIVE',
        isPrimaryContact: isPrimaryContact || false,
        source,
        notes,
        userId: session.user.id,
        ...(tagIds && tagIds.length > 0 && {
          contactTags: {
            create: tagIds.map((tagId: string) => ({
              tagId
            }))
          }
        })
      },
      include: {
        company: {
          select: {
            id: true,
            name: true
          }
        },
        contactTags: {
          include: { tag: true }
        },
        _count: {
          select: {
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
        subject: 'Contact created',
        description: `Contact "${fullName}" was created`,
        contactId: contact.id,
        companyId: companyId || undefined,
        userId: session.user.id
      }
    })

    return NextResponse.json({ contact }, { status: 201 })
  } catch (error: any) {
    console.error('Error creating contact:', error)
    return NextResponse.json(
      { error: 'Failed to create contact' },
      { status: 500 }
    )
  }
}
