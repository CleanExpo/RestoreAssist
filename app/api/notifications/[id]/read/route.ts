import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    // Handle static welcome notification - just return success
    if (id === 'welcome') {
      return NextResponse.json({ success: true })
    }

    try {
      // Verify notification belongs to user
      const notification = await (prisma as any).notification?.findFirst({
        where: {
          id,
          userId: session.user.id,
        },
      })

      if (!notification) {
        return NextResponse.json({ error: 'Notification not found' }, { status: 404 })
      }

      // Mark as read
      const updated = await (prisma as any).notification?.update({
        where: { id },
        data: { read: true },
      })

      return NextResponse.json({ notification: updated })
    } catch {
      // Model doesn't exist - return success for graceful handling
      return NextResponse.json({ success: true })
    }
  } catch (error) {
    console.error('Error marking notification as read:', error)
    return NextResponse.json(
      { error: 'Failed to mark notification as read' },
      { status: 500 }
    )
  }
}
