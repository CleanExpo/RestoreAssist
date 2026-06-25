#!/usr/bin/env node
/**
 * RestoreAssist Video Cloudinary Uploader
 *
 * Uploads videos from public/videos/ to Cloudinary and updates the registry.
 *
 * Prerequisites:
 *   1. Set Cloudinary credentials in .env.local:
 *      CLOUDINARY_CLOUD_NAME=your_cloud_name
 *      CLOUDINARY_API_KEY=your_api_key
 *      CLOUDINARY_API_SECRET=your_api_secret
 *
 *   2. Run: pnpm add -D cloudinary
 *
 * Usage:
 *   npx tsx scripts/video-upload-cloudinary.ts --all
 *   npx tsx scripts/video-upload-cloudinary.ts --slug tutorial-login
 *   npx tsx scripts/video-upload-cloudinary.ts --folder tutorials
 */

import fs from "fs/promises";
import path from "path";
import { execSync } from "child_process";

// Load env from .env.local
const envPath = path.join(process.cwd(), ".env.local");
try {
  const envContent = await fs.readFile(envPath, "utf-8");
  envContent.split("\n").forEach((line) => {
    const match = line.match(/^([A-Z_]+)=(.*)$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2];
    }
  });
} catch {
  // .env.local not found — rely on process.env
}

const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const API_KEY = process.env.CLOUDINARY_API_KEY;
const API_SECRET = process.env.CLOUDINARY_API_SECRET;

if (!CLOUD_NAME || !API_KEY || !API_SECRET) {
  console.error("[error] Cloudinary credentials not found.");
  console.error("  Set these in .env.local:");
  console.error("    CLOUDINARY_CLOUD_NAME=your_cloud_name");
  console.error("    CLOUDINARY_API_KEY=your_api_key");
  console.error("    CLOUDINARY_API_SECRET=your_api_secret");
  process.exit(1);
}

// Dynamic import for ESM compatibility
const { v2: cloudinary } = await import("cloudinary");

cloudinary.config({
  cloud_name: CLOUD_NAME,
  api_key: API_KEY,
  api_secret: API_SECRET,
  secure: true,
});

// ── Parse args ──────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const uploadAll = args.includes("--all");
const slugArg = args[args.indexOf("--slug") + 1];
const folderArg = args[args.indexOf("--folder") + 1] || "restoreassist/videos";

// ── Video definitions ───────────────────────────────────────────────────

interface VideoDef {
  slug: string;
  filePath: string;
  title: string;
  folder: string;
}

const videos: VideoDef[] = [
  // Tutorials
  { slug: "tutorial-login", filePath: "public/videos/tutorials/restoreassist-login-v1.mp4", title: "Signing in to RestoreAssist", folder: `${folderArg}/tutorials` },
  { slug: "tutorial-signup", filePath: "public/videos/tutorials/restoreassist-signup-v1.mp4", title: "Creating Your RestoreAssist Account", folder: `${folderArg}/tutorials` },
  { slug: "tutorial-setup-wizard", filePath: "public/videos/tutorials/restoreassist-setup-wizard-v1.mp4", title: "The RestoreAssist Setup Wizard", folder: `${folderArg}/tutorials` },
  { slug: "tutorial-dashboard", filePath: "public/videos/tutorials/restoreassist-dashboard-v1.mp4", title: "Your RestoreAssist Dashboard", folder: `${folderArg}/tutorials` },
  { slug: "tutorial-inspections", filePath: "public/videos/tutorials/restoreassist-inspections-v1.mp4", title: "Inspections with RestoreAssist", folder: `${folderArg}/tutorials` },
  { slug: "tutorial-reports", filePath: "public/videos/tutorials/restoreassist-reports-v1.mp4", title: "AI-Assisted Reports", folder: `${folderArg}/tutorials` },
  { slug: "tutorial-billing", filePath: "public/videos/tutorials/restoreassist-billing-v1.mp4", title: "Billing & Subscriptions", folder: `${folderArg}/tutorials` },
  { slug: "tutorial-team", filePath: "public/videos/tutorials/restoreassist-team-v1.mp4", title: "Managing Your Team", folder: `${folderArg}/tutorials` },
  { slug: "tutorial-compliance", filePath: "public/videos/tutorials/restoreassist-compliance-v1.mp4", title: "IICRC Compliance", folder: `${folderArg}/tutorials` },
  // Help
  { slug: "help-inspections", filePath: "public/videos/help/help-inspections.mp4", title: "Inspections — chain-of-custody capture", folder: `${folderArg}/help` },
  { slug: "help-reports", filePath: "public/videos/help/help-reports.mp4", title: "AI-drafted S500 reports", folder: `${folderArg}/help` },
  { slug: "help-clients-and-portal", filePath: "public/videos/help/help-clients-and-portal.mp4", title: "Share reports via the client portal", folder: `${folderArg}/help` },
  { slug: "help-billing", filePath: "public/videos/help/help-billing.mp4", title: "Trial, paid tiers, and Stripe Checkout", folder: `${folderArg}/help` },
  { slug: "help-team", filePath: "public/videos/help/help-team.mp4", title: "Invite a technician + verify their licence", folder: `${folderArg}/help` },
  { slug: "help-compliance", filePath: "public/videos/help/help-compliance.mp4", title: "IICRC citation format and edition discipline", folder: `${folderArg}/help` },
  // New-client welcome (top of /setup). public_id `onboarding-welcome` in folder
  // restoreassist/videos/remotion → matches the cloudinaryUrl already in
  // components/setup/video-registry.ts under slug `remotion-onboarding-welcome`.
  { slug: "onboarding-welcome", filePath: "public/videos/remotion/onboarding-welcome.mp4", title: "Welcome to RestoreAssist", folder: `${folderArg}/remotion` },
];

