/**
 * Generate ElevenLabs narration for 10 tutorial videos.
 * Run: node scripts/generate-narration-tutorials.cjs
 */
const fs = require("fs");
const path = require("path");

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID;
const OUTPUT_DIR = path.join(__dirname, "..", "remotion", "assets", "narration");

if (!ELEVENLABS_API_KEY || !VOICE_ID) {
  console.error("Missing ELEVENLABS_API_KEY or ELEVENLABS_VOICE_ID");
  process.exit(1);
}

const tutorials = [
  {
    slug: "tutorial-login",
    text: `Welcome to RestoreAssist. In this tutorial, I'll show you how to sign in to your account. Step 1: Open your browser and navigate to restoreassist.au. The site loads in under 2 seconds. Step 2: Enter your email address and password, then tap the Sign In button. Step 3: You're now signed in. Your dashboard displays active jobs, upcoming inspections, and your workspace health score. That's it — you're ready to start managing restoration projects.`,
  },
  {
    slug: "tutorial-signup",
    text: `Welcome to RestoreAssist. In this tutorial, I'll walk you through creating your account. Step 1: Enter your name, email address, and create a secure password with at least 8 characters. Step 2: Add your business name and ABN. We verify your ABN automatically against the Australian Business Register. Step 3: Check your email inbox for a 6-digit verification code. Enter it within 10 minutes to activate your account. Step 4: The Setup Wizard guides you through 5 steps — profile, AI hydration, integrations, health check, and activation. Step 5: Tap Activate. All 12 health checks pass, and your workspace is now live. Welcome to RestoreAssist.`,
  },
  {
    slug: "tutorial-setup-wizard",
    text: `Welcome to the RestoreAssist Setup Wizard. This 5-step process activates your workspace. Step 1: Business Profile. Confirm your business name, ABN, and upload your company logo. Step 2: AI Hydration. Industry defaults are auto-loaded — S500 water damage standards, WHS checklists, and report templates. Step 3: Integrations. Connect your accounting software — Xero, MYOB, QuickBooks — and job management tools like ServiceM8. Step 4: Health Check. We verify 12 capabilities including email, storage, AI models, and compliance engines. Step 5: Activate. One tap and your workspace goes live. Your dashboard is now ready.`,
  },
  {
    slug: "tutorial-dashboard",
    text: `Welcome to your RestoreAssist Dashboard. This is your command center. The Overview section shows active jobs, upcoming inspections, team status, and pending claims at a glance. Navigation is simple — use the sidebar to jump to any module, the search bar to find anything instantly, or quick action buttons for common tasks. The Insights panel tracks your performance — job completion rates, workspace health score, and recent activity feed. Everything you need to run your restoration business, in one place.`,
  },
  {
    slug: "tutorial-inspections",
    text: `Welcome to the Inspections tutorial. Step 1: Create an Inspection. Enter job details, location, and claim type. Step 2: Capture Evidence. Upload photos, add annotations, and record moisture readings directly in the app. Step 3: Sign Off. Both the client and technician provide digital signatures with automatic timestamps. Step 4: Submit. The inspection auto-generates a report, exports to PDF, and publishes to the client portal. Your evidence chain is now complete and audit-ready.`,
  },
  {
    slug: "tutorial-reports",
    text: `Welcome to AI-Assisted Reports. Step 1: Generate Report. With one click from any inspection, our AI drafts a professional report in IICRC S500 format, auto-populated with your evidence. Step 2: Review and Edit. You're always in control. Check accuracy, add notes, and attach additional photos before finalising. Step 3: Export and Share. Send as PDF, Word document, publish to the client portal, or email directly. Your reports are professional, compliant, and delivered in minutes, not hours.`,
  },
  {
    slug: "tutorial-billing",
    text: `Welcome to Billing and Subscriptions. Plans: Choose from Starter for solo operators, Growth for expanding teams, or Enterprise for multi-location businesses. Invoices: Generate professional invoices automatically from completed jobs, sync with Xero, and track payment status in real time. Upgrades: Scale as you grow. Add seats, enable add-ons like white-label branding or advanced analytics, and benefit from volume pricing. Your billing is transparent, flexible, and designed for restoration businesses.`,
  },
  {
    slug: "tutorial-team",
    text: `Welcome to Team Management. Invite Members: Send email invitations to technicians, administrators, and even client contacts. Each invite includes role selection. Assign Roles: Control permissions precisely — View Only for clients, Edit for technicians, Admin for managers, and Owner for full control. Licences: Manage your seat allocation. Add or remove team members, transfer licences between users, and monitor usage from the admin panel. Your team stays organised and secure.`,
  },
  {
    slug: "tutorial-compliance",
    text: `Welcome to IICRC Compliance. Standards: RestoreAssist embeds S500 for water damage, S520 for mould remediation, and S550 for fire and smoke restoration. Checklists: Digital compliance checklists are pre-loaded for every job type. The system auto-checks completion and flags missing items. Audit Trail: Full traceability with timestamps, digital signatures, and a complete document log. When assessors or insurers ask for evidence, you have everything ready. Compliance is built in, not bolted on.`,
  },
  {
    slug: "tutorial-integrations",
    text: `Welcome to Integrations. Accounting: Sync your financials with Xero, MYOB, or QuickBooks. Invoices, payments, and tax codes flow automatically. Job Management: Connect ServiceM8, Ascora, or simPRO to unify your workflow. Jobs created in RestoreAssist appear in your existing system instantly. Storage: Backup and share files with Google Drive, Dropbox, or OneDrive. All evidence, reports, and documents sync to your preferred cloud storage. RestoreAssist fits into your existing toolkit.`,
  },
];

async function generateNarration(slug, text) {
  const outputPath = path.join(OUTPUT_DIR, `${slug}.mp3`);
  if (fs.existsSync(outputPath)) {
    console.log(`  SKIP: ${slug}.mp3 already exists`);
    return;
  }

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": ELEVENLABS_API_KEY,
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`ElevenLabs error for ${slug}: ${response.status} ${err}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(outputPath, buffer);
  console.log(`  OK: ${slug}.mp3 (${(buffer.length / 1024).toFixed(0)} KB)`);
}

(async () => {
  console.log("Generating narration for 10 tutorial videos...\n");
  for (const t of tutorials) {
    try {
      await generateNarration(t.slug, t.text);
    } catch (e) {
      console.error(`  FAIL: ${t.slug} — ${e.message}`);
    }
  }
  console.log("\nDone.");
})();
