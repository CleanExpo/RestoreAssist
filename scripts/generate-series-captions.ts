/**
 * Generate WebVTT captions for the onboarding + walkthrough video SERIES from
 * each transcript SSOT (content/videos/<stem>.script.json).
 *
 * Pure / deterministic — no network, safe to run anywhere (CI, sandbox):
 *   pnpm exec tsx scripts/generate-series-captions.ts
 *
 * Output: public/videos/captions/<stem>.vtt — one per stem below.
 * The SSOT is the single source of truth: regenerating here keeps caption cue
 * timings in lockstep with the narration text and the composition scenes.
 */
import fs from "fs/promises";
import path from "path";
import { segmentsToVtt, type VttSegment } from "./lib/script-to-vtt";

// Wave 2 (setup-wizard) + Wave 3 (tutorials).
const STEMS = [
  "wizard-signin",
  "wizard-signup",
  "wizard-setup",
  "wizard-dashboard",
  "wizard-integrations",
  "wizard-health",
  "tutorial-login",
  "tutorial-signup",
  "tutorial-setup-wizard",
  "tutorial-dashboard",
  "tutorial-inspections",
  "tutorial-reports",
  "tutorial-billing",
  "tutorial-team",
  "tutorial-compliance",
  "tutorial-integrations",
];

interface Script {
  slug: string;
  totalSec: number;
  segments: VttSegment[];
}

async function main() {
  const inDir = path.join(process.cwd(), "content", "videos");
  const outDir = path.join(process.cwd(), "public", "videos", "captions");
  await fs.mkdir(outDir, { recursive: true });

  for (const stem of STEMS) {
    const raw = await fs.readFile(path.join(inDir, `${stem}.script.json`), "utf8");
    const script = JSON.parse(raw) as Script;
    const outPath = path.join(outDir, `${stem}.vtt`);
    await fs.writeFile(outPath, segmentsToVtt(script.segments));
    console.log(`[series-captions] ✓ ${stem}.vtt (${script.segments.length} cues, slug ${script.slug})`);
  }
}

main().catch((err) => {
  console.error("[series-captions] fatal:", err);
  process.exit(1);
});
