import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const TYPE_MAP: Record<string, string> = {
  INFO: 'info',
  SUCCESS: 'success',
  WARNING: 'warning',
  ERROR: 'error',
}

const REVERSE_TYPE_MAP: Record<string, string> = {
  info: 'INFO',
  success: 'SUCCESS',
  warning: 'WARNING',
  error: 'ERROR',
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
      const notifications = await prisma.notification.findMany({
        where: { userId: session.user.id },
        orderBy: { createdAt: 'desc' },
        take: 20,
      })

      return NextResponse.json({
        notifications: notifications.map((n) => ({
          ...n,
          type: TYPE_MAP[n.type] || 'info',
        })),
      })
    } catch {
      // Notification table doesn't exist yet — return welcome notification
      return NextResponse.json({
        notifications: [
          {
            id: 'welcome',
            title: 'Welcome to RestoreAssist',
            message: 'Get started by creating your first report or configuring your cost libraries.',
            type: 'info',
            read: false,
            createdAt: new Date().toISOString(),
          },
        ],
      })
    }
  } catch (error) {
    console.error('Error fetching notifications:', error)
    return NextResponse.json(
      { error: 'Failed to fetch notifications' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { title, message, type = 'info', link } = await request.json()

    if (!title || !message) {
      return NextResponse.json(
        { error: 'Title and message are required' },
        { status: 400 }
      )
    }

    try {
      const notification = await prisma.notification.create({
        data: {
          userId: session.user.id,
          title,
          message,
          type: (REVERSE_TYPE_MAP[type] || 'INFO') as NotificationType,
          link,
        },
      })

      return NextResponse.json({
        notification: { ...notification, type: TYPE_MAP[notification.type] || 'info' },
      })
    } catch {
      return NextResponse.json(
        { error: 'Notifications not available' },
        { status: 503 }
      )
    }
  } catch (error) {
    console.error('Error creating notification:', error)
    return NextResponse.json(
      { error: 'Failed to create notification' },
      { status: 500 }
    )
  }
}
