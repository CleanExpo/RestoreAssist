// scripts/gen-find-vo.mjs — Generate ONE continuous ElevenLabs VO for FindV1
// Single API call = single performance = seamless voice throughout the video.
// Run: ELEVENLABS_API_KEY=sk_... node scripts/gen-find-vo.mjs
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const API_KEY = process.env.ELEVENLABS_API_KEY;
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || "aGkVQvWUZi16EH8aZJvT";

if (!API_KEY) {
  console.error("No ELEVENLABS_API_KEY — check env");
  process.exit(1);
}

// Full script as one continuous performance.
// Natural sentence flow — no scene markers.
// Natural reading ~58s at 90% speed.
const FULL_SCRIPT = `Restoration contractors across Australia are spending more than three hours per job on admin. Manual moisture readings. Paper-based scopes. Data split across phones, emails, and spreadsheets. Then typed up from memory.

Insurers dispute underdocumented claims. Your team loses hours that should go to jobs. This is the standard. Until now.

RestoreAssist connects every step. Inspection on site. Scope generated in thirty seconds. IICRC S500 2025 cited on every line item. Moisture readings captured digitally with timestamps and GPS. Insurers approve faster because everything is already documented.

State-specific compliance triggers built in for all eight Australian states. Five water damage classes. Every form, every measurement, every photo — automatically compiled into a professional report.

Three complete jobs. Absolutely free. No credit card required. See why restoration professionals across Australia are saving hours every week. Start today at restoreassist dot app.`;

const OUTPUT = "public/audio/find-full.mp3";

async function generate() {
  console.log(`\n[TTS] Generating single continuous VO for FindV1...`);
  console.log(`[TTS] Voice: ${VOICE_ID}`);
  console.log(`[TTS] Script: ${FULL_SCRIPT.length} characters\n`);

  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": API_KEY,
      },
      body: JSON.stringify({
        text: FULL_SCRIPT,
        model_id: "eleven_multilingual_v2",
        voice_settings: {
          stability: 0.72,
          similarity_boost: 0.85,
          style: 0.2,
          use_speaker_boost: true,
          speed: 0.9,
        },
      }),
    },
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ElevenLabs error ${res.status}: ${err}`);
  }

  const buf = await res.arrayBuffer();
  // Resolve relative to package root (one level up from scripts/)
  const outPath = path.resolve(__dirname, "..", OUTPUT);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, Buffer.from(buf));

  const sizeKB = Math.round(buf.byteLength / 1024);
  const durS = ((buf.byteLength * 8) / 128000).toFixed(1);
  console.log(`[TTS] Done → ${OUTPUT}`);
  console.log(`[TTS] Size: ${sizeKB}KB`);
  console.log(`[TTS] Duration: ~${durS}s`);
}

generate()
  .then(() => console.log("\nDone."))
  .catch(console.error);
