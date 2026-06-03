/**
 * @file scripts/generate-narration.ts
 * Generate ElevenLabs narration audio for each Remotion composition.
 *
 * Usage:
 *   ELEVENLABS_API_KEY=*** ELEVENLABS_VOICE_ID=jSuBIjxMKhqIfb0wCK1F pnpm exec tsx scripts/generate-narration.ts
 *
 * Outputs MP3 files to remotion/assets/narration/ for embedding in videos.
 * Voice ID: jSuBIjxMKhqIfb0wCK1F (CEO clone, canonical for all UGN projects)
 */

import fs from 'fs/promises';
import path from 'path';

/* ── Config ─────────────────────────────────────────────────────────── */

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'jSuBIjxMKhqIfb0wCK1F';
const OUTPUT_DIR = path.join(process.cwd(), 'remotion', 'assets', 'narration');

interface NarrationScript {
  videoId: string;
  segments: Array<{
    text: string;
    startSec: number;   // Where in the video this narration starts
    durationSec: number; // Expected duration (used to verify pacing)
  }>;
}

/* ── Narration scripts for all 19 Remotion videos ────────────────────── */

/**
 * Duration targets (seconds) based on current frame counts at 30fps.
 * Sign-in: 600f=20s  → extended to 1350f=45s
 * Pricing: 720f=24s  → extended to 1800f=60s
 * Analytics: 780f=26s → extended to 1350f=45s
 * Team: 780f=26s → extended to 1500f=50s
 * Sign-up: 840f=28s → extended to 1800f=60s
 */

