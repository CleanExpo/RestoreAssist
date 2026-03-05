import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

// Delete a CEC record
export async function DELETE(
  request: NextRequest,
  { params }: { params: { cecId: string } }
) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { cecId } = await params

    // Verify ownership
    const record = await prisma.continuingEducation.findUnique({
      where: { id: cecId },
      include: {
        contractor: {
          select: { userId: true }
        }
      }
    })

    if (!record) {
      return NextResponse.json(
        { error: 'CEC record not found' },
        { status: 404 }
      )
    }

    if (record.contractor.userId !== session.user.id) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      )
    }

    await prisma.continuingEducation.delete({
      where: { id: cecId }
    })

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error('Error deleting CEC record:', error)
    return NextResponse.json(
      { error: 'Failed to delete CEC record' },
      { status: 500 }
    )
  }
}
