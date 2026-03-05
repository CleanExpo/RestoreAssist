import { prisma } from '@/lib/prisma'
import { getEffectiveSubscription, getOrganizationOwner } from "@/lib/organization-credits"

// In-memory rate limiting store
// Structure: Map<userId, { count: number, resetTime: number }>
const rateLimitStore = new Map<string, { count: number; resetTime: number }>()

/**
 * Check rate limit (10 operations per hour per user)
 */
export function rateLimit(
  userId: string,
  operation: string
): { allowed: boolean; retryAfter?: number } {
  const now = Date.now()
  const entry = rateLimitStore.get(userId)

  if (!entry) {
    // First operation
    rateLimitStore.set(userId, {
      count: 1,
      resetTime: now + 3600000, // 1 hour from now
    })
    return { allowed: true }
  }

  if (now > entry.resetTime) {
    // Reset has occurred
    rateLimitStore.set(userId, {
      count: 1,
      resetTime: now + 3600000,
    })
    return { allowed: true }
  }

  if (entry.count >= 10) {
    // Rate limit exceeded
    const retryAfter = Math.ceil((entry.resetTime - now) / 1000)
    return { allowed: false, retryAfter }
  }

  // Increment counter
  entry.count++
  return { allowed: true }
}

/**
 * Check if user can create bulk reports (check credits)
 */
export async function checkBulkCreateCredits(
  userId: string,
  reportCount: number
): Promise<{ allowed: boolean; creditsRequired: number; creditsAvailable: number; reason?: string }> {
  // Get effective subscription (Admin's for Managers/Technicians)
  const effectiveSub = await getEffectiveSubscription(userId)
  
  if (!effectiveSub) {
    return {
      allowed: false,
      creditsRequired: reportCount,
      creditsAvailable: 0,
      reason: 'User not found',
    }
  }

  // Trial users: 1 credit per duplicate
  if (effectiveSub.subscriptionStatus === 'TRIAL') {
    const creditsRequired = reportCount
    const creditsAvailable = effectiveSub.creditsRemaining || 0

    if (creditsAvailable < creditsRequired) {
      return {
        allowed: false,
        creditsRequired,
        creditsAvailable,
        reason: `Insufficient credits. You have ${creditsAvailable} credits but need ${creditsRequired}.`,
      }
    }

    return {
      allowed: true,
      creditsRequired,
      creditsAvailable,
    }
  }

  // Active subscribers don't need credits for bulk operations
  if (effectiveSub.subscriptionStatus === 'ACTIVE') {
    return {
      allowed: true,
      creditsRequired: 0,
      creditsAvailable: 0,
    }
  }

  return {
    allowed: false,
    creditsRequired: reportCount,
    creditsAvailable: 0,
    reason: 'Active subscription required for bulk operations',
  }
}

/**
 * Deduct bulk operation credits (atomic operation)
 */
export async function deductBulkCredits(
  userId: string,
  count: number,
  reason: string
): Promise<{ success: boolean; creditsRemaining: number }> {
  try {
    // Get the organization owner (Admin) - they own the credits
    const ownerId = await getOrganizationOwner(userId)
    const targetUserId = ownerId || userId

    const user = await prisma.user.update({
      where: { id: targetUserId },
      data: {
        creditsRemaining: {
          decrement: count,
        },
        totalCreditsUsed: {
          increment: count,
        },
      },
      select: {
        creditsRemaining: true,
      },
    })

    return {
      success: true,
      creditsRemaining: user.creditsRemaining || 0,
    }
  } catch (error) {
    console.error(`Error deducting credits for user ${userId}:`, error)
    return {
      success: false,
      creditsRemaining: 0,
    }
  }
}

/**
 * Validate that user owns all specified report IDs
 */
export async function validateReportIds(
  ids: string[],
  userId: string
): Promise<string[]> {
  if (!ids || ids.length === 0) {
    return []
  }

  const reports = await prisma.report.findMany({
    where: {
      id: { in: ids },
      userId: userId,
    },
    select: { id: true },
  })

  return reports.map(r => r.id)
}

/**
 * Check which report IDs don't belong to user
 */
