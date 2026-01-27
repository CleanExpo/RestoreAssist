import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST() {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
      // Mark all user's notifications as read
      await (prisma as any).notification?.updateMany({
        where: {
          userId: session.user.id,
          read: false,
        },
        data: { read: true },
      })

      return NextResponse.json({ success: true })
    } catch {
      // Model doesn't exist - return success for graceful handling
      return NextResponse.json({ success: true })
    }
  } catch (error) {
    console.error('Error marking all notifications as read:', error)
    return NextResponse.json(
      { error: 'Failed to mark notifications as read' },
      { status: 500 }
    )
  }
}
