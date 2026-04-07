/**
 * Content Distribution — YouTube Upload
 *
 * Finds ContentJobs in VIDEO_READY state, generates YouTube metadata,
 * uploads the video, and creates ContentPost records.
 *
 * Called by: /api/cron/distribute-content (every 15 minutes)
 */

import { prisma } from "@/lib/prisma";
import { uploadToYouTube } from "@/lib/youtube/upload";
import { generateYouTubeMetadata } from "@/lib/youtube/metadata";
import type { CronJobResult } from "./runner";

export async function distributeContent(): Promise<CronJobResult> {
  const systemUserId = process.env.CONTENT_SYSTEM_USER_ID;
  if (!systemUserId) {
    return {
      itemsProcessed: 0,
      metadata: { error: "CONTENT_SYSTEM_USER_ID not configured" },
    };
  }

  // Find VIDEO_READY jobs that don't already have a YouTube ContentPost
  const readyJobs = await prisma.contentJob.findMany({
    where: {
      status: "VIDEO_READY",
      videoUrl: { not: null },
      // Only jobs that don't already have a YouTube post
      posts: {
        none: {
          platform: "youtube",
        },
      },
    },
    select: {
      id: true,
      videoUrl: true,
      hook: true,
      caption: true,
      hashtags: true,
      product: true,
      voiceoverText: true,
      cta: true,
    },
    take: 3, // Process max 3 per cycle to stay within YouTube quota
  });

  if (readyJobs.length === 0) {
    return {
      itemsProcessed: 0,
      metadata: { message: "No videos ready for distribution" },
    };
  }

  let uploaded = 0;
  let failed = 0;

  for (const job of readyJobs) {
    try {
      if (!job.videoUrl) continue;

      // Generate YouTube-specific metadata
      const metadata = generateYouTubeMetadata({
        hook: job.hook,
        caption: job.caption,
        hashtags: job.hashtags,
        product: job.product,
        voiceoverText: job.voiceoverText,
        cta: job.cta,
      });

      // Upload to YouTube
      const result = await uploadToYouTube(
        systemUserId,
        job.videoUrl,
        metadata,
      );

      // Create ContentPost record
      await prisma.contentPost.create({
        data: {
          jobId: job.id,
          platform: "youtube",
          externalPostId: result.youtubeVideoId,
          postUrl: result.youtubeUrl,
          status: "POSTED",
          postedAt: new Date(),
        },
      });

      // Update ContentJob status to POSTED
      await prisma.contentJob.update({
        where: { id: job.id },
        data: { status: "POSTED" },
      });

      uploaded++;
      console.log(
        `[distribute-content] Uploaded job ${job.id} → ${result.youtubeUrl}`,
      );
    } catch (err) {
      failed++;
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[distribute-content] Failed to upload job ${job.id}:`,
        message,
      );

      // Mark the job as failed if YouTube upload fails
      await prisma.contentJob
        .update({
          where: { id: job.id },
          data: {
            errorMessage: `YouTube upload failed: ${message}`,
            // Don't change status — keep VIDEO_READY so it retries next cycle
          },
        })
        .catch(() => {});
    }
  }

  return {
    itemsProcessed: uploaded,
    metadata: { uploaded, failed, total: readyJobs.length },
  };
}
