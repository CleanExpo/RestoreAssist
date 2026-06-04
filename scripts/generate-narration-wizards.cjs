/**
 * Generate ElevenLabs narration for 6 setup wizard videos.
 */
const fs = require("fs");
const path = require("path");

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID;
const OUT_DIR = path.join(process.cwd(), "remotion/assets/narration");

if (!ELEVENLABS_API_KEY || !VOICE_ID) {
  console.error("Missing ELEVENLABS_API_KEY or ELEVENLABS_VOICE_ID");
  process.exit(1);
}

const SCRIPTS = [
  {
    slug: "wizard-signin",
    text: "Signing in to RestoreAssist is simple. Navigate to restoreassist.app and click Sign In. Enter your email and password, or use Google SSO for instant access. You're now on your dashboard, ready to manage inspections, generate reports, and track your team's progress.",
  },
  {
    slug: "wizard-signup",
    text: "Creating your RestoreAssist account takes under two minutes. Click Get Started on the homepage. Enter your name, email, and create a secure password. Check your inbox for a verification link. Add your company name and ABN. Then click Activate — your account is live and ready to use.",
  },
  {
    slug: "wizard-setup",
    text: "The Setup Wizard guides you through activation in five minutes. First, enter your ABN — we auto-hydrate your company details from the Australian Business Register. Next, upload your logo and set your brand colours. Choose your pricing tier: Standard, Premium, or Enterprise. Connect your accounting software — Xero, MYOB, QuickBooks, ServiceM8, or Ascora. Run Workspace Health to verify everything is green. Then click Activate. You're ready to start inspections.",
  },
  {
    slug: "wizard-dashboard",
    text: "Your dashboard is mission control for your restoration business. The overview shows active jobs, pending claims, and team status at a glance. Click New Inspection to start documenting a job. View AI-generated reports awaiting your review. Track team performance and business metrics in Analytics. Manage your profile, team, and integrations from the Settings gear icon. Everything you need, one click away.",
  },
  {
    slug: "wizard-integrations",
    text: "RestoreAssist connects with the tools you already use. Go to Settings, then Integrations, and pick your platform. Connect Xero for automatic invoice sync. Link MYOB for streamlined bookkeeping. Integrate QuickBooks for real-time financial data. Sync ServiceM8 for job scheduling. Or connect Ascora for field service management. Once connected, data flows both ways — no double entry, no manual exports.",
  },
  {
    slug: "wizard-health",
    text: "Workspace Health is your system status dashboard. Navigate to Settings, then Workspace Health. Green means ready. Yellow means attention needed. Red means blocked. Click any red item for step-by-step resolution. Re-run the check to confirm all systems are green. A healthy workspace means reliable inspections, accurate reports, and happy clients.",
  },
];

async function generate(slug, text) {
  const outPath = path.join(OUT_DIR, `${slug}.mp3`);
  if (fs.existsSync(outPath)) {
    console.log(`  SKIP: ${slug}.mp3 exists`);
    return;
  }

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
    method: "POST",
    headers: {
      "xi-api-key": ELEVENLABS_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text,
      model_id: "eleven_multilingual_v2",
      voice_settings: { stability: 0.4, similarity_boost: 0.8 },
    }),
  });

  if (!res.ok) {
    console.error(`  FAIL: ${slug} — ${res.status} ${await res.text()}`);
    return;
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(outPath, buffer);
  console.log(`  OK: ${slug}.mp3 (${(buffer.length / 1024).toFixed(0)} KB)`);
}

(async () => {
  console.log("Generating narration for 6 wizard videos...\n");
  for (const { slug, text } of SCRIPTS) {
    await generate(slug, text);
  }
  console.log("\nDone.");
})();
