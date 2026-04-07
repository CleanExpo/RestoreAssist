// scripts/gen-advise-vo.mjs — Generate 7 separate ElevenLabs VO segments for AdviseV1
// Each segment is a separate API call so they can be individually re-generated if needed.
// Run: ELEVENLABS_API_KEY=sk_... node scripts/gen-advise-vo.mjs
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const API_KEY = process.env.ELEVENLABS_API_KEY;
const VOICE_ID = "aGkVQvWUZi16EH8aZJvT";
const OUTPUT_DIR = "public/audio/";

if (!API_KEY) {
  console.error("No ELEVENLABS_API_KEY — check env");
  process.exit(1);
}

const SEGMENTS = [
  {
    file: "advise-s1.mp3",
    text: "The IICRC S500 standard governs how water damage restoration must be documented, classified, and remediated. The 2025 edition raises the bar. Non-compliant documentation is the number one reason insurance claims are disputed in Australia.",
  },
  {
    file: "advise-s2.mp3",
    text: "Last financial year, tens of thousands of dollars in legitimate claims were disputed — not because the work wasn't done, but because the documentation didn't meet S500 requirements. Missing moisture readings. No instrument serial numbers. Scope items without standard citations.",
  },
  {
    file: "advise-s3.mp3",
    text: "IICRC S500:2025 defines five water damage classes. Class one is slow evaporation — minimal moisture absorbed into materials. Class two is fast evaporation — significant moisture in carpets and walls. Class three is fastest evaporation — ceilings and insulation saturated. Class four requires specialty drying techniques for dense materials like hardwood and concrete.",
  },
  {
    file: "advise-s4.mp3",
    text: "Compliant documentation must capture the water category and class at the point of loss. Every moisture reading needs the instrument type, serial number, and calibration date. Your scope must cite the specific IICRC S500:2025 section for every line item. Progress readings at every drying check — not just start and end. Final clearance readings confirming pre-loss condition.",
  },
  {
    file: "advise-s5.mp3",
    text: "RestoreAssist enforces S500:2025 automatically. AI generates scope items with the correct section citations. Water class and category are captured at inspection and locked to the job record. Moisture readings require instrument details before submission. State-specific triggers apply the correct rules for all eight Australian states.",
  },
  {
    file: "advise-s6.mp3",
    text: "The results speak clearly. Restoration professionals using RestoreAssist save an average of three hours per job on documentation. Insurer approval rates improve by twenty-three percent when every scope item carries the correct standard citation. Every report, every time.",
  },
  {
    file: "advise-s7.mp3",
    text: "Compliant documentation. Every job. Automatically. Three complete jobs absolutely free — no credit card required. Start today at restoreassist dot app.",
  },
];

async function generateSegment(segment) {
  console.log(`\n[TTS] Generating ${segment.file}...`);
  console.log(`[TTS] Text: ${segment.text.length} characters`);

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
          stability: 0.75,
          similarity_boost: 0.82,
          style: 0.1,
          use_speaker_boost: true,
          speed: 0.92,
        },
      }),
    },
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(
      `ElevenLabs error ${res.status} for ${segment.file}: ${err}`,
    );
  }

  const buf = await res.arrayBuffer();
  // Resolve relative to package root (one level up from scripts/)
  const outPath = path.resolve(__dirname, "..", OUTPUT_DIR, segment.file);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, Buffer.from(buf));

  const sizeKB = Math.round(buf.byteLength / 1024);
  const durS = ((buf.byteLength * 8) / 128000).toFixed(1);
  console.log(`[TTS] Done → ${OUTPUT_DIR}${segment.file}`);
  console.log(`[TTS] Size: ${sizeKB}KB  ~${durS}s`);
}

async function generateAll() {
  console.log(`\n[TTS] AdviseV1 VO generator — ${SEGMENTS.length} segments`);
  console.log(`[TTS] Voice: ${VOICE_ID}`);
  console.log(`[TTS] Model: eleven_multilingual_v2`);
  console.log(`[TTS] Output: ${OUTPUT_DIR}\n`);

  for (const segment of SEGMENTS) {
    await generateSegment(segment);
  }

  console.log(`\n[TTS] All ${SEGMENTS.length} segments complete.`);
  console.log(`[TTS] Files written to packages/videos/${OUTPUT_DIR}`);
}

generateAll()
  .then(() => console.log("\nDone."))
  .catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
