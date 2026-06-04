/**
 * Upload wizard videos to Cloudinary
 */
const cloudinary = require("cloudinary").v2;
const fs = require("fs");
const path = require("path");

cloudinary.config({ secure: true });

const VIDEO_DIR = "/Users/phillmcgurk/RestoreAssist/public/videos/remotion";
const OUTPUT_JSON = "/Users/phillmcgurk/RestoreAssist/scripts/cloudinary-wizard-urls.json";

const files = [
  "wizard-signin.mp4",
  "wizard-signup.mp4",
  "wizard-setup.mp4",
  "wizard-dashboard.mp4",
  "wizard-integrations.mp4",
  "wizard-health.mp4",
];

(async () => {
  const results = [];
  for (const file of files) {
    const filepath = path.join(VIDEO_DIR, file);
    if (!fs.existsSync(filepath)) {
      console.log(`  SKIP: ${file} not found`);
      continue;
    }
    try {
      const res = await cloudinary.uploader.upload(filepath, {
        resource_type: "video",
        folder: "restoreassist/videos/remotion",
        public_id: file.replace(".mp4", ""),
      });
      console.log(`  ✓ ${file} → ${(res.bytes / 1024 / 1024).toFixed(1)} MB`);
      results.push({ file, url: res.secure_url, status: "ok" });
    } catch (err) {
      console.error(`  ✗ ${file}: ${err.message}`);
      results.push({ file, status: "error", error: err.message });
    }
  }
  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(results, null, 2));
  const ok = results.filter((r) => r.status === "ok").length;
  console.log(`\nDone: ${ok} uploaded, ${results.length - ok} failed`);
})();
