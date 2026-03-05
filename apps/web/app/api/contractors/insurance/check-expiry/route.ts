import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createNotification } from '@/lib/notifications'

interface ExpiryCheckSummary {
  expired: number
  expiring14: number
  expiring30: number
  expiring60: number
  totalNotificationsCreated: number
}

/**
 * POST /api/contractors/insurance/check-expiry
 *
 * Scans the current user's insurance & licence records for upcoming/past
 * expiry dates and creates idempotent in-app notifications at 60/30/14 day
 * thresholds. Sets lastNotified flags to prevent duplicate notifications.
 */
export async function POST() {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = session.user.id
    const now = new Date()
    const summary: ExpiryCheckSummary = {
      expired: 0,
      expiring14: 0,
      expiring30: 0,
      expiring60: 0,
      totalNotificationsCreated: 0,
    }

    // ── Check Insurance Records ──
    const insurances = await prisma.contractorInsurance.findMany({
      where: { userId, isActive: true },
    })

    for (const ins of insurances) {
      const daysUntilExpiry = Math.ceil(
        (ins.expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      )

      const expiryStr = ins.expiryDate.toLocaleDateString('en-AU')
      const typeLabel = INSURANCE_TYPE_LABELS[ins.insuranceType] || ins.insuranceType

      if (daysUntilExpiry < 0) {
        summary.expired++
        if (!ins.lastNotified14) {
          await createNotification({
            userId,
            title: 'Insurance Expired',
            message: `Your ${typeLabel} insurance expired on ${expiryStr}. Please renew immediately.`,
            type: 'ERROR',
            link: '/dashboard/contractors/insurance',
          })
          await prisma.contractorInsurance.update({
            where: { id: ins.id },
            data: { lastNotified14: true, lastNotified30: true, lastNotified60: true },
          })
          summary.totalNotificationsCreated++
        }
      } else if (daysUntilExpiry <= 14 && !ins.lastNotified14) {
        summary.expiring14++
        await createNotification({
          userId,
          title: 'Insurance Expiring Soon',
          message: `Your ${typeLabel} insurance expires on ${expiryStr} (${daysUntilExpiry} days).`,
          type: 'ERROR',
          link: '/dashboard/contractors/insurance',
        })
        await prisma.contractorInsurance.update({
          where: { id: ins.id },
          data: { lastNotified14: true, lastNotified30: true, lastNotified60: true },
        })
        summary.totalNotificationsCreated++
      } else if (daysUntilExpiry <= 30 && !ins.lastNotified30) {
        summary.expiring30++
        await createNotification({
          userId,
          title: 'Insurance Expiring Soon',
          message: `Your ${typeLabel} insurance expires on ${expiryStr} (${daysUntilExpiry} days).`,
          type: 'WARNING',
          link: '/dashboard/contractors/insurance',
        })
        await prisma.contractorInsurance.update({
          where: { id: ins.id },
          data: { lastNotified30: true, lastNotified60: true },
        })
        summary.totalNotificationsCreated++
      } else if (daysUntilExpiry <= 60 && !ins.lastNotified60) {
        summary.expiring60++
        await createNotification({
          userId,
          title: 'Insurance Expiry Reminder',
          message: `Your ${typeLabel} insurance expires on ${expiryStr} (${daysUntilExpiry} days).`,
          type: 'WARNING',
          link: '/dashboard/contractors/insurance',
        })
        await prisma.contractorInsurance.update({
          where: { id: ins.id },
          data: { lastNotified60: true },
        })
        summary.totalNotificationsCreated++
      }
    }

    // ── Check Licence Records ──
    const licences = await prisma.contractorLicence.findMany({
      where: { userId, isActive: true, expiryDate: { not: null } },
    })

    for (const lic of licences) {
      if (!lic.expiryDate) continue

      const daysUntilExpiry = Math.ceil(
        (lic.expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      )

      const expiryStr = lic.expiryDate.toLocaleDateString('en-AU')
      const typeLabel = LICENCE_TYPE_LABELS[lic.licenceType] || lic.licenceType

      if (daysUntilExpiry < 0) {
        summary.expired++
        if (!lic.lastNotified14) {
          await createNotification({
            userId,
            title: 'Licence Expired',
            message: `Your ${typeLabel} expired on ${expiryStr}. Please renew immediately.`,
            type: 'ERROR',
            link: '/dashboard/contractors/licences',
          })
          await prisma.contractorLicence.update({
            where: { id: lic.id },
            data: { lastNotified14: true, lastNotified30: true, lastNotified60: true },
          })
          summary.totalNotificationsCreated++
        }
      } else if (daysUntilExpiry <= 14 && !lic.lastNotified14) {
        summary.expiring14++
        await createNotification({
          userId,
          title: 'Licence Expiring Soon',
          message: `Your ${typeLabel} expires on ${expiryStr} (${daysUntilExpiry} days).`,
          type: 'ERROR',
          link: '/dashboard/contractors/licences',
        })
        await prisma.contractorLicence.update({
          where: { id: lic.id },
          data: { lastNotified14: true, lastNotified30: true, lastNotified60: true },
        })
        summary.totalNotificationsCreated++
      } else if (daysUntilExpiry <= 30 && !lic.lastNotified30) {
        summary.expiring30++
        await createNotification({
          userId,
          title: 'Licence Expiring Soon',
          message: `Your ${typeLabel} expires on ${expiryStr} (${daysUntilExpiry} days).`,
          type: 'WARNING',
          link: '/dashboard/contractors/licences',
        })
        await prisma.contractorLicence.update({
          where: { id: lic.id },
          data: { lastNotified30: true, lastNotified60: true },
        })
        summary.totalNotificationsCreated++
      } else if (daysUntilExpiry <= 60 && !lic.lastNotified60) {
        summary.expiring60++
        await createNotification({
          userId,
          title: 'Licence Expiry Reminder',
          message: `Your ${typeLabel} expires on ${expiryStr} (${daysUntilExpiry} days).`,
          type: 'WARNING',
          link: '/dashboard/contractors/licences',
        })
        await prisma.contractorLicence.update({
          where: { id: lic.id },
          data: { lastNotified60: true },
        })
        summary.totalNotificationsCreated++
      }
    }

    return NextResponse.json({ summary })
  } catch (error: unknown) {
    console.error('Error checking expiry:', error)
    return NextResponse.json(
      { error: 'Failed to check expiry status' },
      { status: 500 }
    )
  }
}

const INSURANCE_TYPE_LABELS: Record<string, string> = {
  PUBLIC_LIABILITY: 'Public Liability',
  PROFESSIONAL_INDEMNITY: 'Professional Indemnity',
  WORKERS_COMP: "Workers' Compensation",
  OTHER: 'Other',
}

const LICENCE_TYPE_LABELS: Record<string, string> = {
  BUILDERS_LICENCE: "Builder's Licence",
  WHS_WHITE_CARD: 'WHS White Card',
  ELECTRICAL: 'Electrical Licence',
  PLUMBING: 'Plumbing Licence',
  IICRC_MEMBERSHIP: 'IICRC Membership',
  NRPG_MEMBERSHIP: 'NRPG Membership',
  ABN_REGISTRATION: 'ABN Registration',
  OTHER: 'Other',
}
