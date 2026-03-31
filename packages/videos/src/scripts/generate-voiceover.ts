import * as fs from "fs";
import * as path from "path";

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || "onwK4e9ZLuTAKqWW03F9";

interface VoiceoverSegment {
  id: string;
  text: string;
  outputPath: string;
}

const PRODUCT_EXPLAINER_SEGMENTS: VoiceoverSegment[] = [
  {
    id: "pe-intro",
    text: "How RestoreAssist generates a scope of works. One System. Fewer Gaps. More Confidence.",
    outputPath: "src/assets/audio/pe-intro.mp3",
  },
  {
    id: "pe-step1",
    text: "Start by entering the property details and claim information into the inspection form. RestoreAssist captures everything you need in one place.",
    outputPath: "src/assets/audio/pe-step1.mp3",
  },
  {
    id: "pe-bullet1",
    text: "Your inspection data is automatically analysed by AI. Scope items are generated with accurate quantities and specifications, and equipment requirements are calculated based on the affected area.",
    outputPath: "src/assets/audio/pe-bullet1.mp3",
  },
  {
    id: "pe-bullet2",
    text: "IICRC S500 standards are automatically applied. Water damage categories and classes are correctly classified, with standard-specific citations on every scope item. Fully compliant with Australian building codes.",
    outputPath: "src/assets/audio/pe-bullet2.mp3",
  },
  {
    id: "pe-bullet3",
    text: "Export your scopes directly to Xero, Ascora, or ServiceM8 with one click. Generate professional PDF reports for insurers, and sync costs and line items to your accounting platform.",
    outputPath: "src/assets/audio/pe-bullet3.mp3",
  },
  {
    id: "pe-cta",
    text: "RestoreAssist. One System. Fewer Gaps. More Confidence. Book a demo at restoreassist.com.au.",
    outputPath: "src/assets/audio/pe-cta.mp3",
  },
];

const INDUSTRY_INSIGHT_SEGMENTS: VoiceoverSegment[] = [
  {
    id: "ii-intro",
    text: "The most common mistake restorers make on insurance claims. Missing vital data while inspecting.",
    outputPath: "src/assets/audio/ii-intro.mp3",
  },
  {
    id: "ii-pre-site-title",
    text: "The inspection starts when you first get the claim. Not when you arrive on site.",
    outputPath: "src/assets/audio/ii-pre-site-title.mp3",
  },
  {
    id: "ii-pre-site",
    text: "Before you leave the office, ask yourself: Where am I going? What's the traffic going to be like? What services are in that area if I need assistance or emergency help? What equipment will I need for this claim? Do I need specialised PPE, equipment, chemicals? Are the correct and trained technicians going to site? And crucially, is the property secure and safe to enter? Are there falling trees, damaged main support structures?",
    outputPath: "src/assets/audio/ii-pre-site.mp3",
  },
  {
    id: "ii-on-site",
    text: "Where does the inspection start on site? As soon as you gain entry to the property.",
    outputPath: "src/assets/audio/ii-on-site.mp3",
  },
  {
    id: "ii-looking-1",
    text: "What are you looking for? First, let the client talk. Don't interrupt, or input your previous experience. You're there to listen and not make judgement. Second, video and photographic evidence. This is vital for future conflicts and verification. Third, note taking. Each area requires detailed scoping for pre-inspection, during inspections, and post-inspections.",
    outputPath: "src/assets/audio/ii-looking-1.mp3",
  },
  {
    id: "ii-looking-2",
    text: "Verification of the incident. Not to dispel or question the client's events, but to ensure you are proceeding the claim with best practices and industry standards and guidelines in place. And finally, look past what the eyes can see. Look up, look behind, look around, and look under. Our role is to mitigate and reduce further damage by mitigation, restoration, and sanitisation.",
    outputPath: "src/assets/audio/ii-looking-2.mp3",
  },
  {
    id: "ii-who",
    text: "Who are we there for? This is the biggest question. We are there for the property. Whether that is the property owner, the tenant, the landlord, whoever. Our role is to bring the indoor environment back into a pre-loss condition or better, in guidance with Australian and New Zealand Indoor Health Best Practices.",
    outputPath: "src/assets/audio/ii-who.mp3",
  },
  {
    id: "ii-help",
    text: "RestoreAssist helps with guided inspection workflows that ensure nothing is missed, pre-site checklists with equipment and PPE requirements, evidence capture with timestamped photo and video logging, and automatic IICRC standards compliance on every scope item.",
    outputPath: "src/assets/audio/ii-help.mp3",
  },
  {
    id: "ii-cta",
    text: "RestoreAssist. One System. Fewer Gaps. More Confidence. Book a demo at restoreassist.com.au.",
    outputPath: "src/assets/audio/ii-cta.mp3",
  },
];

