import { bundle } from "@remotion/bundler";
import {
  renderMedia,
  renderStill,
  selectComposition,
} from "@remotion/renderer";
import path from "path";

async function renderVideo(compositionId: string, outputFileName: string) {
  console.log(`\nRendering ${compositionId}...`);

  const bundled = await bundle({
    entryPoint: path.resolve(__dirname, "../index.ts"),
    webpackOverride: (config) => config,
  });

  const composition = await selectComposition({
    serveUrl: bundled,
    id: compositionId,
  });

  const outputPath = path.resolve(
    __dirname,
    "../../../../public/videos",
    outputFileName,
  );

  await renderMedia({
    composition,
    serveUrl: bundled,
    codec: "h264",
    outputLocation: outputPath,
  });

  console.log(`Rendered: ${outputPath}`);
}

async function main() {
  // Ensure output directory exists
  const fs = await import("fs");
  const outputDir = path.resolve(__dirname, "../../../../public/videos");
  fs.mkdirSync(outputDir, { recursive: true });

  await renderVideo("ProductExplainer", "product-explainer.mp4");
  await renderVideo("IndustryInsight", "industry-insight.mp4");
  await renderVideo("LandingPageOverview", "landing-page-overview.mp4");

  // CinematicLandingV2 — outputs to public/videos/landing-page-overview-v2.mp4
  await renderVideo("CinematicLandingV2", "landing-page-overview-v2.mp4");

  // Export frame 60 as poster JPEG
  console.log("\nExporting poster frame...");
  const bundleForPoster = await bundle({
    entryPoint: path.resolve(__dirname, "../index.ts"),
    webpackOverride: (config) => config,
  });
  const posterComposition = await selectComposition({
    serveUrl: bundleForPoster,
    id: "CinematicLandingV2",
  });
  const posterPath = path.resolve(
    __dirname,
    "../../../../public/videos",
    "landing-page-overview-v2-poster.jpg",
  );
  await renderStill({
    composition: posterComposition,
    serveUrl: bundleForPoster,
    output: posterPath,
    frame: 60,
    imageFormat: "jpeg",
    jpegQuality: 90,
  });
  console.log(`Poster exported: ${posterPath}`);

  console.log("\nAll videos rendered successfully.");
}

main().catch(console.error);
