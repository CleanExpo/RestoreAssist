#!/usr/bin/env node
/**
 * Rasterise the RestoreAssist icon-mark SVG into every PNG size the
 * App Store + Play Store + Capacitor + native Android need.
 *
 * Usage:
 *   node distribution/icon-source/build-icons.mjs
 *
 * Source of truth: `distribution/icon-source/icon-mark.svg`
 *   (introduced 2026-05-04 to replace the metallic-coin RestoreAssist
 *   Logo.png that App Review repeatedly flagged as "placeholder icons"
 *   under guideline 2.3.8).
 *
 * Outputs (all PNG, sRGB, no alpha unless noted):
 *
 *   distribution/icon-source/out/
 *     ios-1024.png            App Store Connect "App Icon" upload
 *     ios-marketing-1024.png  alias of ios-1024
 *     android-512.png         Play Store listing icon
 *     android-feature-graphic.png  1024×500 banner
 *     adaptive-fg-432.png     Android adaptive foreground (alpha)
 *     adaptive-bg-432.png     Android adaptive background (solid #1C2E47)
 *
 *   ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png
 *   ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732*.png
 *
 *   android/app/src/main/res/mipmap-{m,h,x,xx,xxx}hdpi/
 *     ic_launcher.png + ic_launcher_round.png + ic_launcher_foreground.png
 *
 *   mobile/assets/icon.png      Capacitor canonical
 *   mobile/assets/adaptive-icon.png
 *   mobile/assets/splash.png
 *
 * Run after editing icon-mark.svg, commit the outputs, then
 * `npx cap sync ios && npx cap sync android` to push them into the
 * native projects.
 */

import sharp from "sharp";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO = path.resolve(__dirname, "..", "..");

const SRC_SVG = path.join(__dirname, "icon-mark.svg");
const OUT = path.join(__dirname, "out");
const MOBILE = path.join(REPO, "mobile", "assets");
const APPICON = path.join(
  REPO,
  "ios/App/App/Assets.xcassets/AppIcon.appiconset",
);
const SPLASH_DIR = path.join(
  REPO,
  "ios/App/App/Assets.xcassets/Splash.imageset",
);
const ANDROID_RES = path.join(REPO, "android/app/src/main/res");

const NAVY = "#1C2E47";
const NAVY_RGB = { r: 0x1c, g: 0x2e, b: 0x47, alpha: 1 };
const TRANS = { r: 0, g: 0, b: 0, alpha: 0 };

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function renderOpaque(svgBuf, size, outPath) {
  await sharp(svgBuf, { density: 384 })
    .resize(size, size, { fit: "contain", background: NAVY_RGB })
    .flatten({ background: NAVY })
    .png({ compressionLevel: 9 })
    .toFile(outPath);
  const st = await fs.stat(outPath);
  console.log(
    `  ${path.relative(REPO, outPath)}  ${st.size.toLocaleString()} B`,
  );
}

async function renderAdaptiveForeground(svgBuf, size, safe, outPath) {
  const inner = await sharp(svgBuf, { density: 384 })
    .resize(safe, safe, { fit: "contain", background: TRANS })
    .png()
    .toBuffer();
  const off = Math.round((size - safe) / 2);
  await sharp({
    create: { width: size, height: size, channels: 4, background: TRANS },
  })
    .composite([{ input: inner, top: off, left: off }])
    .png({ compressionLevel: 9 })
    .toFile(outPath);
  const st = await fs.stat(outPath);
  console.log(
    `  ${path.relative(REPO, outPath)}  ${st.size.toLocaleString()} B`,
  );
}

async function renderSplash(svgBuf, outPath) {
  // Universal 2732×2732 splash: brand mark centred at ~32 % canvas so iPad
  // portrait, iPhone portrait, and landscape all keep it visible.
  const SIZE = 2732;
  const MARK = Math.round(SIZE * 0.32);
  const mark = await sharp(svgBuf, { density: 384 })
    .resize(MARK, MARK, { fit: "contain", background: TRANS })
    .png()
    .toBuffer();
  const off = Math.round((SIZE - MARK) / 2);
  await sharp({
    create: { width: SIZE, height: SIZE, channels: 3, background: NAVY_RGB },
  })
    .composite([{ input: mark, top: off, left: off }])
    .png({ compressionLevel: 9 })
    .toFile(outPath);
  const st = await fs.stat(outPath);
  console.log(
    `  ${path.relative(REPO, outPath)}  ${st.size.toLocaleString()} B`,
  );
}

