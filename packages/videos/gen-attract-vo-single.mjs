// gen-attract-vo-single.mjs — Generate ONE continuous ElevenLabs VO for AttractV1
// Single API call = single performance = seamless voice throughout the video.
// Run: ELEVENLABS_API_KEY=sk_... node gen-attract-vo-single.mjs
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
const FULL_SCRIPT = `RestoreAssist. Every job documented, every scope compliant, every invoice out the door — without the admin chaos costing your team hours every single week.

Right now your team is spending over three hours per job on manual scopes, paper moisture readings, and data scattered across phones, emails, and spreadsheets. Your team deserves better than that.

AI generates your complete IICRC-cited scope of works in thirty seconds. Every line item calculated from your inspection data. S500, S520, and S700 cited on every scope item. No manual entry. No disputes.

State-specific compliance triggers built in for all eight Australian states. Insurers approve faster when every standard is cited on every scope.

Timestamped photos, moisture readings, and classifications captured on site — not pieced together from memory afterward. Court-ready documentation that insurers accept without dispute.

Three complete reports. Absolutely free. No credit card required. Join restoration professionals across Australia already saving hours every week. Start at restoreassist dot app.`;

const OUTPUT = "public/audio/attract-full.mp3";

async function generate() {
  console.log(`\n[TTS] Generating single continuous VO for AttractV1...`);
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
          speed: 0.85,
        },
      }),
    },
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ElevenLabs error ${res.status}: ${err}`);
  }

  const buf = await res.arrayBuffer();
  const outPath = path.resolve(__dirname, OUTPUT);
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
