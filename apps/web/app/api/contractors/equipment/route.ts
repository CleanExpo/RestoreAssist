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

// Get contractor's equipment (supports ?category= and ?verified= filters)
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const profile = await prisma.contractorProfile.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    })

    if (!profile) {
      return NextResponse.json(
        { error: 'Contractor profile not found' },
        { status: 404 }
      )
    }

    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category')
    const verified = searchParams.get('verified')

    const where: Record<string, unknown> = { contractorId: profile.id }
    if (category && VALID_CATEGORIES.includes(category)) {
      where.category = category
    }
    if (verified === 'true') {
      where.isVerified = true
    } else if (verified === 'false') {
      where.isVerified = false
    }

    const equipment = await prisma.contractorEquipment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ equipment })
  } catch (error: unknown) {
    console.error('Error fetching equipment:', error)
    return NextResponse.json(
      { error: 'Failed to fetch equipment' },
      { status: 500 }
    )
  }
}

// Add new equipment
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const profile = await prisma.contractorProfile.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    })

    if (!profile) {
      return NextResponse.json(
        { error: 'Contractor profile not found' },
        { status: 404 }
      )
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

    if (!equipmentName || !category) {
      return NextResponse.json(
        { error: 'Equipment name and category are required' },
        { status: 400 }
      )
    }

    if (!VALID_CATEGORIES.includes(category)) {
      return NextResponse.json(
        { error: 'Invalid equipment category' },
        { status: 400 }
      )
    }

    const equipment = await prisma.contractorEquipment.create({
      data: {
        contractorId: profile.id,
        equipmentName,
        make: make || null,
        model: model || null,
        serialNumber: serialNumber || null,
        category,
        lastCalibrated: lastCalibrated ? new Date(lastCalibrated) : null,
        calibrationDue: calibrationDue ? new Date(calibrationDue) : null,
        calibrationCertUrl: calibrationCertUrl || null,
      },
    })

    return NextResponse.json({ equipment }, { status: 201 })
  } catch (error: unknown) {
    console.error('Error creating equipment:', error)
    return NextResponse.json(
      { error: 'Failed to create equipment' },
      { status: 500 }
    )
  }
}
