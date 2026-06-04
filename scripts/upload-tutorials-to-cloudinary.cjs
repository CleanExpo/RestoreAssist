/**
 * Upload tutorial videos to Cloudinary
 */
const cloudinary = require("cloudinary").v2;
const fs = require("fs");
const path = require("path");

cloudinary.config({ secure: true });

const VIDEO_DIR = "/Users/phillmcgurk/RestoreAssist/public/videos/remotion";
const OUTPUT_JSON = "/Users/phillmcgurk/RestoreAssist/scripts/cloudinary-tutorial-urls.json";

const files = [
  "tutorial-login.mp4",
  "tutorial-signup.mp4",
  "tutorial-setup-wizard.mp4",
  "tutorial-dashboard.mp4",
  "tutorial-inspections.mp4",
  "tutorial-reports.mp4",
  "tutorial-billing.mp4",
  "tutorial-team.mp4",
  "tutorial-compliance.mp4",
  "tutorial-integrations.mp4",
];

(async () => {
  const results = [];
  for (const file of files) {
    const filepath = path.join(VIDEO_DIR, file);
    if (!fs.existsSync(filepath)) {
      console.log(`  SKIP: ${file} not found`);
      results.push({ file, status: "not_found" });
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
