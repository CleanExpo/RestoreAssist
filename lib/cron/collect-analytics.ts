/**
 * YouTube Analytics Collection
 *
 * Fetches view/like/comment counts for all POSTED YouTube videos
 * within the last 90 days and creates ContentAnalytics snapshots.
 *
 * Called by: /api/cron/collect-analytics (daily at noon AEST)
 */

import { prisma } from "@/lib/prisma";
import { getYouTubeStats } from "@/lib/youtube/upload";
import type { CronJobResult } from "./runner";

export async function collectAnalytics(): Promise<CronJobResult> {
  const systemUserId = process.env.CONTENT_SYSTEM_USER_ID;
  if (!systemUserId) {
    return {
      itemsProcessed: 0,
      metadata: { error: "CONTENT_SYSTEM_USER_ID not configured" },
    };
  }

  // Find all YouTube posts from the last 90 days
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  const posts = await prisma.contentPost.findMany({
    where: {
      platform: "youtube",
      status: "POSTED",
      externalPostId: { not: null },
      postedAt: { gte: cutoff },
    },
    select: {
      id: true,
      externalPostId: true,
    },
  });

  if (posts.length === 0) {
    return {
      itemsProcessed: 0,
      metadata: { message: "No YouTube posts to collect analytics for" },
    };
  }

  // Fetch stats from YouTube (batched, up to 50 per API call)
  const videoIds = posts
    .map((p) => p.externalPostId)
    .filter((id): id is string => id !== null);

  let stats: Map<string, { views: number; likes: number; comments: number }>;

  try {
    stats = await getYouTubeStats(systemUserId, videoIds);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      "[collect-analytics] Failed to fetch YouTube stats:",
      message,
    );
    return { itemsProcessed: 0, metadata: { error: message } };
  }

  // Create analytics snapshots
  let created = 0;

  for (const post of posts) {
    if (!post.externalPostId) continue;

    const videoStats = stats.get(post.externalPostId);
    if (!videoStats) continue;

    await prisma.contentAnalytics.create({
      data: {
        postId: post.id,
        views: videoStats.views,
        likes: videoStats.likes,
        comments: videoStats.comments,
        shares: 0, // YouTube doesn't expose share count via API
        reach: videoStats.views, // Approximate reach = views
      },
    });

    created++;
  }

  return {
    itemsProcessed: created,
    metadata: {
      postsTracked: posts.length,
      analyticsCreated: created,
      statsRetrieved: stats.size,
    },
  };
}