const SCRIPTS: NarrationScript[] = [
  {
    videoId: 'sign-in',
    segments: [
      {text: "Welcome back to RestoreAssist.", startSec: 0, durationSec: 3},
      {text: "Enter your registered email address, then your secure password.", startSec: 3, durationSec: 5},
      {text: "For added security, RestoreAssist supports single sign-on through your company's identity provider.", startSec: 10, durationSec: 7},
      {text: "Once authenticated, you'll land on your personal dashboard with everything at a glance.", startSec: 18, durationSec: 5},
    ],
  },
  {
    videoId: 'sign-up',
    segments: [
      {text: "Welcome to RestoreAssist. Let's get your restoration business set up.", startSec: 0, durationSec: 3},
      {text: "Start with your name, email, and a secure password.", startSec: 3, durationSec: 4},
      {text: "Add your business details: company name, ABN, and contact info. We verify your ABN against the Australian Business Register automatically.", startSec: 10, durationSec: 8},
      {text: "Check your email for a verification code to activate your account.", startSec: 20, durationSec: 5},
      {text: "Our Setup Wizard walks you through five quick steps: confirming your profile, AI-hydrated defaults, optional integrations, health checks, and workspace activation.", startSec: 28, durationSec: 10},
      {text: "Your RestoreAssist workspace is now live. Let's start restoring with confidence.", startSec: 40, durationSec: 4},
    ],
  },
  {
    videoId: 'dashboard-walkthrough',
    segments: [
      {text: "Welcome to your RestoreAssist dashboard — command central for your restoration business.", startSec: 0, durationSec: 4},
      {text: "The sidebar gives you one-tap access to inspections, reports, clients, billing, and team management.", startSec: 4, durationSec: 5},
      {text: "Your stats cards show key metrics at a glance: total inspections, reports generated, active clients, and monthly revenue.", startSec: 11, durationSec: 6},
      {text: "Recent inspections appear here with their status. Click through to continue working on any job.", startSec: 19, durationSec: 5},
      {text: "Quick actions let you jump straight into creating a new inspection, report, client record, or invoice.", startSec: 26, durationSec: 5},
    ],
  },
  {
    videoId: 'create-inspection',
    segments: [
      {text: "Starting an inspection takes seconds. From the dashboard, tap New Inspection.", startSec: 0, durationSec: 4},
      {text: "Select the client and property. If it's a new client, add them in two taps.", startSec: 6, durationSec: 4},
      {text: "Choose the hazard type: water damage, fire, mould, or storm. Each type gives you the right checklist automatically.", startSec: 12, durationSec: 6},
      {text: "Record moisture readings with your equipment. Custom calibration ensures accuracy for every sensor.", startSec: 20, durationSec: 5},
      {text: "Capture photos, notes, and evidence automatically timestamped and GPS-tagged for chain of custody.", startSec: 27, durationSec: 5},
      {text: "Your inspection is saved in real time. Resume from any device, any time.", startSec: 34, durationSec: 4},
    ],
  },
  {
    videoId: 'report-builder',
    segments: [
      {text: "Generate professional IICRC S500-compliant reports in minutes, not hours.", startSec: 0, durationSec: 4},
      {text: "After your inspection, tap Generate Report. AI drafts the full document from your evidence, readings, and notes.", startSec: 6, durationSec: 6},
      {text: "Review the draft with professional formatting. Add notes, adjust scope, or sign off as-is.", startSec: 14, durationSec: 5},
      {text: "Sign digitally with a legally binding electronic signature. No printing needed.", startSec: 22, durationSec: 4},
      {text: "Share instantly via PDF or the client portal. Your report reaches stakeholders in seconds.", startSec: 28, durationSec: 5},
      {text: "Professional, compliant, delivered. That's the RestoreAssist difference.", startSec: 35, durationSec: 3},
    ],
  },
  {
    videoId: 'client-portal',
    segments: [
      {text: "Share reports securely with your clients through the RestoreAssist portal.", startSec: 0, durationSec: 4},
      {text: "From any report, tap Share. Generate a secure access link with expiry controls.", startSec: 6, durationSec: 5},
      {text: "Your client receives a branded portal with the full report, evidence gallery, and progress timeline.", startSec: 14, durationSec: 6},
      {text: "They can download the PDF, leave comments, and approve the work — all in one place.", startSec: 23, durationSec: 5},
      {text: "No email attachments. No version confusion. Just clean, professional communication.", startSec: 30, durationSec: 4},
    ],
  },
  {
    videoId: 'why-restoreassist',
    segments: [
      {text: "Why do Australian restoration teams choose RestoreAssist?", startSec: 0, durationSec: 3},
      {text: "Because running on paper and spreadsheets costs you two hours per report.", startSec: 5, durationSec: 4},
      {text: "Because scattered photos, lost notes, and manual follow-ups slow you down.", startSec: 11, durationSec: 4},
      {text: "RestoreAssist brings everything into one seamless workflow: inspection, evidence, report, quote, invoice.", startSec: 17, durationSec: 6},
      {text: "Built for Australian restorers with IICRC compliance, ABN verification, and local insurance acceptance.", startSec: 25, durationSec: 6},
      {text: "Start your free trial today. Fourteen days, full access, no credit card required.", startSec: 34, durationSec: 4},
    ],
  },
  {
    videoId: 'byok-explainer',
    segments: [
      {text: "Bring Your Own Knowledge and Equipment. No vendor lock-in, no forced hardware.", startSec: 0, durationSec: 4},
      {text: "Your existing moisture meters, thermal cameras, and air quality sensors all work with RestoreAssist.", startSec: 6, durationSec: 5},
      {text: "Import data via CSV, JSON, or direct Bluetooth pairing. If it exports data, it works.", startSec: 13, durationSec: 5},
      {text: "Here's the workflow: take a reading, send it via Bluetooth or manual entry, it's auto-mapped to your floor plan, and appears instantly in your report.", startSec: 21, durationSec: 8},
      {text: "Zero hardware lock-in cost. Unlimited integrations. Full data portability.", startSec: 32, durationSec: 5},
      {text: "RestoreAssist adapts to you, not the other way around.", startSec: 39, durationSec: 3},
    ],
  },
  {
    videoId: 'inspections-list',
    segments: [
      {text: "Manage all your inspections from one central list.", startSec: 0, durationSec: 3},
      {text: "Filter by status, date, technician, or client. Search across job numbers or property addresses.", startSec: 5, durationSec: 5},
      {text: "Each row shows the job reference, client, property, status, and upcoming actions.", startSec: 12, durationSec: 5},
      {text: "Tap any inspection to view full details, evidence, and team assignments.", startSec: 19, durationSec: 4},
      {text: "Sort, group, and export your list to CSV for accounting or compliance audits.", startSec: 25, durationSec: 4},
      {text: "Every action is tracked in the audit log for complete accountability.", startSec: 31, durationSec: 4},
    ],
  },
  {
    videoId: 'evidence-capture',
    segments: [
      {text: "Capture court-admissible evidence directly from your mobile device.", startSec: 0, durationSec: 4},
      {text: "Tap the camera shutter to take high-resolution photos, automatically tagged with timestamp and GPS coordinates.", startSec: 6, durationSec: 6},
      {text: "Photos are auto-organised by room, damage type, and collection order.", startSec: 15, durationSec: 4},
      {text: "Review your evidence gallery, add annotations, and flag key images for the report.", startSec: 22, durationSec: 5},
      {text: "Everything syncs in real time. Your evidence holds up in any insurance or legal claim.", startSec: 30, durationSec: 4},
    ],
  },
  {
    videoId: 'moisture-mapping',
    segments: [
      {text: "Record moisture readings with custom-calibrated equipment for precision results.", startSec: 0, durationSec: 4},
      {text: "Each reading is plotted on your floor plan automatically, showing affected areas at a glance.", startSec: 6, durationSec: 5},
      {text: "Set dry goals and track progress over time with trend charts.", startSec: 13, durationSec: 4},
      {text: "Export readings to CSV for building science analysis or insurance documentation.", startSec: 19, durationSec: 4},
      {text: "RestoreAssist supports Tramex, Protimeter, Delmhorst, FLIR, and any device that exports data.", startSec: 25, durationSec: 5},
    ],
  },
  {
    videoId: 'quote-builder',
    segments: [
      {text: "Generate professional quotes from your inspection scope in seconds.", startSec: 0, durationSec: 4},
      {text: "Line items auto-populate from identified hazards, affected rooms, and labour estimates.", startSec: 6, durationSec: 5},
      {text: "Adjust quantities, rates, and materials. Add your margin and terms.", startSec: 13, durationSec: 4},
      {text: "The quote is formatted professionally with your branding, ABN, and company details.", startSec: 19, durationSec: 4},
      {text: "Convert approved quotes to invoices with one tap. Track payment status in real time.", startSec: 25, durationSec: 5},
    ],
  },
  {
    videoId: 'invoice-generator',
    segments: [
      {text: "Generate GST-compliant invoices from approved quotes or manual entry.", startSec: 0, durationSec: 4},
      {text: "Every invoice includes your branding, ABN, line items, and automatic GST calculation at ten percent.", startSec: 6, durationSec: 5},
      {text: "Send via email or the client portal. Track open, view, and payment status.", startSec: 13, durationSec: 4},
      {text: "Integrates with Xero, MYOB, and QuickBooks for seamless accounting.", startSec: 19, durationSec: 4},
      {text: "Set up recurring invoices for retainer or maintenance contracts.", startSec: 25, durationSec: 4},
    ],
  },
  {
    videoId: 'compliance-checklists',
    segments: [
      {text: "Every inspection follows IICRC S500 standards with built-in compliance checklists.", startSec: 0, durationSec: 4},
      {text: "Checklists adapt to your hazard type: water damage categories, fire restoration classes, or mould remediation protocols.", startSec: 6, durationSec: 6},
      {text: "Each step cites the relevant S500 edition and section for legal defensibility.", startSec: 14, durationSec: 4},
      {text: "Photo evidence is linked directly to checklist items for complete traceability.", startSec: 20, durationSec: 4},
      {text: "Export compliance reports accepted by all major Australian insurers.", startSec: 26, durationSec: 4},
    ],
  },
  {
    videoId: 'analytics-overview',
    segments: [
      {text: "Track your business performance with real-time analytics.", startSec: 0, durationSec: 3},
      {text: "Revenue charts show month-by-month trends, job win rates, and average invoice value.", startSec: 5, durationSec: 5},
      {text: "Technician performance scores show completion rates, inspection quality, and client satisfaction.", startSec: 13, durationSec: 5},
      {text: "Client acquisition funnel tracks leads, quotes, and conversions.", startSec: 21, durationSec: 4},
      {text: "Export data to CSV or connect your BI tool via API for deeper analysis.", startSec: 27, durationSec: 4},
    ],
  },
  {
    videoId: 'team-management',
    segments: [
      {text: "Invite and manage your entire restoration crew from one dashboard.", startSec: 0, durationSec: 4},
      {text: "Send email invitations with role-based permissions in seconds.", startSec: 6, durationSec: 4},
      {text: "RestoreAssist auto-verifies trade licences against state registers.", startSec: 12, durationSec: 4},
      {text: "Assign permissions: who can inspect, report, quote, invoice, and manage billing.", startSec: 18, durationSec: 5},
      {text: "The team dashboard shows activity, job assignments, and completion rates for every member.", startSec: 25, durationSec: 5},
      {text: "Your crew is set up, verified, and ready to restore.", startSec: 32, durationSec: 3},
    ],
  },
  {
    videoId: 'mobile-workflow',
    segments: [
      {text: "Take RestoreAssist into the field with the mobile-optimised workflow.", startSec: 0, durationSec: 4},
      {text: "Capture evidence, moisture readings, and notes from any smartphone.", startSec: 6, durationSec: 4},
      {text: "Work offline with automatic sync when you reconnect.", startSec: 12, durationSec: 4},
      {text: "The responsive interface adapts to phone, tablet, or desktop — one app, every device.", startSec: 17, durationSec: 5},
      {text: "Get push notifications for urgent jobs, client approvals, and team messages.", startSec: 24, durationSec: 4},
    ],
  },
  {
    videoId: 'pricing-overview',
    segments: [
      {text: "RestoreAssist pricing is transparent and scales with your team.", startSec: 0, durationSec: 3},
      {text: "Start with a fourteen-day free trial. Full access to every feature. No credit card required.", startSec: 5, durationSec: 5},
      {text: "Choose a plan that fits your team size. Pay per technician, cancel anytime.", startSec: 13, durationSec: 4},
      {text: "All plans include unlimited inspections, reports, clients, and evidence storage.", startSec: 19, durationSec: 5},
      {text: "Enterprise plans add team management, API access, custom integrations, and priority support.", startSec: 26, durationSec: 5},
      {text: "Secure payment via Stripe. GST-compliant invoices emailed automatically.", startSec: 33, durationSec: 4},
    ],
  },
  {
    videoId: 'test',
    segments: [],
  },
];

