/**
 * Generate the onboarding-welcome narration MP3 from the transcript SSOT.
 *
 * Usage (NOT runnable in the review sandbox — needs a real key):
 *   ELEVENLABS_API_KEY=*** ELEVENLABS_VOICE_ID=jSuBIjxMKhqIfb0wCK1F \
 *     pnpm exec tsx scripts/generate-onboarding-narration.ts
 *
 * Output: public/narration/onboarding-welcome.mp3 (resolved by staticFile()).
 */
import fs from "fs/promises";
import path from "path";
import { generateAudio } from "./lib/elevenlabs-tts";
import script from "../content/videos/onboarding-welcome.script.json";

async function main() {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID || script.voiceId;
  if (!apiKey) {
    console.error("[onboarding-narration] ELEVENLABS_API_KEY is required");
    process.exit(1);
  }

  const outDir = path.join(process.cwd(), "public", "narration");
  await fs.mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, "onboarding-welcome.mp3");

  const fullText = script.segments.map((s) => s.text).join(" ");
  console.log(`[onboarding-narration] generating ${fullText.length} chars → ${outPath}`);
  await generateAudio(fullText, outPath, { apiKey, voiceId });

  const { size } = await fs.stat(outPath);
  if (size < 10_000) throw new Error(`MP3 suspiciously small (${size} bytes)`);
  console.log(`[onboarding-narration] ✓ wrote ${size} bytes`);
}

main().catch((err) => {
  console.error("[onboarding-narration] fatal:", err);
  process.exit(1);
});