async function generateVoiceover(segment: VoiceoverSegment): Promise<void> {
  if (!ELEVENLABS_API_KEY) {
    console.warn(`[SKIP] No ELEVENLABS_API_KEY set \u2014 writing placeholder for ${segment.id}`);
    const dir = path.dirname(path.resolve(__dirname, "../../", segment.outputPath));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.resolve(__dirname, "../../", segment.outputPath),
      `Placeholder for: ${segment.text}`
    );
    return;
  }

  console.log(`[TTS] Generating: ${segment.id}...`);

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
        voice_settings: {
          stability: 0.6,
          similarity_boost: 0.8,
          style: 0.3,
          use_speaker_boost: true,
        },
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`ElevenLabs API error: ${response.status} ${response.statusText}`);
  }

  const audioBuffer = await response.arrayBuffer();
  const outputDir = path.dirname(path.resolve(__dirname, "../../", segment.outputPath));
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(
    path.resolve(__dirname, "../../", segment.outputPath),
    Buffer.from(audioBuffer)
  );

  console.log(`[TTS] Done: ${segment.id} \u2192 ${segment.outputPath}`);
}

// ─── Landing Page Overview — 90-second product overview video ───────────────
const LANDING_PAGE_OVERVIEW_SEGMENTS: VoiceoverSegment[] = [
  {
    id: "lp-intro",
    text: "RestoreAssist. The all-in-one platform built specifically for restoration professionals. Whether you're dealing with water damage, mould, or fire and smoke restoration — RestoreAssist has you covered.",
    outputPath: "src/assets/audio/lp-intro.mp3",
  },
  {
    id: "lp-overview",
    text: "RestoreAssist combines AI-powered scope generation with built-in IICRC standards compliance. From the moment you open a claim, the platform guides your inspection, captures evidence, generates your scope of works, and produces professional reports — automatically.",
    outputPath: "src/assets/audio/lp-overview.mp3",
  },
  {
    id: "lp-dashboard",
    text: "Your dashboard gives you complete visibility over all active jobs. Create new inspections, track progress, and manage your entire team — all in one place.",
    outputPath: "src/assets/audio/lp-dashboard.mp3",
  },
  {
    id: "lp-advantages",
    text: "The advantages are clear. Save over two hours on every inspection with AI scope generation. Never miss a line item — every scope item is evidence-linked and standards-referenced. Export directly to Xero, Ascora, ServiceM8, QuickBooks, or MYOB with a single click. And stay fully compliant with building codes across all Australian states.",
    outputPath: "src/assets/audio/lp-advantages.mp3",
  },
  {
    id: "lp-compliance",
    text: "RestoreAssist is built from the ground up for Australian compliance. IICRC S500, S520, and S700 standards are automatically applied to every scope item. State-specific regulatory triggers cover all eight Australian states. And every inspection includes a court-ready evidence register — so you're always protected.",
    outputPath: "src/assets/audio/lp-compliance.mp3",
  },
  {
    id: "lp-scope",
    text: "Watch AI generate a complete, standards-referenced scope of works in seconds. Every line item includes quantities, specifications, and the exact IICRC clause that supports it. Your reports are insurer-ready the moment the inspection is done.",
    outputPath: "src/assets/audio/lp-scope.mp3",
  },
  {
    id: "lp-stats",
    text: "Restoration teams using RestoreAssist save over two hours per inspection. Every report is one hundred percent IICRC compliant. And the platform covers all eight Australian states with state-specific building codes and regulatory triggers already built in.",
    outputPath: "src/assets/audio/lp-stats.mp3",
  },
  {
    id: "lp-cta",
    text: "Start your free trial today. Get three full reports — completely free. No credit card required. Just sign up at restoreassist dot app and start restoring with confidence. RestoreAssist — One System. Fewer Gaps. More Confidence.",
    outputPath: "src/assets/audio/lp-cta.mp3",
  },
];

async function generateAll(): Promise<void> {
  const allSegments = [
    ...PRODUCT_EXPLAINER_SEGMENTS,
    ...INDUSTRY_INSIGHT_SEGMENTS,
    ...LANDING_PAGE_OVERVIEW_SEGMENTS,
  ];

  console.log(`\nGenerating ${allSegments.length} voiceover segments...\n`);

  for (const segment of allSegments) {
    await generateVoiceover(segment);
    // Small delay to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  console.log("\nAll voiceover segments generated successfully.");
}

generateAll().catch(console.error);
