#!/usr/bin/env node
/**
 * RestoreAssist Video Uploader
 *
 * Uploads generated MP4 files to the appropriate host and updates the registry:
 *  - Cloudinary (app-embedded videos: login, signup, etc.)
 *  - YouTube (help/training videos)
 *
 * Usage:
 *   # Cloudinary (default)
 *   npx tsx scripts/video-upload.ts --file ./videos/restoreassist-login-v1.mp4 \
 *     --title "Signing in to RestoreAssist" --slug setup-wizard-signin
 *
 *   # YouTube (help videos)
 *   npx tsx scripts/video-upload.ts --file ./videos/help-billing.mp4 \
 *     --title "Trial, paid tiers, and Stripe Checkout" --slug help-billing \
 *     --host youtube --privacy unlisted
 *
 *   # Update registry only (if already uploaded manually)
 *   npx tsx scripts/video-upload.ts --slug setup-wizard-signin \
 *     --youtube-id ABC123xyz --title "Signing in"
 */

import fs from "fs/promises";
import path from "path";
import { uploadFileToCloudinary } from "@/lib/cloudinary";

// ── CLI ─────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag: string) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };

  return {
    file: get("--file"),
    title: get("--title"),
    slug: get("--slug"),
    host: get("--host") || "cloudinary", // cloudinary | youtube
    privacy: get("--privacy") || "unlisted", // public | unlisted | private
    youtubeId: get("--youtube-id"),
    cloudinaryUrl: get("--cloudinary-url"),
    folder: get("--folder") || "restoreassist-videos",
    tags: (get("--tags") || "go-live-v1,auto-generated").split(","),
    duration: parseInt(get("--duration") || "0"),
    registryPath: get("--registry") || "components/setup/video-registry.ts",
  };
}

// ── Cloudinary upload ───────────────────────────────────────────────────

async function uploadToCloudinary(
  filePath: string,
  title: string,
  folder: string,
  tags: string[],
): Promise<{ url: string; publicId: string }> {
  console.log(`[cloudinary] Uploading: ${filePath}`);

  const buffer = await fs.readFile(filePath);
  const result = await uploadFileToCloudinary(
    buffer,
    path.basename(filePath, path.extname(filePath)),
    "video/mp4",
    folder,
    {
      resourceType: "video",
      tags,
    },
  );

  console.log(`[cloudinary] Uploaded: ${result.url}`);
  console.log(`[cloudinary] Public ID: ${result.publicId}`);

  return { url: result.url, publicId: result.publicId };
}

// ── YouTube upload (placeholder — requires OAuth) ──────────────────────

async function uploadToYouTube(
  filePath: string,
  title: string,
  privacy: string,
): Promise<{ youtubeId: string }> {
  console.log(`[youtube] Uploading: ${filePath}`);
  console.log(`[youtube] Title: ${title}`);
  console.log(`[youtube] Privacy: ${privacy}`);

  // NOTE: YouTube upload requires OAuth2 flow which cannot be automated
  // in a simple script. This is a placeholder that guides the user.

  console.error(`\n[youtube] ⚠️ YouTube upload requires manual OAuth consent.`);
  console.error(`[youtube] Please follow these steps:`);
  console.error(`  1. Go to studio.youtube.com`);
  console.error(`  2. Drag ${filePath} onto the upload area`);
  console.error(`  3. Set title: "${title}"`);
  console.error(`  4. Set visibility: ${privacy}`);
  console.error(`  5. After processing, copy the video ID from the URL`);
  console.error(`  6. Run: npx tsx scripts/video-upload.ts --slug <slug> --youtube-id <ID>`);

  throw new Error("YouTube upload requires manual OAuth consent — see instructions above");
}

// ── Registry update ─────────────────────────────────────────────────────

