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
 *     ios-1024.png            App Store Connect "App Icon" upload (textured-grey corners as-is)
 *     ios-1024-darkbg.png     Variant: silver disc on #050505 background (alternate option)
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
 * Recomposite the source onto a solid #050505 background using a
 * circular mask. Centred, radius = size/2.
 *
 * Only the artwork inside the disc survives; the textured grey
 * corners get replaced with the brand-dark background that matches
 * the splash screen + capacitor.config.ts.
 */
async function darkBackgroundVariant(squareSource, size, outPath) {
  // Build an SVG mask: an opaque white circle on transparent.
  const mask = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 6}" fill="#fff" />
</svg>`);

  // 1. Resize source to target size.
  const resized = await sharp(squareSource)
    .resize(size, size, { fit: "cover" })
    .toBuffer();

  // 2. Apply the circular mask: the disc survives, everything else
  //    becomes transparent.
  const masked = await sharp(resized)
    .composite([{ input: mask, blend: "dest-in" }])
    .png()
    .toBuffer();

  // 3. Composite the masked disc onto a solid #050505 square.
  await sharp({
    create: {
      width: size,
      height: size,
      channels: 3,
      background: BG_HEX,
    },
  })
    .composite([{ input: masked }])
    .png({ compressionLevel: 9 })
    .toFile(outPath);
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

  // App Store Connect: 1024×1024, no alpha. As-is variant first.
  await rasteriseToSize(squareSource, 1024, path.join(OUT, "ios-1024.png"));
  await rasteriseToSize(
    squareSource,
    1024,
    path.join(OUT, "ios-marketing-1024.png"),
  );
  // Dark-background variant: silver disc on #050505 (matches splash).
  await darkBackgroundVariant(
    squareSource,
    1024,
    path.join(OUT, "ios-1024-darkbg.png"),
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
  console.log("  1. Open distribution/icon-source/out/ in Finder");
  console.log("  2. Compare ios-1024.png (textured grey corners) vs");
  console.log("     ios-1024-darkbg.png (silver disc on #050505).");
  console.log("     Pick which one to upload to App Store Connect.");
  console.log("  3. npx cap sync ios && npx cap sync android");
  console.log("  4. Open ios/App/App.xcworkspace in Xcode and verify the");
  console.log("     AppIcon.appiconset asset catalog now shows the new icon");
  console.log("  5. Same for android/app/src/main/res/mipmap-*");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
