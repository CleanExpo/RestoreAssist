/**
 * Server-side notification helper
 * Creates in-app notifications for users. All functions are non-blocking
 * and will never throw — they catch and log errors internally.
 */

import { prisma } from '@/lib/prisma'

type NotificationType = 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR'

interface CreateNotificationInput {
  userId: string
  title: string
  message: string
  type?: NotificationType
  link?: string
}

/**
 * Create a single notification for a user.
 * Non-blocking — catches errors internally.
 */
export async function createNotification(input: CreateNotificationInput): Promise<void> {
  try {
    await prisma.notification.create({
      data: {
        userId: input.userId,
        title: input.title,
        message: input.message,
        type: input.type || 'INFO',
        link: input.link,
      },
    })
  } catch (err) {
    // Don't throw — notification creation should never break the primary operation
    console.error('[Notifications] Failed to create notification:', err)
  }
}

/**
 * Create the same notification for multiple users.
 * Non-blocking — catches errors internally.
 */
export async function createNotificationForUsers(
  userIds: string[],
  notification: Omit<CreateNotificationInput, 'userId'>
): Promise<void> {
  try {
    await prisma.notification.createMany({
      data: userIds.map((userId) => ({
        userId,
        title: notification.title,
        message: notification.message,
        type: notification.type || 'INFO',
        link: notification.link,
      })),
    })
  } catch (err) {
    console.error('[Notifications] Failed to create bulk notifications:', err)
  }
}

// ── Pre-built notification factories ──

export function notifyReportCompleted(
  adminUserId: string,
  completedByName: string,
  jobNumber: string,
  reportId: string
) {
  return createNotification({
    userId: adminUserId,
    title: 'Report Completed',
    message: `${completedByName} completed report ${jobNumber}`,
    type: 'SUCCESS',
    link: `/dashboard/reports/${reportId}`,
  })
}

export function notifyTeamMemberJoined(
  adminUserId: string,
  memberName: string,
  role: string
) {
  return createNotification({
    userId: adminUserId,
    title: 'New Team Member',
    message: `${memberName} joined your team as ${role}`,
    type: 'INFO',
    link: '/dashboard/team',
  })
}

export function notifyPaymentFailed(userId: string, amount: string) {
  return createNotification({
    userId,
    title: 'Payment Failed',
    message: `Your payment of ${amount} could not be processed. Please update your payment method.`,
    type: 'ERROR',
    link: '/dashboard/subscription',
  })
}

export function notifySubscriptionCancelled(userId: string, expiresAt: string) {
  return createNotification({
    userId,
    title: 'Subscription Cancelled',
    message: `Your subscription has been cancelled. Access continues until ${expiresAt}.`,
    type: 'WARNING',
    link: '/dashboard/subscription',
  })
}

export function notifyWelcome(userId: string) {
  return createNotification({
    userId,
    title: 'Welcome to RestoreAssist',
    message: 'Get started by creating your first report or inviting your team members.',
    type: 'INFO',
    link: '/dashboard/reports/new',
  })
}

export function notifyTrialExpiring(userId: string, daysLeft: number) {
  return createNotification({
    userId,
    title: 'Trial Expiring Soon',
    message: `Your free trial expires in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}. Subscribe to keep access.`,
    type: 'WARNING',
    link: '/dashboard/subscription',
  })
}
