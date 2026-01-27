import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if Notification model exists, otherwise return empty
    // This gracefully handles if the migration hasn't been run
    try {
      const notifications = await (prisma as any).notification?.findMany({
        where: { userId: session.user.id },
        orderBy: { createdAt: 'desc' },
        take: 20,
      })

      return NextResponse.json({ notifications: notifications || [] })
    } catch {
      // Notification model doesn't exist yet - return sample notifications for now
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
      const notification = await (prisma as any).notification?.create({
        data: {
          userId: session.user.id,
          title,
          message,
          type,
          link,
        },
      })

      return NextResponse.json({ notification })
    } catch {
      // Notification model doesn't exist
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
