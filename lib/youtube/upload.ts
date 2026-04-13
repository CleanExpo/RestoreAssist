/**
 * YouTube Video Upload Service
 *
 * Downloads a video from a URL (Supabase storage) and uploads it
 * to YouTube using the Data API v3 resumable upload.
 *
 * Quota cost: 1,600 units per upload (daily budget: 10,000 units = ~6 uploads)
 */

import { Readable } from "stream";
import { getYouTubeClient } from "./auth";
import type { YouTubeMetadata } from "./metadata";

export interface YouTubeUploadResult {
  youtubeVideoId: string;
  youtubeUrl: string;
}

/**
 * Upload a video to YouTube.
 *
 * @param systemUserId - The system user who owns the YouTube OAuth token
 * @param videoUrl - URL to download the video from (Supabase storage)
 * @param metadata - Title, description, tags, category
 * @returns YouTube video ID and URL
 */
export async function uploadToYouTube(
  systemUserId: string,
  videoUrl: string,
  metadata: YouTubeMetadata,
): Promise<YouTubeUploadResult> {
  const youtube = await getYouTubeClient(systemUserId);

  // Download the video to a buffer
  console.log(`[youtube-upload] Downloading video from: ${videoUrl}`);
  const response = await fetch(videoUrl);

  if (!response.ok) {
    throw new Error(
      `Failed to download video: ${response.status} ${response.statusText}`,
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  console.log(
    `[youtube-upload] Downloaded ${(buffer.length / 1024 / 1024).toFixed(1)} MB`,
  );

  // Upload to YouTube using resumable upload
  console.log(`[youtube-upload] Uploading to YouTube: "${metadata.title}"`);
  const res = await youtube.videos.insert({
    part: ["snippet", "status"],
    requestBody: {
      snippet: {
        title: metadata.title,
        description: metadata.description,
        tags: metadata.tags,
        categoryId: metadata.categoryId,
        defaultLanguage: "en",
        defaultAudioLanguage: "en",
      },
      status: {
        privacyStatus: "public",
        selfDeclaredMadeForKids: false,
      },
    },
    media: {
      body: Readable.from(buffer),
    },
  });

  const videoId = res.data.id;
  if (!videoId) {
    throw new Error("YouTube upload returned no video ID");
  }

  const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
  console.log(`[youtube-upload] Uploaded successfully: ${youtubeUrl}`);

  return {
    youtubeVideoId: videoId,
    youtubeUrl,
  };
}

/**
 * Fetch YouTube video statistics for analytics collection.
 *
 * @param systemUserId - The system user who owns the YouTube OAuth token
 * @param videoIds - Array of YouTube video IDs to fetch stats for
 * @returns Map of videoId -> statistics
 */
export async function getYouTubeStats(
  systemUserId: string,
  videoIds: string[],
): Promise<Map<string, { views: number; likes: number; comments: number }>> {
  const youtube = await getYouTubeClient(systemUserId);
  const stats = new Map<
    string,
    { views: number; likes: number; comments: number }
  >();

  // YouTube API allows up to 50 video IDs per request
  const batchSize = 50;
  for (let i = 0; i < videoIds.length; i += batchSize) {
    const batch = videoIds.slice(i, i + batchSize);

    const res = await youtube.videos.list({
      part: ["statistics"],
      id: batch,
    });

    for (const item of res.data.items ?? []) {
      if (item.id && item.statistics) {
        stats.set(item.id, {
          views: parseInt(item.statistics.viewCount ?? "0", 10),
          likes: parseInt(item.statistics.likeCount ?? "0", 10),
          comments: parseInt(item.statistics.commentCount ?? "0", 10),
        });
      }
    }
  }

  return stats;
}
