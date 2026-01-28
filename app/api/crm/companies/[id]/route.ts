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

    const company = await prisma.company.findUnique({
      where: {
        id: params.id,
        userId: session.user.id
      },
      include: {
        contacts: {
          orderBy: { createdAt: 'desc' },
          take: 10
        },
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
        companyTags: {
          include: { tag: true }
        },
        _count: {
          select: {
            contacts: true,
            activities: true,
            tasks: true,
            opportunities: true,
            reports: true
          }
        }
      }
    })

    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 })
    }

    return NextResponse.json({ company })
  } catch (error: any) {
    console.error('Error fetching company:', error)
    return NextResponse.json(
      { error: 'Failed to fetch company' },
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
    const existing = await prisma.company.findUnique({
      where: {
        id: params.id,
        userId: session.user.id
      }
    })

    if (!existing) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 })
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
      potentialRevenue,
      relationshipScore,
      tagIds
    } = body

    // Update company
    const company = await prisma.company.update({
      where: { id: params.id },
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
        country,
        abn,
        acn,
        description,
        lifecycleStage,
        status,
        source,
        notes,
        potentialRevenue,
        relationshipScore
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

    // Update tags if provided
    if (tagIds !== undefined) {
      // Remove old tags
      await prisma.companyTag.deleteMany({
        where: { companyId: params.id }
      })

      // Add new tags
      if (tagIds.length > 0) {
        await prisma.companyTag.createMany({
          data: tagIds.map((tagId: string) => ({
            companyId: params.id,
            tagId
          }))
        })
      }
    }

    // Create activity
    await prisma.activity.create({
      data: {
        type: 'NOTE',
        subject: 'Company updated',
        description: `Company "${name}" was updated`,
        companyId: company.id,
        userId: session.user.id
      }
    })

    return NextResponse.json({ company })
  } catch (error: any) {
    console.error('Error updating company:', error)
    return NextResponse.json(
      { error: 'Failed to update company' },
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
    const existing = await prisma.company.findUnique({
      where: {
        id: params.id,
        userId: session.user.id
      }
    })

    if (!existing) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 })
    }

    await prisma.company.delete({
      where: { id: params.id }
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting company:', error)
    return NextResponse.json(
      { error: 'Failed to delete company' },
      { status: 500 }
    )
  }
}