export async function getUnauthorizedReportIds(
  ids: string[],
  userId: string
): Promise<string[]> {
  if (!ids || ids.length === 0) {
    return []
  }

  const authorized = await validateReportIds(ids, userId)
  const authorizedSet = new Set(authorized)

  return ids.filter(id => !authorizedSet.has(id))
}

/**
 * Aggregate multiple errors into a formatted list
 */
export function aggregateErrors(
  errors: Array<{ reportId: string; error: string }>
): Array<{ reportId: string; error: string }> {
  // Remove duplicates and format
  const seen = new Set<string>()

  return errors.filter(err => {
    const key = `${err.reportId}:${err.error}`
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
}

/**
 * Format standard bulk response
 */
export function formatBulkResponse(
  success: boolean,
  count: number,
  errors?: Array<{ reportId: string; error: string }>,
  additionalData?: Record<string, any>
) {
  const response: any = {
    success,
    operatedCount: count,
    failedCount: errors?.length || 0,
  }

  if (errors && errors.length > 0) {
    response.errors = aggregateErrors(errors)
  }

  return {
    ...response,
    ...additionalData,
  }
}

/**
 * Generate unique report number suffix
 */
export async function getNextReportNumberSuffix(userId: string): Promise<string> {
  try {
    const lastReport = await prisma.report.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { reportNumber: true },
    })

    if (!lastReport || !lastReport.reportNumber) {
      return '001'
    }

    // Extract numeric suffix
    const match = lastReport.reportNumber.match(/(\d+)$/)
    if (match) {
      const num = parseInt(match[1]) + 1
      return num.toString().padStart(3, '0')
    }

    return '001'
  } catch (error) {
    console.error('Error getting next report number suffix:', error)
    return 'COPY'
  }
}

/**
 * Create audit log entry
 */
export async function createAuditLogEntry(
  userId: string,
  reportId: string,
  action: string,
  details?: Record<string, any>
): Promise<void> {
  try {
    // This assumes you have an AuditLog model in your schema
    // If not, you can store in report's versionHistory field
    console.log(`[Audit] User: ${userId}, Report: ${reportId}, Action: ${action}`, details)
  } catch (error) {
    console.error('Error creating audit log:', error)
  }
}

/**
 * Validate status value
 */
export function isValidReportStatus(status: string): boolean {
  const validStatuses = ['DRAFT', 'PENDING', 'APPROVED', 'COMPLETED', 'ARCHIVED']
  return validStatuses.includes(status.toUpperCase())
}

/**
 * Check batch size constraints
 */
export function validateBatchSize(
  count: number,
  operation: 'export-excel' | 'export-zip' | 'duplicate' | 'status-update'
): { valid: boolean; maxAllowed: number; message?: string } {
  const limits: Record<string, number> = {
    'export-excel': 100,
    'export-zip': 25,
    'duplicate': 50,
    'status-update': 100,
  }

  const limit = limits[operation] || 100

  if (count > limit) {
    return {
      valid: false,
      maxAllowed: limit,
      message: `Maximum ${limit} reports allowed for ${operation}. You provided ${count}.`,
    }
  }

  if (count <= 0) {
    return {
      valid: false,
      maxAllowed: limit,
      message: 'At least 1 report must be provided',
    }
  }

  return {
    valid: true,
    maxAllowed: limit,
  }
}

/**
 * Clean up rate limit store (run periodically)
 */
export function cleanupRateLimitStore(): number {
  const now = Date.now()
  let cleaned = 0

  for (const [userId, entry] of rateLimitStore.entries()) {
    if (now > entry.resetTime) {
      rateLimitStore.delete(userId)
      cleaned++
    }
  }

  return cleaned
}

/**
 * Get current rate limit status for user
 */
export function getRateLimitStatus(userId: string): { used: number; remaining: number; resetTime: number } {
  const entry = rateLimitStore.get(userId)

  if (!entry) {
    return {
      used: 0,
      remaining: 10,
      resetTime: Date.now() + 3600000,
    }
  }

  const now = Date.now()
  if (now > entry.resetTime) {
    // Reset has occurred
    return {
      used: 0,
      remaining: 10,
      resetTime: Date.now() + 3600000,
    }
  }

  return {
    used: entry.count,
    remaining: Math.max(0, 10 - entry.count),
    resetTime: entry.resetTime,
  }
}
