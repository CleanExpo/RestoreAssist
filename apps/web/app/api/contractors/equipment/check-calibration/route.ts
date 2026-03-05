import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createNotification } from '@/lib/notifications'

interface CalibrationCheckSummary {
  overdue: number
  due7: number
  due14: number
  due30: number
  totalNotificationsCreated: number
}

const THRESHOLDS = [
  { days: 0, label: 'overdue', key: 'overdue' as const },
  { days: 7, label: 'due in 7 days', key: 'due7' as const },
  { days: 14, label: 'due in 14 days', key: 'due14' as const },
  { days: 30, label: 'due in 30 days', key: 'due30' as const },
]

/**
 * POST /api/contractors/equipment/check-calibration
 *
 * Scans the current user's equipment for upcoming/overdue calibrations
 * and creates idempotent in-app notifications.
 */
export async function POST() {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = session.user.id

    const profile = await prisma.contractorProfile.findUnique({
      where: { userId },
      select: { id: true },
    })

    if (!profile) {
      return NextResponse.json(
        { error: 'Contractor profile not found' },
        { status: 404 }
      )
    }

    // Fetch all equipment with a calibrationDue date
    const equipment = await prisma.contractorEquipment.findMany({
      where: {
        contractorId: profile.id,
        calibrationDue: { not: null },
      },
      select: {
        id: true,
        equipmentName: true,
        calibrationDue: true,
        category: true,
      },
    })

    const now = new Date()
    const summary: CalibrationCheckSummary = {
      overdue: 0,
      due7: 0,
      due14: 0,
      due30: 0,
      totalNotificationsCreated: 0,
    }

    // Look back 24h for dedup window — don't recreate notifications made today
    const dedupSince = new Date(now.getTime() - 24 * 60 * 60 * 1000)

    // Fetch recent calibration notifications for this user to avoid duplicates
    const recentNotifications = await prisma.notification.findMany({
      where: {
        userId,
        createdAt: { gte: dedupSince },
        title: { startsWith: 'Calibration' },
      },
      select: { message: true },
    })

    const existingMessages = new Set(recentNotifications.map((n) => n.message))

    for (const item of equipment) {
      if (!item.calibrationDue) continue

      const dueDate = new Date(item.calibrationDue)
      const daysUntilDue = Math.ceil(
        (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      )

      // Determine which threshold this item matches (pick the most urgent)
      let matchedThreshold: (typeof THRESHOLDS)[number] | null = null

      if (daysUntilDue < 0) {
        matchedThreshold = THRESHOLDS[0] // overdue
      } else if (daysUntilDue <= 7) {
        matchedThreshold = THRESHOLDS[1] // 7 days
      } else if (daysUntilDue <= 14) {
        matchedThreshold = THRESHOLDS[2] // 14 days
      } else if (daysUntilDue <= 30) {
        matchedThreshold = THRESHOLDS[3] // 30 days
      }

      if (!matchedThreshold) continue

      summary[matchedThreshold.key]++

      const dueDateStr = dueDate.toLocaleDateString('en-AU')
      const isOverdue = matchedThreshold.key === 'overdue'

      const title = isOverdue ? 'Calibration Overdue' : 'Calibration Due Soon'
      const message = isOverdue
        ? `${item.equipmentName} calibration was due ${dueDateStr} and is now overdue.`
        : `${item.equipmentName} calibration is ${matchedThreshold.label} (due ${dueDateStr}).`

      // Idempotency: skip if an identical notification was already created recently
      if (existingMessages.has(message)) continue

      await createNotification({
        userId,
        title,
        message,
        type: isOverdue ? 'ERROR' : 'WARNING',
        link: '/dashboard/contractors/equipment',
      })

      summary.totalNotificationsCreated++
      existingMessages.add(message)
    }

    return NextResponse.json({ summary })
  } catch (error: unknown) {
    console.error('Error checking calibration:', error)
    return NextResponse.json(
      { error: 'Failed to check calibration status' },
      { status: 500 }
    )
  }
}
