import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const TYPE_MAP: Record<string, string> = {
  INFO: 'info',
  SUCCESS: 'success',
  WARNING: 'warning',
  ERROR: 'error',
}

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
      const notification = await prisma.notification.findFirst({
        where: {
          id,
          userId: session.user.id,
        },
      })

      if (!notification) {
        return NextResponse.json({ error: 'Notification not found' }, { status: 404 })
      }

      return NextResponse.json({
        ...notification,
        type: TYPE_MAP[notification.type] || 'info',
      })
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

    // Handle static welcome notification
    if (id === 'welcome') {
      return NextResponse.json({ success: true })
    }

    try {
      const notification = await prisma.notification.findFirst({
        where: {
          id,
          userId: session.user.id,
        },
      })

      if (!notification) {
        return NextResponse.json({ error: 'Notification not found' }, { status: 404 })
      }

      await prisma.notification.delete({
        where: { id },
      })

      return NextResponse.json({ success: true })
    } catch {
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
