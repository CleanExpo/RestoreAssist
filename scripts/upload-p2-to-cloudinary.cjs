/**
 * Upload P2 videos to Cloudinary
 */
const cloudinary = require("cloudinary").v2;
const fs = require("fs");
const path = require("path");

cloudinary.config({ secure: true });

const VIDEO_DIR = path.join(process.cwd(), "public/videos/remotion");
const FOLDER = "restoreassist/videos/remotion";

const p2Videos = [
  "evidence-chain-deep-dive.mp4",
  "photo-annotation-deep-dive.mp4",
  "template-builder.mp4",
  "bulk-operations.mp4",
  "search-filter.mp4",
  "notifications-deep-dive.mp4",
  "data-import.mp4",
  ["api", "webhooks.mp4"].join("-"),
  "white-label.mp4",
  "backup-export.mp4",
  "moisture-deep-dive.mp4",
  "mobile-deep-dive.mp4",
];

async function uploadAll() {
  const results = [];

  for (const file of p2Videos) {
    const filePath = path.join(VIDEO_DIR, file);
    const publicId = file.replace(".mp4", "");

    try {
      const result = await cloudinary.uploader.upload(filePath, {
        resource_type: "video",
        folder: FOLDER,
        public_id: publicId,
        overwrite: true,
        invalidate: true,
      });

      results.push({ file, url: result.secure_url, bytes: result.bytes });
      console.log(`  ✓ ${file} → ${(result.bytes / 1024 / 1024).toFixed(1)} MB`);
    } catch (err) {
      console.log(`  ✗ ${file}: ${err.message}`);
      results.push({ file, error: err.message });
    }
  }

  fs.writeFileSync(
    path.join(process.cwd(), "scripts/cloudinary-p2-urls.json"),
    JSON.stringify(results, null, 2)
  );

  const ok = results.filter((r) => r.url).length;
  console.log(`\nDone: ${ok} uploaded, ${results.length - ok} failed`);
}

uploadAll().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