// ── Upload function ─────────────────────────────────────────────────────

async function uploadVideo(video: VideoDef): Promise<string> {
  console.log(`[upload] ${video.slug} → Cloudinary folder: ${video.folder}`);

  const result = await cloudinary.uploader.upload(video.filePath, {
    resource_type: "video",
    folder: video.folder,
    public_id: video.slug,
    overwrite: true,
    eager: [
      { streaming_profile: "hd", format: "m3u8" },
      { width: 1280, height: 720, crop: "limit", format: "mp4" },
    ],
    eager_async: true,
    context: `title=${video.title}|slug=${video.slug}`,
  });

  const secureUrl = result.secure_url as string;
  console.log(`[upload] ✅ ${video.slug}`);
  console.log(`         URL: ${secureUrl}`);
  console.log(`         Duration: ${result.duration}s`);
  console.log(`         Size: ${(result.bytes / 1024 / 1024).toFixed(2)} MB`);

  return secureUrl;
}

// ── Registry updater ────────────────────────────────────────────────────

async function updateRegistry(slug: string, cloudinaryUrl: string) {
  const registryPath = path.join(process.cwd(), "components", "setup", "video-registry.ts");
  let content = await fs.readFile(registryPath, "utf-8");

  // Find the entry for this slug and add/update cloudinaryUrl
  const slugPattern = new RegExp(`("${slug}":\\s*\\{[^}]+)`);
  const match = content.match(slugPattern);

  if (!match) {
    console.warn(`[registry] Slug "${slug}" not found in registry`);
    return;
  }

  const entryStart = match[1];

  // Check if cloudinaryUrl already exists
  if (entryStart.includes("cloudinaryUrl:")) {
    // Update existing
    const updatedEntry = entryStart.replace(
      /cloudinaryUrl:\s*"[^"]*"/,
      `cloudinaryUrl: "${cloudinaryUrl}"`,
    );
    content = content.replace(entryStart, updatedEntry);
  } else {
    // Add new cloudinaryUrl line after the first property
    const updatedEntry = entryStart.replace(
      /(localPath:\s*"[^"]+",)/,
      `$1\n    cloudinaryUrl: "${cloudinaryUrl}",`,
    );
    content = content.replace(entryStart, updatedEntry);
  }

  await fs.writeFile(registryPath, content, "utf-8");
  console.log(`[registry] Updated ${slug} with Cloudinary URL`);
}

// ── Main ────────────────────────────────────────────────────────────────

async function main() {
  console.log("========================================");
  console.log("RestoreAssist Cloudinary Video Uploader");
  console.log(`Cloud: ${CLOUD_NAME}`);
  console.log("========================================");

  let toUpload: VideoDef[];

  if (uploadAll) {
    toUpload = videos;
  } else if (slugArg) {
    toUpload = videos.filter((v) => v.slug === slugArg);
    if (toUpload.length === 0) {
      console.error(`[error] Unknown slug: ${slugArg}`);
      console.error("Available slugs:");
      videos.forEach((v) => console.error(`  ${v.slug}`));
      process.exit(1);
    }
  } else {
    console.error("Usage:");
    console.error("  npx tsx scripts/video-upload-cloudinary.ts --all");
    console.error("  npx tsx scripts/video-upload-cloudinary.ts --slug tutorial-login");
    process.exit(1);
  }

  console.log(`\nUploading ${toUpload.length} videos...\n`);

  const results: { slug: string; url: string }[] = [];

  for (const video of toUpload) {
    try {
      // Check file exists
      await fs.access(video.filePath);
      const url = await uploadVideo(video);
      await updateRegistry(video.slug, url);
      results.push({ slug: video.slug, url });
    } catch (error) {
      console.error(`[upload] ❌ ${video.slug} failed:`, (error as Error).message);
    }
  }

  console.log("\n========================================");
  console.log("Upload Complete");
  console.log("========================================");
  console.log(`\nUploaded ${results.length}/${toUpload.length} videos:`);
  results.forEach((r) => {
    console.log(`  ✅ ${r.slug}`);
    console.log(`     ${r.url}`);
  });

  if (results.length > 0) {
    console.log("\n[git] Registry updated. Commit changes:");
    console.log("  git add components/setup/video-registry.ts");
    console.log("  git commit -m 'chore(videos): add Cloudinary URLs for uploaded videos'");
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
