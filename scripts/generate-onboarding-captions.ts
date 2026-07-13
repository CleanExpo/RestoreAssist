/**
 * Generate public/videos/captions/onboarding-welcome.vtt from the transcript.
 * Pure/deterministic — safe to run anywhere (no network).
 *   pnpm exec tsx scripts/generate-onboarding-captions.ts
 */
import fs from "fs/promises";
import path from "path";
import { segmentsToVtt } from "./lib/script-to-vtt";
import script from "../data/content/videos/onboarding-welcome.script.json";

async function main() {
  const outDir = path.join(process.cwd(), "public", "videos", "captions");
  await fs.mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, "onboarding-welcome.vtt");
  await fs.writeFile(outPath, segmentsToVtt(script.segments));
  console.log(`[onboarding-captions] ✓ wrote ${outPath}`);
}

main().catch((err) => {
  console.error("[onboarding-captions] fatal:", err);
  process.exit(1);
});
