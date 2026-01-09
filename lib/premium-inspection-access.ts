/**
 * Premium Inspection Reports Access Control
 *
 * Feature gate utilities for the $49/month Premium Inspection Reports add-on
 * Controls access to the 3-stakeholder PDF generator functionality
 */

import { prisma } from '@/lib/db'

/**
 * Check if user has premium inspection reports subscription
 */
export async function hasPremiumInspectionReports(userId: string): Promise<boolean> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { hasPremiumInspectionReports: true },
    })

    return user?.hasPremiumInspectionReports ?? false
  } catch (error) {
    console.error('Error checking premium status:', error)
    return false
  }
}

/**
 * Enable premium inspection reports for user
 * Called when subscription is activated via Stripe
 */
export async function enablePremiumInspectionReports(userId: string): Promise<boolean> {
  try {
    await prisma.user.update({
      where: { id: userId },
      data: { hasPremiumInspectionReports: true },
    })
    return true
  } catch (error) {
    console.error('Error enabling premium:', error)
    return false
  }
}

/**
 * Disable premium inspection reports for user
 * Called when subscription is cancelled or expires
 */
export async function disablePremiumInspectionReports(userId: string): Promise<boolean> {
  try {
    await prisma.user.update({
      where: { id: userId },
      data: { hasPremiumInspectionReports: false },
    })
    return true
  } catch (error) {
    console.error('Error disabling premium:', error)
    return false
  }
}

/**
 * Require premium - throws error if user doesn't have access
 * Use in API routes or server actions
 */
export async function requirePremiumInspectionReports(userId: string): Promise<void> {
  const hasPremium = await hasPremiumInspectionReports(userId)

  if (!hasPremium) {
    throw new Error('Premium Inspection Reports subscription required')
  }
}

/**
 * Get premium subscription status and details
 */
export async function getPremiumStatus(userId: string) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        hasPremiumInspectionReports: true,
        subscriptionStatus: true,
        subscriptionEndsAt: true,
      },
    })

    return {
      hasAccess: user?.hasPremiumInspectionReports ?? false,
      subscriptionStatus: user?.subscriptionStatus,
      subscriptionEndsAt: user?.subscriptionEndsAt,
      isActive: user?.hasPremiumInspectionReports && user?.subscriptionStatus === 'ACTIVE',
    }
  } catch (error) {
    console.error('Error getting premium status:', error)
    return {
      hasAccess: false,
      subscriptionStatus: null,
      subscriptionEndsAt: null,
      isActive: false,
    }
  }
}

/**
 * Get list of all users with premium subscription
 * Useful for analytics and reporting
 */
export async function getPremiumUsers(limit: number = 100, offset: number = 0) {
  try {
    const users = await prisma.user.findMany({
      where: { hasPremiumInspectionReports: true },
      select: {
        id: true,
        email: true,
        name: true,
        businessName: true,
        subscriptionEndsAt: true,
      },
      take: limit,
      skip: offset,
    })

    const total = await prisma.user.count({
      where: { hasPremiumInspectionReports: true },
    })

    return { users, total, hasMore: offset + limit < total }
  } catch (error) {
    console.error('Error getting premium users:', error)
    return { users: [], total: 0, hasMore: false }
  }
}

/**
 * Feature flag check - returns boolean instead of throwing
 * Useful for conditional UI rendering
 */
export async function canAccessPremiumPDFGenerator(userId: string): Promise<boolean> {
  try {
    return await hasPremiumInspectionReports(userId)
  } catch {
    return false
  }
}

export default {
  hasPremiumInspectionReports,
  enablePremiumInspectionReports,
  disablePremiumInspectionReports,
  requirePremiumInspectionReports,
  getPremiumStatus,
  getPremiumUsers,
  canAccessPremiumPDFGenerator,
}
