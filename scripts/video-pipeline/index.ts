/**
 * Video Production Pipeline — CLI Entry Point
 *
 * Usage:
 *   npx tsx scripts/video-pipeline/index.ts --slug water-damage-category-guide --voice 21m00Tcm4TlvDq8ikWAM
 *   npx tsx scripts/video-pipeline/index.ts --slug water-damage-category-guide --step voiceover
 *   npx tsx scripts/video-pipeline/index.ts --slug water-damage-category-guide --dry-run
 *
 * Steps: voiceover | screenshot | render | upload | all (default)
 *
 * Reads script from content/resources/{slug}.json → videoScript field.
 * Environment variables required per step — see individual modules.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { generateVoiceover } from "./generate-voiceover.js";
import { captureScreenshots } from "./capture-screenshots.js";
import { renderVideo } from "./render-video.js";
import { uploadToYouTube } from "./upload-youtube.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PipelineStep = "voiceover" | "screenshot" | "render" | "upload" | "all";

interface CliArgs {
  slug: string;
  voiceId: string;
  step: PipelineStep;
  dryRun: boolean;
  compositionId: string;
  durationInFrames: number;
  fps: number;
}

interface ResourceJson {
  slug: string;
  title: string;
  description: string;
  videoScript?: string;
  transcript?: string;
  tags?: string[];
  thumbnailUrl?: string[];
  youtubeId?: string;
}

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]): CliArgs {
  const args: Record<string, string> = {};
  const flags: Set<string> = new Set();

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        args[key] = next;
        i++;
      } else {
        flags.add(key);
      }
    }
  }

  const slug = args["slug"];
  if (!slug) {
    console.error("Error: --slug is required");
    console.error(
      "Usage: npx tsx scripts/video-pipeline/index.ts --slug <slug> [--voice <voiceId>] [--step voiceover|screenshot|render|upload|all] [--dry-run]"
    );
    process.exit(1);
  }

  const step = (args["step"] as PipelineStep) ?? "all";
  const validSteps: PipelineStep[] = [
    "voiceover",
    "screenshot",
    "render",
    "upload",
    "all",
  ];
  if (!validSteps.includes(step)) {
    console.error(
      `Error: --step must be one of: ${validSteps.join(", ")}. Got: ${step}`
    );
    process.exit(1);
  }

  return {
    slug,
    voiceId: args["voice"] ?? "21m00Tcm4TlvDq8ikWAM", // ElevenLabs "Rachel" default
    step,
    dryRun: flags.has("dry-run"),
    compositionId: args["composition"] ?? "VideoGuide",
    durationInFrames: parseInt(args["frames"] ?? "5400", 10), // 180s @ 30fps default
    fps: parseInt(args["fps"] ?? "30", 10),
  };
}

// ---------------------------------------------------------------------------
// Resource loader
// ---------------------------------------------------------------------------

function loadResourceJson(repoRoot: string, slug: string): ResourceJson {
  const resourcePath = path.join(
    repoRoot,
    "content",
    "resources",
    `${slug}.json`
  );

  if (!fs.existsSync(resourcePath)) {
    throw new Error(
      `Resource JSON not found: ${resourcePath}\n` +
        `Create content/resources/${slug}.json with at least a "videoScript" field.`
    );
  }

  const raw = fs.readFileSync(resourcePath, "utf-8");
  const data = JSON.parse(raw) as ResourceJson;

  if (!data.videoScript) {
    throw new Error(
      `No "videoScript" field in ${resourcePath}.\n` +
        `Add a "videoScript" field with the voiceover script text.`
    );
  }

  return data;
}

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------

async function runPipeline(): Promise<void> {
  const argv = process.argv.slice(2);
  const args = parseArgs(argv);

  const repoRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../.."
  );

  console.log("\n=== RestoreAssist Video Pipeline ===");
  console.log(`Slug:     ${args.slug}`);
  console.log(`Step:     ${args.step}`);
  console.log(`Dry-run:  ${args.dryRun}`);
  console.log(`Voice ID: ${args.voiceId}`);
  console.log("=====================================\n");

  // Load resource JSON
  const resource = loadResourceJson(repoRoot, args.slug);
  const videoScript = resource.videoScript!;

  const runVoiceover = args.step === "all" || args.step === "voiceover";
  const runScreenshot = args.step === "all" || args.step === "screenshot";
  const runRender = args.step === "all" || args.step === "render";
  const runUpload =
    (args.step === "all" || args.step === "upload") && !args.dryRun;

  // Step 1 — Generate voiceover
  if (runVoiceover) {
    console.log("--- Step 1: Generate Voiceover ---");
    await generateVoiceover({
      text: videoScript,
      voiceId: args.voiceId,
      slug: args.slug,
    });
  }

  // Step 2 — Capture screenshots
  if (runScreenshot) {
    console.log("\n--- Step 2: Capture Screenshots ---");
    await captureScreenshots({ verbose: true });
  }

  // Step 3 — Render video
  if (runRender) {
    console.log("\n--- Step 3: Render Video ---");
    await renderVideo({
      slug: args.slug,
      compositionId: args.compositionId,
      durationInFrames: args.durationInFrames,
      fps: args.fps,
      inputProps: {
        voiceoverSrc: `/voiceovers/${args.slug}.mp3`,
        slug: args.slug,
        title: resource.title,
      },
    });
  }

  // Step 4 — Upload to YouTube
  if (runUpload) {
    console.log("\n--- Step 4: Upload to YouTube ---");

    const videoPath = path.join(
      repoRoot,
      "public",
      "rendered-videos",
      `${args.slug}.mp4`
    );

    const thumbnailPath = path.join(
      repoRoot,
      "public",
      "screenshots",
      "dashboard.png"
    );

    await uploadToYouTube({
      videoPath,
      title: resource.title,
      description: resource.description,
      tags: resource.tags ?? [],
      thumbnailPath: fs.existsSync(thumbnailPath) ? thumbnailPath : undefined,
      privacyStatus: "private", // Start private — review before publishing
    });
  } else if (args.dryRun && (args.step === "all" || args.step === "upload")) {
    console.log("\n--- Step 4: Upload to YouTube (SKIPPED — dry-run mode) ---");
    console.log(
      "Re-run without --dry-run to upload after reviewing the rendered video."
    );
  }

  console.log("\n=== Pipeline complete ===");
}

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

runPipeline().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`\n[pipeline] Fatal error: ${message}`);
  process.exit(1);
});
