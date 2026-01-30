import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

// Update service area
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify ownership
    const serviceArea = await prisma.contractorServiceArea.findUnique({
      where: { id: params.id },
      include: {
        profile: {
          select: { userId: true }
        }
      }
    })

    if (!serviceArea) {
      return NextResponse.json(
        { error: 'Service area not found' },
        { status: 404 }
      )
    }

    if (serviceArea.profile.userId !== session.user.id) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { suburb, radius, isActive, priority } = body

    const updated = await prisma.contractorServiceArea.update({
      where: { id: params.id },
      data: {
        ...(suburb !== undefined && { suburb }),
        ...(radius !== undefined && { radius: radius ? parseInt(radius) : null }),
        ...(isActive !== undefined && { isActive }),
        ...(priority !== undefined && { priority: parseInt(priority) })
      }
    })

    return NextResponse.json({ serviceArea: updated })
  } catch (error: any) {
    console.error('Error updating service area:', error)
    return NextResponse.json(
      { error: 'Failed to update service area' },
      { status: 500 }
    )
  }
}

// Delete service area
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
    const serviceArea = await prisma.contractorServiceArea.findUnique({
      where: { id: params.id },
      include: {
        profile: {
          select: { userId: true }
        }
      }
    })

    if (!serviceArea) {
      return NextResponse.json(
        { error: 'Service area not found' },
        { status: 404 }
      )
    }

    if (serviceArea.profile.userId !== session.user.id) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      )
    }

    await prisma.contractorServiceArea.delete({
      where: { id: params.id }
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting service area:', error)
    return NextResponse.json(
      { error: 'Failed to delete service area' },
      { status: 500 }
    )
  }
}