async function makeFeatureGraphic(svgBuf, outPath) {
  // Play Store wants 1024×500. Navy banner with the mark on the left and a
  // simple wordmark on the right. The wordmark here is on the listing
  // graphic, NOT on the launcher icon — Apple's text-in-icon rule does not
  // apply to feature graphics.
  const mark = await sharp(svgBuf, { density: 384 })
    .resize(420, 420, { fit: "contain", background: TRANS })
    .png()
    .toBuffer();
  const banner = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 500" width="1024" height="500">
  <rect width="1024" height="500" fill="${NAVY}" />
  <text x="500" y="240" font-family="Helvetica, Arial, sans-serif" font-size="74" font-weight="700" fill="#FFFFFF">RestoreAssist</text>
  <text x="500" y="294" font-family="Helvetica, Arial, sans-serif" font-size="30" font-weight="400" fill="#D4A574">Restoration Intelligence</text>
  <text x="500" y="358" font-family="Helvetica, Arial, sans-serif" font-size="22" font-weight="400" fill="#9FB3CC">IICRC compliance · Australia + NZ</text>
</svg>`);
  await sharp(banner, { density: 192 })
    .composite([{ input: mark, top: 40, left: 40 }])
    .png({ compressionLevel: 9 })
    .toFile(outPath);
  const st = await fs.stat(outPath);
  console.log(
    `  ${path.relative(REPO, outPath)}  ${st.size.toLocaleString()} B`,
  );
}

async function main() {
  await ensureDir(OUT);
  await ensureDir(MOBILE);
  console.log(`Source: ${path.relative(REPO, SRC_SVG)}`);
  const svgBuf = await fs.readFile(SRC_SVG);

  console.log("\nApp Store + iOS bundle:");
  await renderOpaque(svgBuf, 1024, path.join(OUT, "ios-1024.png"));
  await renderOpaque(svgBuf, 1024, path.join(OUT, "ios-marketing-1024.png"));
  await renderOpaque(svgBuf, 1024, path.join(APPICON, "AppIcon-512@2x.png"));

  console.log("\niOS launch splash:");
  for (const f of [
    "splash-2732x2732.png",
    "splash-2732x2732-1.png",
    "splash-2732x2732-2.png",
  ]) {
    await renderSplash(svgBuf, path.join(SPLASH_DIR, f));
  }
  await renderSplash(svgBuf, path.join(MOBILE, "splash.png"));

  console.log("\nCapacitor source assets:");
  await renderOpaque(svgBuf, 1024, path.join(MOBILE, "icon.png"));
  await renderOpaque(svgBuf, 1024, path.join(MOBILE, "adaptive-icon.png"));

  console.log("\nPlay Store:");
  await renderOpaque(svgBuf, 512, path.join(OUT, "android-512.png"));
  await renderAdaptiveForeground(
    svgBuf,
    432,
    264,
    path.join(OUT, "adaptive-fg-432.png"),
  );
  await sharp({
    create: { width: 432, height: 432, channels: 3, background: NAVY_RGB },
  })
    .png({ compressionLevel: 9 })
    .toFile(path.join(OUT, "adaptive-bg-432.png"));
  console.log(
    `  ${path.relative(REPO, path.join(OUT, "adaptive-bg-432.png"))} (solid ${NAVY})`,
  );
  await makeFeatureGraphic(
    svgBuf,
    path.join(OUT, "android-feature-graphic.png"),
  );

  console.log("\nNative Android mipmaps:");
  const DENSITIES = [
    ["mipmap-mdpi", 48],
    ["mipmap-hdpi", 72],
    ["mipmap-xhdpi", 96],
    ["mipmap-xxhdpi", 144],
    ["mipmap-xxxhdpi", 192],
  ];
  for (const [dir, size] of DENSITIES) {
    const base = path.join(ANDROID_RES, dir);
    await renderOpaque(svgBuf, size, path.join(base, "ic_launcher.png"));
    await renderOpaque(svgBuf, size, path.join(base, "ic_launcher_round.png"));
    await renderAdaptiveForeground(
      svgBuf,
      size,
      Math.round(size * 0.66),
      path.join(base, "ic_launcher_foreground.png"),
    );
  }

  console.log("\nDone. Next steps:");
  console.log("  1. npx cap sync ios && npx cap sync android");
  console.log(
    "  2. Verify in Xcode (AppIcon catalog) + Android Studio (mipmaps)",
  );
  console.log("  3. Upload distribution/icon-source/out/ios-1024.png to ASC");
  console.log(
    "  4. Upload distribution/icon-source/out/android-512.png to Play",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
