/**
 * render-video.js
 * Generic Remotion render — pass COMPOSITION_ID and OUTPUT_NAME as env vars.
 * Usage: COMP=FindV1 OUT=find-v1 node render-video.js
 */
const path = require("path");
const { bundle } = require("@remotion/bundler");
const {
  renderMedia,
  selectComposition,
  renderStill,
} = require("@remotion/renderer");

const ENTRY_POINT = path.resolve(__dirname, "src/index.ts");
const COMPOSITION_ID = process.env.COMP || "FindV1";
const outputName = process.env.OUT || COMPOSITION_ID.toLowerCase();

const OUTPUT_VIDEO = path.resolve(
  __dirname,
  `../../public/videos/${outputName}.mp4`,
);
const OUTPUT_POSTER = path.resolve(
  __dirname,
  `../../public/videos/${outputName}-poster.jpg`,
);

async function main() {
  console.log(`\n[render] Composition: ${COMPOSITION_ID}`);
  console.log(`[render] Output: ${OUTPUT_VIDEO}\n`);
  console.log("[render] Bundling...");

  const bundleLocation = await bundle({
    entryPoint: ENTRY_POINT,
    onProgress: (p) => process.stdout.write(`\r[render] Bundling... ${p}%   `),
  });
  console.log("\n[render] Bundle complete.\n");

  const composition = await selectComposition({
    serveUrl: bundleLocation,
    id: COMPOSITION_ID,
    inputProps: {},
  });

  console.log(
    `[render] ${composition.durationInFrames} frames @ ${composition.fps}fps (${(composition.durationInFrames / composition.fps).toFixed(1)}s)`,
  );

  await renderMedia({
    composition,
    serveUrl: bundleLocation,
    codec: "h264",
    outputLocation: OUTPUT_VIDEO,
    inputProps: {},
    chromiumOptions: { disableWebSecurity: true },
    onProgress: ({ renderedFrames, totalFrames, stitchStage }) => {
      if (stitchStage) {
        process.stdout.write(`\r[render] Stitching...   `);
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

  console.log("\n[render] Video rendered.");

  console.log(`[render] Exporting poster frame 60...`);
  await renderStill({
    composition,
    serveUrl: bundleLocation,
    output: OUTPUT_POSTER,
    frame: 60,
    imageFormat: "jpeg",
    jpegQuality: 92,
    inputProps: {},
  });

  console.log(`[render] Poster: ${OUTPUT_POSTER}`);
  console.log("\n✓ Done!\n");
}

main().catch((err) => {
  console.error("\n[render] FAILED:", err.message || err);
  process.exit(1);
});
