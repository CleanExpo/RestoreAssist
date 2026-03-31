/**
 * Topic Selector — Weighted random selection from the ContentTopic bank
 *
 * Queries enabled topics that haven't been used in the last 30 days,
 * then applies weighted random selection so higher-weight topics
 * are more likely to be chosen.
 *
 * @module lib/content-pipeline/topic-selector
 */

import { prisma } from '@/lib/prisma'

// ─── TYPES ──────────────────────────────────────────────────────────────────

export interface SelectedTopic {
  id: string
  product: string
  angle: string
  platform: string
  duration: number
}

// ─── MAIN FUNCTION ──────────────────────────────────────────────────────────

/**
 * Select the next topic for automated content generation.
 *
 * 1. Queries ContentTopic where enabled = true
 * 2. Filters out topics where lastUsedAt is within the last 30 days
 * 3. Applies weighted random selection (higher weight = more likely)
 * 4. Returns topic details or null if no eligible topics
 */
export async function selectNextTopic(): Promise<SelectedTopic | null> {
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  // Fetch all enabled topics not used in the last 30 days
  const eligibleTopics = await prisma.contentTopic.findMany({
    where: {
      enabled: true,
      OR: [
        { lastUsedAt: null },
        { lastUsedAt: { lt: thirtyDaysAgo } },
      ],
    },
    select: {
      id: true,
      product: true,
      angle: true,
      platform: true,
      duration: true,
      weight: true,
    },
  })

  if (eligibleTopics.length === 0) {
    return null
  }

  // Weighted random selection
  const totalWeight = eligibleTopics.reduce((sum: number, t: { weight: number }) => sum + t.weight, 0)
  let randomValue = Math.random() * totalWeight

  for (const topic of eligibleTopics) {
    randomValue -= topic.weight
    if (randomValue <= 0) {
      return {
        id: topic.id,
        product: topic.product,
        angle: topic.angle,
        platform: topic.platform,
        duration: topic.duration,
      }
    }
  }

  // Fallback — should not be reached, but return last topic as safety
  const last = eligibleTopics[eligibleTopics.length - 1]
  return {
    id: last.id,
    product: last.product,
    angle: last.angle,
    platform: last.platform,
    duration: last.duration,
  }
}
