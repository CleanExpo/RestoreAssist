import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

const VALID_CATEGORIES = [
  'MOISTURE_METER',
  'AIR_MOVER',
  'DEHUMIDIFIER',
  'THERMAL_CAMERA',
  'OTHER',
]

// Update equipment
export async function PUT(
  request: NextRequest,
  { params }: { params: { equipmentId: string } }
) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { equipmentId } = await params

    // Verify ownership
    const existing = await prisma.contractorEquipment.findUnique({
      where: { id: equipmentId },
      include: {
        contractor: {
          select: { userId: true },
        },
      },
    })

    if (!existing) {
      return NextResponse.json(
        { error: 'Equipment not found' },
        { status: 404 }
      )
    }

    if (existing.contractor.userId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const {
      equipmentName,
      make,
      model,
      serialNumber,
      category,
      lastCalibrated,
      calibrationDue,
      calibrationCertUrl,
    } = body

    if (category && !VALID_CATEGORIES.includes(category)) {
      return NextResponse.json(
        { error: 'Invalid equipment category' },
        { status: 400 }
      )
    }

    const equipment = await prisma.contractorEquipment.update({
      where: { id: equipmentId },
      data: {
        ...(equipmentName !== undefined && { equipmentName }),
        ...(make !== undefined && { make: make || null }),
        ...(model !== undefined && { model: model || null }),
        ...(serialNumber !== undefined && { serialNumber: serialNumber || null }),
        ...(category !== undefined && { category }),
        ...(lastCalibrated !== undefined && {
          lastCalibrated: lastCalibrated ? new Date(lastCalibrated) : null,
        }),
        ...(calibrationDue !== undefined && {
          calibrationDue: calibrationDue ? new Date(calibrationDue) : null,
        }),
        ...(calibrationCertUrl !== undefined && {
          calibrationCertUrl: calibrationCertUrl || null,
        }),
        // Reset verification when equipment details change
        isVerified: false,
        verifiedAt: null,
        verifiedBy: null,
      },
    })

    return NextResponse.json({ equipment })
  } catch (error: unknown) {
    console.error('Error updating equipment:', error)
    return NextResponse.json(
      { error: 'Failed to update equipment' },
      { status: 500 }
    )
  }
}

// Delete equipment
export async function DELETE(
  request: NextRequest,
  { params }: { params: { equipmentId: string } }
) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { equipmentId } = await params

    // Verify ownership
    const existing = await prisma.contractorEquipment.findUnique({
      where: { id: equipmentId },
      include: {
        contractor: {
          select: { userId: true },
        },
      },
    })

    if (!existing) {
      return NextResponse.json(
        { error: 'Equipment not found' },
        { status: 404 }
      )
    }

    if (existing.contractor.userId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    await prisma.contractorEquipment.delete({
      where: { id: equipmentId },
    })

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error('Error deleting equipment:', error)
    return NextResponse.json(
      { error: 'Failed to delete equipment' },
      { status: 500 }
    )
  }
}
