// gen-attract-vo.mjs — Generate ElevenLabs VOs for AttractV1
// Run: node --env-file=../../.env.local gen-attract-vo.mjs
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const API_KEY = process.env.ELEVENLABS_API_KEY;
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || "aGkVQvWUZi16EH8aZJvT";

if (!API_KEY) {
  console.error("No ELEVENLABS_API_KEY — check .env.local");
  process.exit(1);
}

// Punchy scripts. ~8-10s each. Benefit-first. No fluff.
const SEGMENTS = [
  {
    id: "attract-s1",
    text: "RestoreAssist. Every job documented, every scope compliant, every invoice out the door — without the admin chaos costing your team hours every single week.",
    output: "public/audio/attract-s1.mp3",
  },
  {
    id: "attract-s2",
    text: "Right now your team is spending over three hours per job on manual scopes, paper moisture readings, and data scattered across phones, emails, and spreadsheets. Your team deserves better than that.",
    output: "public/audio/attract-s2.mp3",
  },
  {
    id: "attract-s3",
    text: "AI generates your complete IICRC-cited scope of works in thirty seconds. Every line item calculated from your inspection data. S500, S520, and S700 cited on every scope item. No manual entry. No disputes.",
    output: "public/audio/attract-s3.mp3",
  },
  {
    id: "attract-s4",
    text: "S500, S520, and S700 cited automatically on every scope. State-specific compliance triggers built in for all eight Australian states. Insurers approve faster when every standard is cited on every scope.",
    output: "public/audio/attract-s4.mp3",
  },
  {
    id: "attract-s5",
    text: "Timestamped photos, moisture readings, and classifications captured on site — not pieced together from memory afterward. Court-ready documentation that insurers accept without dispute.",
    output: "public/audio/attract-s5.mp3",
  },
  {
    id: "attract-s6",
    text: "Three complete reports. Absolutely free. No credit card required. Join restoration professionals across Australia already saving hours every week. Start at restoreassist dot app.",
    output: "public/audio/attract-s6.mp3",
  },
];

async function generate(segment) {
  console.log(`[TTS] Generating: ${segment.id}...`);

  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": API_KEY,
      },
      body: JSON.stringify({
        text: segment.text,
        model_id: "eleven_multilingual_v2",
        voice_settings: {
          stability: 0.72,
          similarity_boost: 0.85,
          style: 0.2,
          use_speaker_boost: true,
        },
      }),
    },
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ElevenLabs error ${res.status}: ${err}`);
  }

  const buf = await res.arrayBuffer();
  const outPath = path.resolve(__dirname, segment.output);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, Buffer.from(buf));

  const sizeKB = Math.round(buf.byteLength / 1024);
  const durS = ((buf.byteLength * 8) / 128000).toFixed(1);
  console.log(`[TTS] Done: ${segment.id} → ${sizeKB}KB (~${durS}s)`);
}

console.log(`\nGenerating ${SEGMENTS.length} AttractV1 voiceovers...\n`);
for (const seg of SEGMENTS) {
  await generate(seg);
  await new Promise((r) => setTimeout(r, 600));
}
console.log("\nAll done.");
