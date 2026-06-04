/**
 * Upload all Remotion videos to Cloudinary CDN
 *
 * Run: node scripts/upload-videos-to-cloudinary.js
 */
const cloudinary = require("cloudinary").v2;
const fs = require("fs");
const path = require("path");

// Config from env
cloudinary.config({
  secure: true,
});

const VIDEO_DIR = path.join(process.cwd(), "public/videos/remotion");
const FOLDER = "restoreassist/videos/remotion";

async function uploadAll() {
  const files = fs
    .readdirSync(VIDEO_DIR)
    .filter((f) => f.endsWith(".mp4"))
    .sort();

  console.log(`Uploading ${files.length} videos to Cloudinary...\n`);

  const results = [];

  for (const file of files) {
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

      results.push({
        file,
        publicId: result.public_id,
        url: result.secure_url,
        bytes: result.bytes,
      });

      console.log(`  ✓ ${file} → ${(result.bytes / 1024 / 1024).toFixed(1)} MB`);
    } catch (err) {
      console.log(`  ✗ ${file}: ${err.message}`);
      results.push({ file, error: err.message });
    }
  }

  // Write registry mapping
  const registryPath = path.join(process.cwd(), "scripts/cloudinary-urls.json");
  fs.writeFileSync(registryPath, JSON.stringify(results, null, 2));

  const ok = results.filter((r) => r.url).length;
  const failed = results.filter((r) => r.error).length;

  console.log(`\nDone: ${ok} uploaded, ${failed} failed`);
  console.log(`Registry written to: ${registryPath}`);
}

uploadAll().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
