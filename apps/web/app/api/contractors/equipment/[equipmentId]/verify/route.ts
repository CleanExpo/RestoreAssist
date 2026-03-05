import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

// Admin: mark equipment as verified
export async function POST(
  request: NextRequest,
  { params }: { params: { equipmentId: string } }
) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check admin role
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true },
    })

    if (!user || user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 })
    }

    const { equipmentId } = await params

    const existing = await prisma.contractorEquipment.findUnique({
      where: { id: equipmentId },
    })

    if (!existing) {
      return NextResponse.json(
        { error: 'Equipment not found' },
        { status: 404 }
      )
    }

    const equipment = await prisma.contractorEquipment.update({
      where: { id: equipmentId },
      data: {
        isVerified: true,
        verifiedAt: new Date(),
        verifiedBy: session.user.id,
      },
    })

    return NextResponse.json({ equipment })
  } catch (error: unknown) {
    console.error('Error verifying equipment:', error)
    return NextResponse.json(
      { error: 'Failed to verify equipment' },
      { status: 500 }
    )
  }
}