/* ── ElevenLabs TTS ─────────────────────────────────────────────────── */

async function generateAudio(text: string, outputPath: string): Promise<void> {
  if (!ELEVENLABS_API_KEY) {
    throw new Error('ELEVENLABS_API_KEY not set');
  }
  
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Accept': 'audio/mpeg',
      'Content-Type': 'application/json',
      'xi-api-key': ELEVENLABS_API_KEY,
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0.0,
        use_speaker_boost: true,
      },
    }),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`ElevenLabs API error ${response.status}: ${error}`);
  }
  
  const arrayBuffer = await response.arrayBuffer();
  await fs.writeFile(outputPath, Buffer.from(arrayBuffer));
}

/* ── Main ────────────────────────────────────────────────────────────── */

async function main() {
  const only = process.argv.find(a => a.startsWith('--only='))?.split('=')[1];
  
  console.log(`\n╔════════════════════════════════════════════════════════════╗`);
  console.log(`║  RestoreAssist Narration Generator — ElevenLabs           ║`);
  console.log(`║  Voice ID: ${ELEVENLABS_VOICE_ID.padEnd(46)}║`);
  console.log(`║  Output: ${OUTPUT_DIR.padEnd(48)}║`);
  console.log(`╚════════════════════════════════════════════════════════════╝\n`);
  
  // 🔴 BLOCKED: ElevenLabs API key not in env
  if (!ELEVENLABS_API_KEY) {
    console.error('❌ ELEVENLABS_API_KEY not set in environment.');
    console.error('   Set with: export ELEVENLABS_API_KEY=<your-key>');
    console.error('   Key stored in .env.vercel but is encoded. Fetching via vercel env...');
    
    // Attempt to load from Vercel env
    try {
      const {execSync} = require('child_process');
      const key = execSync('npx vercel env ls 2>/dev/null | grep ELEVENLABS_API_KEY', {encoding: 'utf8'}).trim();
      if (key) {
        console.log('   Found key in Vercel env. Set it as environment variable to proceed.');
      }
    } catch {
      // silent
    }
    
    console.error('\n⚠️  Skipping audio generation for now. Narration scripts prepared.');
    console.log('\n--- Prepared scripts ---');
    for (const script of SCRIPTS) {
      if (only && script.videoId !== only) continue;
      if (script.segments.length === 0) continue;
      const text = script.segments.map(s => s.text).join(' ');
      console.log(`\n${script.videoId}:`);
      console.log(`  Full script: ${text.slice(0, 120)}...`);
      console.log(`  Duration: ${script.segments.reduce((a, s) => a + s.durationSec, 0)}s (${script.segments.length} segments)`);
    }
    return;
  }
  
  await fs.mkdir(OUTPUT_DIR, {recursive: true});
  
  const results: Array<{id: string; ok: boolean; path: string}> = [];
  
  for (const script of SCRIPTS) {
    if (only && script.videoId !== only) continue;
    if (script.segments.length === 0) {
      console.log(`⚠️  Skipping ${script.videoId} — no narration`);
      continue;
    }
    
    const outputPath = path.join(OUTPUT_DIR, `${script.videoId}.mp3`);
    const fullText = script.segments.map(s => s.text).join(' ');
    
    console.log(`→ Generating ${script.videoId} (${fullText.length} chars)...`);
    
    try {
      await generateAudio(fullText, outputPath);
      const stats = await fs.stat(outputPath);
      console.log(`  ✓ Saved ${script.videoId}.mp3 (${(stats.size / 1024).toFixed(0)} KB)`);
      results.push({id: script.videoId, ok: true, path: outputPath});
    } catch (error) {
      console.error(`  ✗ Failed:`, (error as Error).message);
      results.push({id: script.videoId, ok: false, path: ''});
    }
  }
  
  console.log(`\n--- Narration Complete ---`);
  console.log(`Success: ${results.filter(r => r.ok).length}/${results.length}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
