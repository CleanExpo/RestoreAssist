/**
 * Generate ElevenLabs narration MP3s for the onboarding + walkthrough video
 * SERIES from each transcript SSOT (content/videos/<stem>.script.json).
 *
 * NOT runnable in the review sandbox — needs a real key. Run on a dev host:
 *   ELEVENLABS_API_KEY=*** ELEVENLABS_VOICE_ID=jSuBIjxMKhqIfb0wCK1F \
 *     pnpm exec tsx scripts/generate-series-narration.ts
 *
 * Output: public/narration/<stem>.mp3 (resolved by staticFile() in the
 * compositions). One voice for the whole series — never re-declare voice
 * settings; they live in scripts/lib/elevenlabs-tts.ts.
 */
import fs from "fs/promises";
import path from "path";
import { generateAudio } from "./lib/elevenlabs-tts";

// Wave 2 (setup-wizard). Add Wave 3 tutorial stems here as their SSOTs land.
const STEMS = [
  "wizard-signin",
  "wizard-signup",
  "wizard-setup",
  "wizard-dashboard",
  "wizard-integrations",
  "wizard-health",
];

interface Script {
  slug: string;
  voiceId: string;
  segments: { text: string }[];
}

async function main() {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    console.error("[series-narration] ELEVENLABS_API_KEY is required");
    process.exit(1);
  }

  const inDir = path.join(process.cwd(), "content", "videos");
  const outDir = path.join(process.cwd(), "public", "narration");
  await fs.mkdir(outDir, { recursive: true });

  for (const stem of STEMS) {
    const raw = await fs.readFile(path.join(inDir, `${stem}.script.json`), "utf8");
    const script = JSON.parse(raw) as Script;
    const voiceId = process.env.ELEVENLABS_VOICE_ID || script.voiceId;
    const outPath = path.join(outDir, `${stem}.mp3`);
    const fullText = script.segments.map((s) => s.text).join(" ");

    console.log(`[series-narration] ${stem}: ${fullText.length} chars → ${outPath}`);
    await generateAudio(fullText, outPath, { apiKey, voiceId });

    const { size } = await fs.stat(outPath);
    if (size < 10_000) throw new Error(`${stem}.mp3 suspiciously small (${size} bytes)`);
    console.log(`[series-narration] ✓ ${stem}.mp3 (${size} bytes)`);
  }
}

main().catch((err) => {
  console.error("[series-narration] fatal:", err);
  process.exit(1);
});