async function updateRegistry(
  registryPath: string,
  slug: string,
  entry: {
    title: string;
    durationSec: number;
    cloudinaryUrl?: string;
    youtubeId?: string;
    localPath?: string;
  },
) {
  console.log(`[registry] Reading: ${registryPath}`);
  const content = await fs.readFile(registryPath, "utf-8");

  // Find the VIDEO_REGISTRY entry
  const slugRegex = new RegExp(`"${slug}":\\s*\\{[^}]*\\}`, "s");
  const existingMatch = content.match(slugRegex);

  if (!existingMatch) {
    console.error(`[registry] Slug "${slug}" not found in registry.`);
    console.error(`[registry] Available slugs:`);

    // Extract available slugs for error message
    const slugMatches = content.matchAll(/"([^"]+)":\s*\{/g);
    const slugs = [...slugMatches].map((m) => m[1]).filter((s) => !s.includes("-"));
    console.error(`  ${slugs.join(", ")}`);

    throw new Error(`Slug "${slug}" not found in registry`);
  }

  console.log(`[registry] Found existing entry for: ${slug}`);

  // Build new entry block
  let newEntry = `  "${slug}": {\n`;
  if (entry.youtubeId) {
    newEntry += `    youtubeId: "${entry.youtubeId}",\n`;
  }
  if (entry.cloudinaryUrl) {
    newEntry += `    cloudinaryUrl: "${entry.cloudinaryUrl}",\n`;
  }
  if (entry.localPath) {
    newEntry += `    localPath: "${entry.localPath}",\n`;
  }
  newEntry += `    title: "${entry.title}",\n`;
  newEntry += `    durationSec: ${entry.durationSec},\n`;
  newEntry += `  }`;

  // Replace existing entry
  const updatedContent = content.replace(slugRegex, newEntry);

  await fs.writeFile(registryPath, updatedContent);
  console.log(`[registry] Updated: ${registryPath}`);

  // Update TypeScript type if cloudinaryUrl is new
  if (entry.cloudinaryUrl && !content.includes("cloudinaryUrl")) {
    const typeRegex = /export interface RegistryEntry \{[^}]*\}/;
    const typeMatch = content.match(typeRegex);
    if (typeMatch && !typeMatch[0].includes("cloudinaryUrl")) {
      const newType = typeMatch[0].replace(
        "localPath?: string;",
        "localPath?: string;\n  cloudinaryUrl?: string;",
      );
      const finalContent = updatedContent.replace(typeRegex, newType);
      await fs.writeFile(registryPath, finalContent);
      console.log(`[registry] Added cloudinaryUrl field to RegistryEntry type`);
    }
  }
}

// ── Main ────────────────────────────────────────────────────────────────

async function main() {
  const {
    file,
    title,
    slug,
    host,
    privacy,
    youtubeId,
    cloudinaryUrl,
    folder,
    tags,
    duration,
    registryPath,
  } = parseArgs();

  if (!slug) {
    console.error("Usage: npx tsx scripts/video-upload.ts --slug <slug> [options]");
    console.error("");
    console.error("Options:");
    console.error("  --file <path>          Path to MP4 file");
    console.error("  --title <title>        Video title");
    console.error("  --slug <slug>          Registry slug (required)");
    console.error("  --host <cloudinary|youtube>  Hosting provider (default: cloudinary)");
    console.error("  --privacy <public|unlisted|private> YouTube visibility (default: unlisted)");
    console.error("  --youtube-id <id>      Update registry with existing YouTube ID");
    console.error("  --cloudinary-url <url> Update registry with existing Cloudinary URL");
    console.error("  --duration <sec>       Video duration in seconds");
    console.error("  --tags <tag1,tag2>     Cloudinary tags (default: go-live-v1,auto-generated)");
    process.exit(1);
  }

  console.log(`========================================`);
  console.log(`RestoreAssist Video Uploader`);
  console.log(`Slug: ${slug}`);
  console.log(`Host: ${host}`);
  console.log(`========================================`);

  let url: string | undefined;
  let uploadedId: string | undefined;

  // Upload to host
  if (youtubeId) {
    console.log(`[upload] Using existing YouTube ID: ${youtubeId}`);
    uploadedId = youtubeId;
  } else if (cloudinaryUrl) {
    console.log(`[upload] Using existing Cloudinary URL: ${cloudinaryUrl}`);
    url = cloudinaryUrl;
  } else if (file) {
    if (host === "youtube") {
      const result = await uploadToYouTube(file, title || slug, privacy);
      uploadedId = result.youtubeId;
    } else {
      const result = await uploadToCloudinary(file, title || slug, folder, tags);
      url = result.url;
    }
  } else {
    console.error("[upload] No file or existing ID provided. Use --file, --youtube-id, or --cloudinary-url");
    process.exit(1);
  }

  // Determine duration
  let durationSec = duration;
  if (!durationSec && file) {
    try {
      // Try to get duration from ffprobe if available
      const { execSync } = await import("child_process");
      const ffprobe = execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${file}"`, {
        encoding: "utf-8",
      });
      durationSec = Math.ceil(parseFloat(ffprobe.trim()));
      console.log(`[upload] Detected duration: ${durationSec}s`);
    } catch {
      console.log(`[upload] Could not detect duration — using 0`);
      durationSec = 0;
    }
  }

  // Update registry
  await updateRegistry(registryPath, slug, {
    title: title || slug,
    durationSec,
    ...(url ? { cloudinaryUrl: url } : {}),
    ...(uploadedId ? { youtubeId: uploadedId } : {}),
  });

  console.log(`\n✅ Done! Registry updated for slug: ${slug}`);
  if (url) {
    console.log(`   Cloudinary URL: ${url}`);
  }
  if (uploadedId) {
    console.log(`   YouTube ID: ${uploadedId}`);
  }
  console.log(`\nNext steps:`);
  console.log(`  1. Commit the updated ${registryPath}`);
  console.log(`  2. Test: visit /dashboard/learn and check the video`);
  console.log(`  3. Build and deploy`);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
