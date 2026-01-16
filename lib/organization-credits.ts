import { prisma } from "@/lib/prisma"

/**
 * Get the organization owner (Admin) for a user
 * Returns the user's own ID if they are an Admin or don't have an organization
 */
export async function getOrganizationOwner(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      organizationId: true,
      organization: {
        select: {
          ownerId: true
        }
      }
    }
  })

  if (!user) {
    return null
  }

  // If user is ADMIN, they are the owner
  if (user.role === "ADMIN") {
    return userId
  }

  // If user has an organization, return the owner's ID
  if (user.organizationId && user.organization?.ownerId) {
    return user.organization.ownerId
  }

  // No organization, return null
  return null
}

/**
 * Get the effective subscription status and credits for a user
 * For Managers/Technicians, returns the Admin's subscription/credits
 * For Admins, returns their own subscription/credits
 */
export async function getEffectiveSubscription(userId: string): Promise<{
  subscriptionStatus: string | null
  creditsRemaining: number | null
  subscriptionPlan: string | null
  monthlyReportsUsed: number | null
  monthlyResetDate: Date | null
  addonReports: number | null
} | null> {
  const ownerId = await getOrganizationOwner(userId)
  
  if (!ownerId) {
    // User has no organization, return their own data
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        subscriptionStatus: true,
        creditsRemaining: true,
        subscriptionPlan: true,
        monthlyReportsUsed: true,
        monthlyResetDate: true,
        addonReports: true
      }
    })
    
    return user ? {
      subscriptionStatus: user.subscriptionStatus,
      creditsRemaining: user.creditsRemaining,
      subscriptionPlan: user.subscriptionPlan,
      monthlyReportsUsed: user.monthlyReportsUsed,
      monthlyResetDate: user.monthlyResetDate,
      addonReports: user.addonReports
    } : null
  }

  // Get the owner's (Admin's) subscription data
  const owner = await prisma.user.findUnique({
    where: { id: ownerId },
    select: {
      subscriptionStatus: true,
      creditsRemaining: true,
      subscriptionPlan: true,
      monthlyReportsUsed: true,
      monthlyResetDate: true,
      addonReports: true
    }
  })

  return owner ? {
    subscriptionStatus: owner.subscriptionStatus,
    creditsRemaining: owner.creditsRemaining,
    subscriptionPlan: owner.subscriptionPlan,
    monthlyReportsUsed: owner.monthlyReportsUsed,
    monthlyResetDate: owner.monthlyResetDate,
    addonReports: owner.addonReports
  } : null
}
