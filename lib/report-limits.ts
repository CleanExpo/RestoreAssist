import { prisma } from "@/lib/prisma"
import { PRICING_CONFIG } from "@/lib/pricing"

export interface ReportLimitInfo {
  baseLimit: number
  addonReports: number
  monthlyReportsUsed: number
  availableReports: number
  hasUnlimited: boolean
}

/**
 * Get the user's report limit information
 */
export async function getUserReportLimits(userId: string): Promise<ReportLimitInfo> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      subscriptionStatus: true,
      subscriptionPlan: true,
      addonReports: true,
      monthlyReportsUsed: true,
      monthlyResetDate: true,
      createdAt: true,
    }
  })
  
  // Query add-on purchases separately (in case Prisma client hasn't been regenerated)
  let addonPurchases: Array<{ reportLimit: number; purchasedAt: Date }> = []
  try {
    addonPurchases = await prisma.addonPurchase.findMany({
      where: {
        userId: userId,
        status: 'COMPLETED'
      },
      select: {
        reportLimit: true,
        purchasedAt: true,
      }
    })
  } catch (error: any) {
    // If AddonPurchase model doesn't exist yet, just use addonReports field
  }

  if (!user) {
    throw new Error("User not found")
  }

  // Check if monthly usage needs to be reset
  const now = new Date()
  const shouldReset = !user.monthlyResetDate || 
    (user.monthlyResetDate && now > user.monthlyResetDate)

  if (shouldReset) {
    // Reset monthly usage
    const nextReset = new Date(now)
    nextReset.setMonth(nextReset.getMonth() + 1)
    nextReset.setDate(1) // First day of next month
    nextReset.setHours(0, 0, 0, 0)

    await prisma.user.update({
      where: { id: userId },
      data: {
        monthlyReportsUsed: 0,
        monthlyResetDate: nextReset,
      }
    })

    user.monthlyReportsUsed = 0
    user.monthlyResetDate = nextReset
  }

  // For trial users, use credits system
  if (user.subscriptionStatus === 'TRIAL') {
    return {
      baseLimit: 0,
      addonReports: 0,
      monthlyReportsUsed: 0,
      availableReports: 0,
      hasUnlimited: false,
    }
  }

  // For active subscribers, calculate limits
  if (user.subscriptionStatus === 'ACTIVE') {
    const plan = user.subscriptionPlan === 'Yearly Plan' 
      ? PRICING_CONFIG.pricing.yearly 
      : PRICING_CONFIG.pricing.monthly

    const baseLimit = plan.reportLimit || 0
    
    // Calculate add-on reports from purchases (sum of all completed purchases)
    // Signup bonus is stored in addonReports field, so we need to use the field value
    // to ensure signup bonus is included
    let addonReports = user.addonReports || 0
    
    // If we have purchases in the table, calculate from purchases and add signup bonus
    // Signup bonus (10 reports) is included in addonReports field when first subscribing
    if (addonPurchases && addonPurchases.length > 0) {
      // Sum up ALL completed add-on purchases
      const totalFromPurchases = addonPurchases.reduce((sum, purchase) => sum + purchase.reportLimit, 0)
      // Use the higher value between purchases and field (field includes signup bonus)
      // This ensures signup bonus is always included
      addonReports = Math.max(totalFromPurchases, addonReports)
    }
    
    const monthlyReportsUsed = user.monthlyReportsUsed || 0
    const totalLimit = baseLimit + addonReports
    const availableReports = Math.max(0, totalLimit - monthlyReportsUsed)

    return {
      baseLimit,
      addonReports,
      monthlyReportsUsed,
      availableReports,
      hasUnlimited: false,
    }
  }

  // No active subscription
  return {
    baseLimit: 0,
    addonReports: 0,
    monthlyReportsUsed: 0,
    availableReports: 0,
    hasUnlimited: false,
  }
}

/**
 * Check if user can create a report
 */
export async function canCreateReport(userId: string): Promise<{ allowed: boolean; reason?: string }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      subscriptionStatus: true,
      creditsRemaining: true,
    }
  })

  if (!user) {
    return { allowed: false, reason: "User not found" }
  }

  // Trial users use credits
  if (user.subscriptionStatus === 'TRIAL') {
    if (user.creditsRemaining && user.creditsRemaining > 0) {
      return { allowed: true }
    }
    return { 
      allowed: false, 
      reason: "Insufficient credits. Please upgrade your plan to create more reports." 
    }
  }

  // Active subscribers use monthly limits
  if (user.subscriptionStatus === 'ACTIVE') {
    const limits = await getUserReportLimits(userId)
    if (limits.availableReports > 0) {
      return { allowed: true }
    }
    return { 
      allowed: false, 
      reason: "Monthly report limit reached. Please purchase an add-on pack to create more reports." 
    }
  }

  return { 
    allowed: false, 
    reason: "Active subscription required to create reports." 
  }
}

/**
 * Increment monthly report usage
 */
export async function incrementReportUsage(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      subscriptionStatus: true,
      monthlyReportsUsed: true,
      monthlyResetDate: true,
    }
  })

  if (!user) {
    throw new Error("User not found")
  }

  // Only increment for active subscribers (trial users use credits)
  if (user.subscriptionStatus === 'ACTIVE') {
    const now = new Date()
    const shouldReset = !user.monthlyResetDate || 
      (user.monthlyResetDate && now > user.monthlyResetDate)

    if (shouldReset) {
      const nextReset = new Date(now)
      nextReset.setMonth(nextReset.getMonth() + 1)
      nextReset.setDate(1)
      nextReset.setHours(0, 0, 0, 0)

      await prisma.user.update({
        where: { id: userId },
        data: {
          monthlyReportsUsed: 1,
          monthlyResetDate: nextReset,
        }
      })
    } else {
      await prisma.user.update({
        where: { id: userId },
        data: {
          monthlyReportsUsed: {
            increment: 1
          }
        }
      })
    }
  }
}

