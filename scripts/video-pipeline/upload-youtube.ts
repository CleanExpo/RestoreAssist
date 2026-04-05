/**
 * upload-youtube.ts
 * Uploads a rendered MP4 to YouTube via the YouTube Data API v3 (googleapis).
 * Uses OAuth2 with a long-lived refresh token stored in YOUTUBE_REFRESH_TOKEN.
 *
 * Required env vars:
 *   YOUTUBE_CLIENT_ID
 *   YOUTUBE_CLIENT_SECRET
 *   YOUTUBE_REFRESH_TOKEN
 */

import fs from "fs";
import path from "path";

export interface YouTubeUploadOptions {
  /** Absolute path to the video MP4 file */
  videoPath: string;
  /** Video title (max 100 chars) */
  title: string;
  /** Video description */
  description: string;
  /** Tags array */
  tags?: string[];
  /** Optional thumbnail image path (JPEG/PNG, max 2MB) */
  thumbnailPath?: string;
  /** Privacy status (default: private — safe default until manually reviewed) */
  privacyStatus?: "private" | "unlisted" | "public";
  /** YouTube category ID (default: "28" = Science & Technology) */
  categoryId?: string;
}

export interface YouTubeUploadResult {
  videoId: string;
  youtubeUrl: string;
  title: string;
  privacyStatus: string;
}

/** YouTube video resource snippet shape (subset we use) */
interface YouTubeVideoSnippet {
  title: string;
  description: string;
  tags: string[];
  categoryId: string;
}

/** YouTube video resource status shape */
interface YouTubeVideoStatus {
  privacyStatus: string;
}

/**
 * Upload a video file to YouTube.
 * Returns the YouTube video ID and watch URL.
 */
export async function uploadToYouTube(
  options: YouTubeUploadOptions
): Promise<YouTubeUploadResult> {
  // Validate env vars
  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  const refreshToken = process.env.YOUTUBE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "Missing YouTube OAuth2 credentials. " +
        "Set YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, and YOUTUBE_REFRESH_TOKEN " +
        "in your .env.local file or system environment."
    );
  }

  // Dynamic import — graceful error if googleapis not installed
  let google: typeof import("googleapis").google;
  try {
    const googModule = await import("googleapis");
    google = googModule.google;
  } catch {
    throw new Error(
      "googleapis is not installed. Run: npm install googleapis"
    );
  }

  if (!fs.existsSync(options.videoPath)) {
    throw new Error(`Video file not found: ${options.videoPath}`);
  }

  const {
    videoPath,
    title,
    description,
    tags = [],
    thumbnailPath,
    privacyStatus = "private",
    categoryId = "28",
  } = options;

  // Set up OAuth2 client
  const auth = new google.auth.OAuth2(clientId, clientSecret);
  auth.setCredentials({ refresh_token: refreshToken });

  const youtube = google.youtube({ version: "v3", auth });

  console.log(`[youtube] Uploading "${title}" from ${videoPath}...`);

  const fileSize = fs.statSync(videoPath).size;
  const fileSizeMB = (fileSize / 1_048_576).toFixed(1);
  console.log(`[youtube] File size: ${fileSizeMB} MB`);

  const snippet: YouTubeVideoSnippet = {
    title: title.substring(0, 100),
    description,
    tags,
    categoryId,
  };

  const status: YouTubeVideoStatus = { privacyStatus };

  const insertResponse = await youtube.videos.insert({
    part: ["snippet", "status"],
    requestBody: { snippet, status },
    media: {
      mimeType: "video/mp4",
      body: fs.createReadStream(videoPath),
    },
  });

  const videoId = insertResponse.data.id;
  if (!videoId) {
    throw new Error(
      "YouTube upload succeeded but no video ID returned in response"
    );
  }

  console.log(`[youtube] Uploaded successfully. Video ID: ${videoId}`);

  // Upload thumbnail if provided
  if (thumbnailPath) {
    if (!fs.existsSync(thumbnailPath)) {
      console.warn(
        `[youtube] Thumbnail file not found at ${thumbnailPath}, skipping.`
      );
    } else {
      const thumbExt = path.extname(thumbnailPath).toLowerCase();
      const mimeType =
        thumbExt === ".png"
          ? "image/png"
          : thumbExt === ".jpg" || thumbExt === ".jpeg"
          ? "image/jpeg"
          : "image/jpeg";

      console.log(`[youtube] Uploading thumbnail from ${thumbnailPath}...`);
      await youtube.thumbnails.set({
        videoId,
        media: {
          mimeType,
          body: fs.createReadStream(thumbnailPath),
        },
      });
      console.log("[youtube] Thumbnail uploaded.");
    }
  }

  const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
  console.log(`[youtube] Video available at: ${youtubeUrl}`);

  return { videoId, youtubeUrl, title, privacyStatus };
}
