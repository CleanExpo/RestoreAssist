/**
 * render-video.ts
 * Calls Remotion's renderMedia() to produce an MP4 from a composition.
 * Output: public/rendered-videos/{slug}.mp4
 *
 * Requires @remotion/renderer to be installed:
 *   npm install --save-dev @remotion/renderer remotion
 *
 * The Remotion composition bundle must exist at D:\Claude-Code-Remotion\RestoreAssist
 * or at the REMOTION_BUNDLE_PATH env var.
 */

import fs from "fs";
import path from "path";

export interface RenderVideoOptions {
  /** Unique slug — determines output filename and voiceover source */
  slug: string;
  /** Remotion composition ID to render */
  compositionId: string;
  /** Total frames in the composition */
  durationInFrames: number;
  /** Frames per second (default: 30) */
  fps?: number;
  /** Override voiceover path. Default: public/voiceovers/{slug}.mp3 */
  voiceoverPath?: string;
  /** Override output directory. Default: <repo-root>/public/rendered-videos */
  outputDir?: string;
  /** Override Remotion bundle path. Default: REMOTION_BUNDLE_PATH env or D:\Claude-Code-Remotion\RestoreAssist */
  bundlePath?: string;
  /** Extra Remotion input props passed to the composition */
  inputProps?: Record<string, unknown>;
  /** Concurrency for Remotion renderer (default: half of CPU count) */
  concurrency?: number;
  /** Video codec (default: h264) */
  codec?: "h264" | "h265" | "vp8" | "vp9" | "gif";
}

export interface RenderVideoResult {
  outputPath: string;
  slug: string;
  compositionId: string;
  durationInFrames: number;
  fps: number;
}

/**
 * Render a Remotion composition to MP4.
 * Voiceover is injected as an inputProp so the composition can reference it.
 */
export async function renderVideo(
  options: RenderVideoOptions
): Promise<RenderVideoResult> {
  const {
    slug,
    compositionId,
    durationInFrames,
    fps = 30,
    codec = "h264",
  } = options;

  // Dynamic import — graceful error if @remotion/renderer not installed
  let renderMedia: typeof import("@remotion/renderer").renderMedia;
  let selectComposition: typeof import("@remotion/renderer").selectComposition;
  let bundle: typeof import("@remotion/bundler").bundle;

  try {
    const renderer = await import("@remotion/renderer");
    renderMedia = renderer.renderMedia;
    selectComposition = renderer.selectComposition;
  } catch {
    throw new Error(
      "@remotion/renderer is not installed. Run: npm install --save-dev @remotion/renderer remotion"
    );
  }

  try {
    const bundler = await import("@remotion/bundler");
    bundle = bundler.bundle;
  } catch {
    throw new Error(
      "@remotion/bundler is not installed. Run: npm install --save-dev @remotion/bundler"
    );
  }

  const repoRoot = path.resolve(
    path.dirname(new URL(import.meta.url).pathname),
    "../.."
  );

  const outputDir =
    options.outputDir ?? path.join(repoRoot, "public", "rendered-videos");
  fs.mkdirSync(outputDir, { recursive: true });

  const outputPath = path.join(outputDir, `${slug}.mp4`);

  // Resolve voiceover path
  const voiceoverPath =
    options.voiceoverPath ??
    path.join(repoRoot, "public", "voiceovers", `${slug}.mp3`);

  if (!fs.existsSync(voiceoverPath)) {
    throw new Error(
      `Voiceover file not found at ${voiceoverPath}. ` +
        "Run the voiceover step first or pass --skip-voiceover."
    );
  }

  // Resolve Remotion bundle
  const remotionBundleSrc =
    options.bundlePath ??
    process.env.REMOTION_BUNDLE_PATH ??
    "D:/Claude-Code-Remotion/RestoreAssist";

  console.log(
    `[render] Bundling Remotion project from ${remotionBundleSrc}...`
  );

  const bundleLocation = await bundle({
    entryPoint: path.join(remotionBundleSrc, "src", "index.ts"),
    onProgress: (progress) => {
      process.stdout.write(`\r[render] Bundling... ${progress}%`);
    },
  });
  console.log("\n[render] Bundle complete.");

  const inputProps: Record<string, unknown> = {
    ...(options.inputProps ?? {}),
    voiceoverSrc: `/voiceovers/${slug}.mp3`,
    slug,
  };

  console.log(
    `[render] Selecting composition ${compositionId} (${durationInFrames} frames @ ${fps}fps)...`
  );

  const composition = await selectComposition({
    serveUrl: bundleLocation,
    id: compositionId,
    inputProps,
  });

  console.log(`[render] Rendering to ${outputPath}...`);

  await renderMedia({
    composition: {
      ...composition,
      durationInFrames,
      fps,
    },
    serveUrl: bundleLocation,
    codec,
    outputLocation: outputPath,
    inputProps,
    concurrency: options.concurrency,
    onProgress: ({ renderedFrames, totalFrames }) => {
      const pct = totalFrames
        ? Math.round((renderedFrames / totalFrames) * 100)
        : 0;
      process.stdout.write(
        `\r[render] Rendering frame ${renderedFrames}/${totalFrames} (${pct}%)`
      );
    },
  });

  console.log(`\n[render] Saved to ${outputPath}`);

  return { outputPath, slug, compositionId, durationInFrames, fps };
}
