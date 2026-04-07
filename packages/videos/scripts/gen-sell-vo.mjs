// scripts/gen-sell-vo.mjs
// Generates 8 separate ElevenLabs TTS segments for the SellV1 composition.
// Usage: ELEVENLABS_API_KEY=<key> node scripts/gen-sell-vo.mjs
//
// Outputs to public/audio/sell-sN.mp3 (one file per scene).
// If ELEVENLABS_API_KEY is not set, placeholder files are written instead
// so the composition still renders without audio.

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Config ──────────────────────────────────────────────────────────────────
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const VOICE_ID = "aGkVQvWUZi16EH8aZJvT";
const OUTPUT_DIR = path.resolve(__dirname, "../public/audio");

const VOICE_SETTINGS = {
  stability: 0.68,
  similarity_boost: 0.85,
  style: 0.15,
  use_speaker_boost: true,
  speed: 0.95,
};

// ─── Segment definitions ─────────────────────────────────────────────────────
// One segment per scene. Each is generated as a separate API call so timing
// can be adjusted per scene without regenerating the entire track.
const SEGMENTS = [
  {
    file: "sell-s1.mp3",
    text: "What does a fully connected restoration workflow actually look like? Let us show you.",
  },
  {
    file: "sell-s2.mp3",
    text: "Your command centre. Every active job, your pipeline value, and pending invoices — at a glance. No spreadsheets. No chasing emails.",
  },
  {
    file: "sell-s3.mp3",
    text: "New inspection. Enter your readings. RestoreAssist generates a complete IICRC-cited scope of works in thirty seconds. Every line item. Every standard.",
  },
  {
    file: "sell-s4.mp3",
    text: "Compliance is built in. S500:2025 on every scope item. State-specific triggers for all eight Australian states. Insurers approve faster.",
  },
  {
    file: "sell-s5.mp3",
    text: "Field capture. Moisture readings timestamped, GPS-tagged, and linked to your floor plan. Court-ready documentation captured on site — not from memory.",
  },
  {
    file: "sell-s6.mp3",
    text: "Professional report ready in minutes. Not hours. Every photo, every reading, every scope item compiled automatically.",
  },
  {
    file: "sell-s7.mp3",
    text: "Invoice out the door before you leave site. Average twenty-three percent faster payment when documentation is complete and insurer-ready.",
  },
  {
    file: "sell-s8.mp3",
    text: "Start your first three jobs free. No credit card. No contract. See why restoration professionals across Australia choose RestoreAssist.",
  },
];

// ─── Helper: write placeholder ────────────────────────────────────────────────
function writePlaceholder(outputPath, text) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `[PLACEHOLDER — no API key] ${text}`);
  console.log(`  [placeholder] ${path.basename(outputPath)}`);
}

// ─── Helper: call ElevenLabs API ─────────────────────────────────────────────
async function generateSegment(segment) {
  const outputPath = path.join(OUTPUT_DIR, segment.file);

  if (!ELEVENLABS_API_KEY) {
    console.warn(
      `[SKIP] ELEVENLABS_API_KEY not set — writing placeholder for ${segment.file}`,
    );
    writePlaceholder(outputPath, segment.text);
    return;
  }

  console.log(`[TTS] Generating: ${segment.file} ...`);

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": ELEVENLABS_API_KEY,
      },
      body: JSON.stringify({
        text: segment.text,
        model_id: "eleven_multilingual_v2",
        voice_settings: VOICE_SETTINGS,
      }),
    },
  );

  if (!response.ok) {
    const body = await response.text().catch(() => "(no body)");
    throw new Error(
      `ElevenLabs API error for ${segment.file}: ${response.status} ${response.statusText} — ${body}`,
    );
  }

  const audioBuffer = await response.arrayBuffer();
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(outputPath, Buffer.from(audioBuffer));

  console.log(`  [done] ${segment.file} → ${outputPath}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\nSellV1 VO Generator — ${SEGMENTS.length} segments\n`);
  console.log(`Voice ID : ${VOICE_ID}`);
  console.log(`Output   : ${OUTPUT_DIR}`);
  console.log(
    `API key  : ${ELEVENLABS_API_KEY ? "set" : "NOT SET (placeholders only)"}`,
  );
  console.log("");

  for (let i = 0; i < SEGMENTS.length; i++) {
    const segment = SEGMENTS[i];
    console.log(`[${i + 1}/${SEGMENTS.length}] ${segment.file}`);
    try {
      await generateSegment(segment);
    } catch (err) {
      console.error(`  [ERROR] ${err.message}`);
      // Don't abort — write a placeholder and continue so remaining segments
      // still attempt to generate.
      writePlaceholder(path.join(OUTPUT_DIR, segment.file), segment.text);
    }

    // 500ms delay between calls to respect ElevenLabs rate limits
    if (i < SEGMENTS.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  console.log(`\nDone. ${SEGMENTS.length} files written to ${OUTPUT_DIR}\n`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
