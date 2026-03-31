import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
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
    outputFileName
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

  console.log("\nAll videos rendered successfully.");
}

main().catch(console.error);
