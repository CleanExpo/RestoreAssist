/**
 * render-cinematic.js
 * Programmatic Remotion render — bypasses CLI studio-shared dependency.
 * Run from packages/videos: node render-cinematic.js
 */
const path = require("path");
const { bundle } = require("@remotion/bundler");
const {
  renderMedia,
  selectComposition,
  renderStill,
} = require("@remotion/renderer");

const ENTRY_POINT = path.resolve(__dirname, "src/index.ts");
const COMPOSITION_ID = "CinematicLandingV2";
const OUTPUT_VIDEO = path.resolve(
  __dirname,
  "../../public/videos/landing-page-overview-v2.mp4",
);
const OUTPUT_POSTER = path.resolve(
  __dirname,
  "../../public/videos/landing-page-overview-v2-poster.jpg",
);

async function main() {
  console.log("\n[render] Bundling Remotion composition...");

  const bundleLocation = await bundle({
    entryPoint: ENTRY_POINT,
    onProgress: (p) => process.stdout.write(`\r[render] Bundling... ${p}%   `),
  });
  console.log("\n[render] Bundle complete.\n");

  const inputProps = {};

  console.log(`[render] Selecting composition: ${COMPOSITION_ID}`);
  const composition = await selectComposition({
    serveUrl: bundleLocation,
    id: COMPOSITION_ID,
    inputProps,
  });

  console.log(
    `[render] Composition: ${composition.durationInFrames} frames @ ${composition.fps}fps (${(composition.durationInFrames / composition.fps).toFixed(1)}s)`,
  );
  console.log(`[render] Output: ${OUTPUT_VIDEO}\n`);

  await renderMedia({
    composition,
    serveUrl: bundleLocation,
    codec: "h264",
    outputLocation: OUTPUT_VIDEO,
    inputProps,
    chromiumOptions: { disableWebSecurity: true },
    onProgress: ({ renderedFrames, totalFrames, stitchStage }) => {
      if (stitchStage) {
        process.stdout.write(`\r[render] Stitching audio+video...   `);
      } else {
        const pct = totalFrames
          ? Math.round((renderedFrames / totalFrames) * 100)
          : 0;
        process.stdout.write(
          `\r[render] Frame ${renderedFrames}/${totalFrames} (${pct}%)   `,
        );
      }
    },
  });

  console.log("\n[render] Video rendered.\n");

  // Export poster frame (frame 60 = 2s into video)
  console.log(`[render] Exporting poster frame 60...`);
  await renderStill({
    composition,
    serveUrl: bundleLocation,
    output: OUTPUT_POSTER,
    frame: 60,
    imageFormat: "jpeg",
    jpegQuality: 92,
    inputProps,
  });

  console.log(`[render] Poster exported: ${OUTPUT_POSTER}`);
  console.log("\n✓ Render complete!\n");
}

main().catch((err) => {
  console.error("\n[render] FAILED:", err.message || err);
  process.exit(1);
});
