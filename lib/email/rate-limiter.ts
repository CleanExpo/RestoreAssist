import { prisma } from '@/lib/prisma';

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}

export class RateLimiter {
  private readonly maxEmailsPerHour = 50;

  /**
   * Check if user is within rate limit
   */
  async checkLimit(userId: string): Promise<RateLimitResult> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const emailCount = await prisma.emailAudit.count({
      where: {
        userId,
        sentAt: {
          gte: oneHourAgo,
        },
        success: true,
      },
    });

    const remaining = Math.max(0, this.maxEmailsPerHour - emailCount);
    const resetAt = new Date(Date.now() + 60 * 60 * 1000);

    return {
      allowed: emailCount < this.maxEmailsPerHour,
      remaining,
      resetAt,
    };
  }

  /**
   * Increment count (called after successful send)
   */
  async incrementCount(userId: string): Promise<void> {
    return;
  }

  /**
   * Get current rate limit status
   */
  async getStatus(userId: string): Promise<RateLimitResult> {
    return await this.checkLimit(userId);
  }
}
