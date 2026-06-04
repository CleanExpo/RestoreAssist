/**
 * Generate ElevenLabs narration for P2 feature deep-dive videos.
 *
 * Run: node scripts/generate-narration-p2.cjs
 */
const fs = require("fs");
const path = require("path");

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID;

if (!ELEVENLABS_API_KEY || !VOICE_ID) {
  console.error("Missing ELEVENLABS_API_KEY or ELEVENLABS_VOICE_ID");
  process.exit(1);
}

const NARRATION_DIR = path.join(process.cwd(), "remotion/assets/narration");
fs.mkdirSync(NARRATION_DIR, {recursive: true});

const narrations = [
  {
    file: "evidence-chain-deep-dive.mp3",
    text: "Chain of custody is not just a buzzword. It is the legal backbone of every restoration claim. In this deep dive, we will walk through RestoreAssist's four-step custody protocol. Step one: Capture. Every photo, reading, and note is instantly watermarked with GPS coordinates, timestamp, and device ID. Step two: Encrypt. AES-256 encryption at rest and in transit. No plain text data leaves the device. Step three: Hash and Sign. SHA-256 cryptographic hash generated for each file. Any tampering triggers an immediate audit alert. Step four: Audit Trail. An immutable blockchain-style log records who accessed what, when, and from where. This log cannot be deleted or edited. All hashes are stored on a distributed ledger, and the audit log is available for seven years. When your evidence goes to court, it stands up.",
  },
  {
    file: "photo-annotation-deep-dive.mp3",
    text: "A picture is worth a thousand words, but an annotated picture is worth a million dollars in a claim dispute. RestoreAssist's photo annotation toolkit gives you precision arrows that pinpoint exact damage locations and scale with zoom level. Measurement lines draw calibrated measurements directly on the photo, auto-calculating square metres and cubic volume. Zoom and pan up to eight times on mobile with pinch-to-zoom and swipe between photos in sequence. Smart tags use AI to auto-suggest labels like water damage, mould growth, or structural crack based on visual content. Advanced workflows include before-and-after pairing, 360-degree panorama stitching, and thermal overlay for FLIR images. All annotations embed in PDF with vector quality, so you can zoom to four hundred percent without pixelation. Show, do not just tell.",
  },
  {
    file: "template-builder.mp3",
    text: "Every restoration company has a different report style. RestoreAssist's template builder lets you create once and use forever. The header block auto-populates company logo, job number, address, and date from inspection metadata. The scope of works section supports editable rich text, checklists, boilerplate clauses, and custom SOP references. The photo gallery allows drag-and-drop ordering with captions, and before-after pairs are automatically linked. Moisture readings can be imported via CSV from Protimeter or Delmhorst devices, auto-generating trend graphs and dry-goal compliance tables. The equipment deployed section tracks inventory with serial numbers, calibration dates, and deployment timestamps. IICRC compliance auto-cites S500 fifth edition sections with one-click validation. Save as company default, duplicate for client variants, export as dot RPT templates, or share with your team.",
  },
  {
    file: "bulk-operations.mp3",
    text: "When you are managing hundreds of jobs, doing things one by one is not an option. RestoreAssist's bulk operations let you update the status of twenty or more inspections in a single action, with the audit log recording who made the change and when. Mass assignment lets you reassign fifty jobs from one technician to another, with automatic email notifications to affected staff. Batch export generates one hundred PDF reports as a single ZIP file, each named with job number and date, ready for portal upload. CSV import and export lets you bring in client lists from spreadsheets, map columns to fields, validate before commit, and export filtered views to Excel. With validation enabled, the error rate is point three percent. You can process two thousand four hundred records per hour. Scale without the chaos.",
  },
  {
    file: "search-filter.mp3",
    text: "Finding the right inspection in a sea of data should take seconds, not minutes. RestoreAssist's advanced search supports date range filtering with preset ranges like today, this week, this month, and last ninety days. Status filters cover draft, in progress, review, complete, and archived with multi-select OR logic. Technician filters let you show unassigned jobs or group by team member workload. Location search works by suburb, postcode, or radius from a GPS point with map view integration. Client search supports company name, contact, or client code with a favourites list. Damage type filters cover water, fire, mould, storm, and structural with severity override. Full-text search indexes notes, descriptions, and custom fields using PostgreSQL GIN indexing. Save common filter combinations as bookmarks for one-click recall and share them with your team. Export any filtered view to CSV. Results appear in real-time as you type, with sub-second response and no page reload.",
  },
  {
    file: "notifications-deep-dive.mp3",
    text: "The right information at the right time, without the noise. RestoreAssist's notification system supports four delivery channels. Email with instant, daily digest, or weekly summary options, HTML templates, and custom subject lines. SMS for critical alerts only, character-optimised, delivered in under five seconds. In-app real-time bell notifications with badge counts, mark as read or unread, and grouping by type. Webhooks push to Slack, Teams, or custom endpoints with a JSON payload containing full context. Smart triggers include inspection assigned to you, report reviewed and signed off, client viewed portal document, compliance checklist overdue, equipment calibration expiry, team member licence renewal due, and invoice payment received. The right info, right now. Notifications that help, not harass.",
  },
  {
    file: "data-import.mp3",
    text: "Switching systems should not mean starting from scratch. RestoreAssist supports data import from six sources. CSV and Excel files import contacts, job lists, or equipment inventory with a column mapping wizard and preview before commit. Xero and MYOB connect via two-click OAuth, pulling client lists and chart of accounts with ongoing automatic sync. QuickBooks Online offers full API integration, mapping classes, customers, and items with bi-directional sync. ServiceM8 imports active jobs and client databases, mapping custom fields while preserving job history. Ascora exports migrate cleanly to RestoreAssist with job status and notes intact. For existing databases, we provide a custom SQL export schema mapping guide, and our support team assists with complex migrations. Validation safeguards include duplicate detection with merge or skip options, format validation for phone numbers, emails, and dates, preview mode for row-by-row review, and full transaction rollback if the import fails. Safe to retry, every time.",
  },
  {
    file: "api-webhooks.mp3",
    text: "RestoreAssist is not just an app. It is a platform. Our REST API gives you full programmatic access. GET slash API slash v1 slash inspections lists all inspections with pagination, filtering, and sorting. GET slash API slash v1 slash inspections slash ID retrieves full details including photos and readings. POST slash API slash v1 slash inspections creates a new inspection with initial data and auto-assignment. PUT slash API slash v1 slash inspections slash ID updates status, notes, or assigned technician. GET slash API slash v1 slash reports slash ID slash PDF generates and downloads the PDF report. POST slash API slash v1 slash webhooks registers your endpoint for real-time event notifications. Here is a quick example. Subscribe to inspection completion events by posting to the webhooks endpoint with your URL and the events array. We will push a JSON payload every time an inspection is completed. Build on top of RestoreAssist. Full REST API plus webhooks, with developer docs.",
  },
  {
    file: "white-label.mp3",
    text: "Your brand deserves to be front and centre. RestoreAssist's white label features let you set primary and secondary brand colours that update app-wide, from icon tints to button fills and header bars. Upload your logo as SVG or high-resolution PNG, and it appears in the app header, PDF reports, client portal, and email templates. Use a custom domain like yourcompany dot restoreassist dot app, or CNAME your own domain with an included SSL certificate. Report styling includes custom cover pages, footer text, and disclaimer blocks that match your existing stationery exactly. White label is included in Essential and Professional plans, with Enterprise adding sub-brand management and API white-label capabilities. Your brand, front and centre. Your clients never know we are here.",
  },
  {
    file: "backup-export.mp3",
    text: "Your data is yours, always. RestoreAssist offers four export formats. PDF reports include full inspection details with photos, readings, and annotations in a professional layout, signed and dated. CSV data exports raw data for Excel analysis, with all fields and all inspections, filterable and sortable. JSON archives provide machine-readable full archives including metadata, audit logs, and file hashes. ZIP bundles contain all photos, documents, and reports organised by job number and date. Scheduled backups run daily with incremental updates and seven-day rolling retention, weekly full snapshots with four-week retention, and monthly archives with twelve-month retention. On-demand full exports are available anytime with no limits. All backups are encrypted at rest using AES-256, and download links expire in twenty-four hours. Your data is yours. Export, backup, migrate. No restrictions.",
  },
  {
    file: "moisture-deep-dive.mp3",
    text: "Moisture mapping is both an art and a science. RestoreAssist supports four measurement methods. Pin-type resistance meters penetrate the surface to measure moisture at depth, best for timber and drywall staging, giving actual moisture content percentage. Pinless electromagnetic scanners cover large areas non-destructively, ideal for initial surveys and mapping moisture fronts, reading up to twenty-five millimetres deep. Thermohygrometers measure relative humidity and temperature, calculating dew point and vapor pressure, critical for establishing drying goals. Thermal imaging cameras detect temperature differentials, where moisture evaporation cools surfaces, visible as cold spots, offering non-contact fast coverage. The workflow starts with a baseline recording of ambient relative humidity and temperature to establish the dry standard for the material type. Then survey the entire affected area with a pinless scan, marking boundaries and severity zones. Probe with pin-type readings at five locations per zone, logging depth, moisture content, and material type. Map readings on the floor plan to identify migration paths and hidden pockets. Set target moisture content and timeline, calculating dehumidification capacity required. Monitor daily until the goal is reached, with auto-alerts if progress stalls. Dry standard compliance, documented. IICRC S500 methodology built in.",
  },
  {
    file: "mobile-deep-dive.mp3",
    text: "Your entire office, in your pocket. RestoreAssist's mobile app gives you the native camera with auto-flash, grid overlay, and depth map, plus burst mode for sequence capture with immediate preview and annotation. GPS provides sub-five-metre accuracy via GLONASS and Galileo, working offline with cached basemaps, geotagging every photo automatically. Bluetooth pairs with Protimeter, Delmhorst, or Tramex meters for automatic reading sync, eliminating manual transcription errors. Offline mode provides full functionality without signal, caching photos, readings, and notes locally, with automatic sync when connection is restored. Compared to desktop, phone photo quality is identical at eight megabytes raw. GPS accuracy is three point two metres versus not applicable on desktop. Meter sync is wireless Bluetooth LE versus USB or serial on desktop. Offline use is full on phone versus none on desktop. And daily reports are instant on phone versus end-of-day on desktop, saving hours per job. Work from anywhere. The job site is your office.",
  },
];

async function generateNarration(item) {
  const outputPath = path.join(NARRATION_DIR, item.file);

  if (fs.existsSync(outputPath)) {
    console.log(`  [SKIP] ${item.file} already exists`);
    return;
  }

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": ELEVENLABS_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: item.text,
      model_id: "eleven_multilingual_v2",
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error(`  [FAIL] ${item.file}: ${res.status} ${err.slice(0, 100)}`);
    return;
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(outputPath, buffer);
  console.log(`  [OK] ${item.file} (${(buffer.length / 1024).toFixed(0)} KB)`);
}

async function main() {
  console.log(`Generating ${narrations.length} P2 narration tracks...\n`);

  for (const item of narrations) {
    await generateNarration(item);
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log("\nDone!");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
