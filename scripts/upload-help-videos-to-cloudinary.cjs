/**
 * Upload the help-centre videos to Cloudinary CDN.
 *
 * These six MP4s live in public/videos/help/ but are gitignored, so they never
 * deploy with the app — the matching video-registry.ts entries (help-*) had no
 * cloudinaryUrl and therefore broke on the live site. This uploads them and
 * writes scripts/cloudinary-help-urls.json so the registry can be wired.
 *
 * Run: node --env-file=.env.local scripts/upload-help-videos-to-cloudinary.cjs
 * Requires CLOUDINARY_URL in the environment (the cloudinary SDK reads it).
 */
const cloudinary = require("cloudinary").v2;
const fs = require("fs");
const path = require("path");

cloudinary.config({ secure: true });

const VIDEO_DIR = path.join(process.cwd(), "public/videos/help");
const FOLDER = "restoreassist/videos/help";

async function uploadAll() {
  const files = fs
    .readdirSync(VIDEO_DIR)
    .filter((f) => f.endsWith(".mp4"))
    .sort();

  console.log(`Uploading ${files.length} help videos to Cloudinary...\n`);

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

      console.log(
        `  ✓ ${file} → ${(result.bytes / 1024 / 1024).toFixed(1)} MB`,
      );
    } catch (err) {
      console.log(`  ✗ ${file}: ${err.message}`);
      results.push({ file, error: err.message });
    }
  }

  const registryPath = path.join(
    process.cwd(),
    "scripts/cloudinary-help-urls.json",
  );
  fs.writeFileSync(registryPath, JSON.stringify(results, null, 2));

  const ok = results.filter((r) => r.url).length;
  const failed = results.filter((r) => r.error).length;

  console.log(`\nDone: ${ok} uploaded, ${failed} failed`);
  console.log(`Registry written to: ${registryPath}`);
}

uploadAll().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
