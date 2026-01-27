import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    // Handle static welcome notification
    if (id === 'welcome') {
      return NextResponse.json({
        id: 'welcome',
        title: 'Welcome to RestoreAssist',
        message: 'Get started by creating your first report or configuring your cost libraries.',
        type: 'info',
        read: false,
        createdAt: new Date().toISOString(),
      })
    }

    try {
      const notification = await (prisma as any).notification?.findFirst({
        where: {
          id,
          userId: session.user.id,
        },
      })

      if (!notification) {
        return NextResponse.json({ error: 'Notification not found' }, { status: 404 })
      }

      return NextResponse.json(notification)
    } catch {
      return NextResponse.json({ error: 'Notifications not available' }, { status: 503 })
    }
  } catch (error) {
    console.error('Error fetching notification:', error)
    return NextResponse.json(
      { error: 'Failed to fetch notification' },
      { status: 500 }
    )
  }
}

export async function DELETE(
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
      // Verify notification belongs to user before deleting
      const notification = await (prisma as any).notification?.findFirst({
        where: {
          id,
          userId: session.user.id,
        },
      })

      if (!notification) {
        return NextResponse.json({ error: 'Notification not found' }, { status: 404 })
      }

      await (prisma as any).notification?.delete({
        where: { id },
      })

      return NextResponse.json({ success: true })
    } catch {
      // Model doesn't exist - return success for graceful handling
      return NextResponse.json({ success: true })
    }
  } catch (error) {
    console.error('Error deleting notification:', error)
    return NextResponse.json(
      { error: 'Failed to delete notification' },
      { status: 500 }
    )
  }
}
