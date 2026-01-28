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

    const contact = await prisma.contact.findUnique({
      where: {
        id: params.id,
        userId: session.user.id
      },
      include: {
        company: true,
        activities: {
          orderBy: { activityDate: 'desc' },
          take: 10,
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          }
        },
        tasks: {
          where: { status: { not: 'COMPLETED' } },
          orderBy: { dueDate: 'asc' },
          take: 10
        },
        opportunities: {
          orderBy: { createdAt: 'desc' },
          take: 10
        },
        contactTags: {
          include: { tag: true }
        },
        _count: {
          select: {
            activities: true,
            tasks: true,
            opportunities: true,
            reports: true
          }
        }
      }
    })

    if (!contact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
    }

    return NextResponse.json({ contact })
  } catch (error: any) {
    console.error('Error fetching contact:', error)
    return NextResponse.json(
      { error: 'Failed to fetch contact' },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify ownership
    const existing = await prisma.contact.findUnique({
      where: {
        id: params.id,
        userId: session.user.id
      }
    })

    if (!existing) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
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
      relationshipScore,
      tagIds
    } = body

    const fullName = `${firstName || existing.firstName} ${lastName || existing.lastName}`.trim()

    // Update contact
    const contact = await prisma.contact.update({
      where: { id: params.id },
      data: {
        firstName,
        lastName,
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
        country,
        preferredContactMethod,
        doNotEmail,
        doNotCall,
        lifecycleStage,
        status,
        isPrimaryContact,
        source,
        notes,
        relationshipScore
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

    // Update tags if provided
    if (tagIds !== undefined) {
      // Remove old tags
      await prisma.contactTag.deleteMany({
        where: { contactId: params.id }
      })

      // Add new tags
      if (tagIds.length > 0) {
        await prisma.contactTag.createMany({
          data: tagIds.map((tagId: string) => ({
            contactId: params.id,
            tagId
          }))
        })
      }
    }

    // Create activity
    await prisma.activity.create({
      data: {
        type: 'NOTE',
        subject: 'Contact updated',
        description: `Contact "${fullName}" was updated`,
        contactId: contact.id,
        companyId: contact.companyId || undefined,
        userId: session.user.id
      }
    })

    return NextResponse.json({ contact })
  } catch (error: any) {
    console.error('Error updating contact:', error)
    return NextResponse.json(
      { error: 'Failed to update contact' },
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

    // Verify ownership
    const existing = await prisma.contact.findUnique({
      where: {
        id: params.id,
        userId: session.user.id
      }
    })

    if (!existing) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
    }

    await prisma.contact.delete({
      where: { id: params.id }
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting contact:', error)
    return NextResponse.json(
      { error: 'Failed to delete contact' },
      { status: 500 }
    )
  }
}
