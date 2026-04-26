#!/usr/bin/env node
/**
 * Rasterise the RestoreAssist source artwork into every PNG size
 * the App Store + Play Store require.
 *
 * Usage:
 *   node distribution/icon-source/build-icons.mjs
 *
 * Source of truth: `distribution/icon-source/RestoreAssist Logo.png`
 * (operator-supplied designer artwork, 1225×1024 RGB, no alpha).
 *
 * Outputs (all PNG, sRGB, no alpha unless noted):
 *
 *   distribution/icon-source/out/
 *     ios-1024.png            App Store Connect "App Icon" upload (canonical — operator selected as-supplied artwork)
 *     ios-marketing-1024.png  alias of ios-1024
 *     android-512.png         Play Store listing icon
 *     android-feature-graphic.png  1024×500 banner (auto-generated, replace with designer art when ready)
 *     adaptive-fg-432.png     Android adaptive icon foreground (transparent corners)
 *     adaptive-bg-432.png     Android adaptive icon background (solid #050505)
 *
 *   mobile/assets/
 *     icon.png            1024x1024 (Capacitor source)
 *     adaptive-icon.png   1024x1024 (Capacitor source)
 *     splash.png          2048x2048 (Capacitor source)
 *
 * Run after editing the source PNG, commit the outputs, then
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

const SOURCE_PNG = path.join(__dirname, "RestoreAssist Logo.png");
const OUT = path.join(__dirname, "out");
const MOBILE_ASSETS = path.join(REPO, "mobile", "assets");

const BG_HEX = "#050505";
const BG_RGB = { r: 5, g: 5, b: 5, alpha: 1 };

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

/**
 * Center-crop the source to a square. The source is 1225×1024 wide-
 * landscape; we keep the full height and drop the wider sides
 * symmetrically so the silver disc stays centered.
 */
async function loadSquareSource() {
  const buf = await fs.readFile(SOURCE_PNG);
  const meta = await sharp(buf).metadata();
  const side = Math.min(meta.width, meta.height);
  const left = Math.floor((meta.width - side) / 2);
  const top = Math.floor((meta.height - side) / 2);
  return sharp(buf)
    .extract({ left, top, width: side, height: side })
    .toBuffer();
}

async function rasteriseToSize(squareSource, size, outPath, opts = {}) {
  const pipeline = sharp(squareSource).resize(size, size, {
    fit: "contain",
    background: opts.background ?? BG_RGB,
  });
  if (opts.flatten !== false) {
    pipeline.flatten({ background: BG_HEX });
  }
  await pipeline.png({ compressionLevel: 9 }).toFile(outPath);
  const stat = await fs.stat(outPath);
  console.log(
    `  ${path.relative(REPO, outPath)}  (${stat.size.toLocaleString()} bytes)`,
  );
}

/**
 * Android adaptive icon foreground:
 *   - 432×432 canvas, transparent
 *   - Source artwork scaled down to fit inside the 264×264 safe zone
 *     centred on the canvas (so circular masks don't crop it)
 */
async function adaptiveForeground(squareSource, outPath) {
  const SAFE = 264;
  const inner = await sharp(squareSource)
    .resize(SAFE, SAFE, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  await sharp({
    create: {
      width: 432,
      height: 432,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: inner, top: (432 - SAFE) / 2, left: (432 - SAFE) / 2 }])
    .png({ compressionLevel: 9 })
    .toFile(outPath);
  const stat = await fs.stat(outPath);
  console.log(
    `  ${path.relative(REPO, outPath)}  (${stat.size.toLocaleString()} bytes)`,
  );
}

async function makeFeatureGraphic(squareSource, outPath) {
  // Play Store wants 1024×500. Build a horizontal banner: dark BG +
  // disc on the left + wordmark on the right.
  const disc = await sharp(squareSource)
    .resize(420, 420, { fit: "contain" })
    .toBuffer();
  const banner = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 500" width="1024" height="500">
  <rect width="1024" height="500" fill="#050505" />
  <text x="500" y="240" font-family="Helvetica, Arial, sans-serif" font-size="74" font-weight="700" fill="#FFFFFF">RestoreAssist</text>
  <text x="500" y="294" font-family="Helvetica, Arial, sans-serif" font-size="30" font-weight="400" fill="#9CA3AF">Restoration Intelligence</text>
  <text x="500" y="358" font-family="Helvetica, Arial, sans-serif" font-size="22" font-weight="400" fill="#6B7280">IICRC compliance · Australia + NZ</text>
</svg>`);
  // Composite: dark base + disc on left + SVG text overlay.
  await sharp(banner, { density: 192 })
    .composite([{ input: disc, top: 40, left: 40 }])
    .png({ compressionLevel: 9 })
    .toFile(outPath);
  const stat = await fs.stat(outPath);
  console.log(
    `  ${path.relative(REPO, outPath)}  (${stat.size.toLocaleString()} bytes)`,
  );
}

async function main() {
  await ensureDir(OUT);
  await ensureDir(MOBILE_ASSETS);

  console.log(`Source: ${path.relative(REPO, SOURCE_PNG)}`);
  const squareSource = await loadSquareSource();
  console.log("Square crop loaded.\n");

  console.log("App Store / Play Store icons:");

  // App Store Connect: 1024×1024, no alpha. Operator-supplied artwork
  // as-is — the textured-grey corners are intentional (brand decision
  // 2026-04-26).
  await rasteriseToSize(squareSource, 1024, path.join(OUT, "ios-1024.png"));
  await rasteriseToSize(
    squareSource,
    1024,
    path.join(OUT, "ios-marketing-1024.png"),
  );

  // Google Play: 512×512.
  await rasteriseToSize(squareSource, 512, path.join(OUT, "android-512.png"));

  // Android adaptive layers.
  await adaptiveForeground(squareSource, path.join(OUT, "adaptive-fg-432.png"));
  await sharp({
    create: { width: 432, height: 432, channels: 3, background: BG_HEX },
  })
    .png({ compressionLevel: 9 })
    .toFile(path.join(OUT, "adaptive-bg-432.png"));
  console.log(
    `  ${path.relative(REPO, path.join(OUT, "adaptive-bg-432.png"))}  (solid #050505)`,
  );

  // Capacitor source assets.
  await rasteriseToSize(squareSource, 1024, path.join(MOBILE_ASSETS, "icon.png"));
  await rasteriseToSize(
    squareSource,
    1024,
    path.join(MOBILE_ASSETS, "adaptive-icon.png"),
  );
  await rasteriseToSize(
    squareSource,
    2048,
    path.join(MOBILE_ASSETS, "splash.png"),
  );

  // Play Store feature graphic.
  await makeFeatureGraphic(
    squareSource,
    path.join(OUT, "android-feature-graphic.png"),
  );

  console.log("\nDone. Next steps (operator):");
  console.log("  1. npx cap sync ios && npx cap sync android");
  console.log("  2. Open ios/App/App.xcworkspace in Xcode and verify the");
  console.log("     AppIcon.appiconset asset catalog now shows the new icon");
  console.log("  3. Same for android/app/src/main/res/mipmap-*");
  console.log("  4. Upload distribution/icon-source/out/ios-1024.png to");
  console.log("     App Store Connect → App Information → App Icon");
  console.log("  5. Upload distribution/icon-source/out/android-512.png to");
  console.log("     Play Console → Store presence → Main store listing");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
