#!/usr/bin/env node
/**
 * SP-8 Help Library — branded placeholder generator + Cloudinary upload.
 * Generates 21 PNGs (8 hero + 13 inline) and uploads to the public_ids the
 * MDX articles expect. Each PNG is brand-styled (navy base + category accent)
 * with the title baked in. Replace with real screenshots post-T-day by
 * re-uploading the same public_ids — no code change needed.
 */

import sharp from "sharp";
import { v2 as cloudinary } from "cloudinary";

const CLOUDINARY_URL = process.env.CLOUDINARY_URL;
if (!CLOUDINARY_URL) {
  console.error("CLOUDINARY_URL not set in env");
  process.exit(1);
}
const m = CLOUDINARY_URL.match(/^cloudinary:\/\/([^:]+):([^@]+)@(.+)$/);
if (!m) {
  console.error("CLOUDINARY_URL malformed");
  process.exit(1);
}
cloudinary.config({
  cloud_name: m[3],
  api_key: m[1],
  api_secret: m[2],
  secure: true,
});

// Brand tokens (post-Wave-2)
const NAVY = "#1C2E47";
const WARM = "#765C43";
const LIGHT = "#D4A574";

// Category accent colours
const CAT = {
  "getting-started": "#3B82F6", // blue
  inspections: "#10B981", // emerald
  reports: "#8B5CF6", // violet
  "clients-and-portal": "#F59E0B", // amber
  billing: "#EF4444", // red
  team: "#06B6D4", // cyan
  integrations: "#EC4899", // pink
  compliance: "#D4A574", // brand light
};

const W = 1600;
const H = 900;

function escapeXml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function svg({ title, subtitle, category, accent, isHero }) {
  const t = escapeXml(title);
  const s = subtitle ? escapeXml(subtitle) : "";
  const c = escapeXml(category.toUpperCase().replace(/-/g, " "));
  const titleSize = isHero ? 84 : 64;
  const subtitleSize = 36;
  // Wrap title at ~24 chars per line
  const words = t.split(" ");
  const lines = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > 28) {
      lines.push(cur.trim());
      cur = w;
    } else {
      cur = cur + " " + w;
    }
  }
  if (cur.trim()) lines.push(cur.trim());
  const lineHeight = titleSize * 1.1;
  const startY = H / 2 - (lines.length - 1) * lineHeight / 2 - (s ? 30 : 0);
  const titleSvg = lines
    .map(
      (l, i) =>
        `<text x="${W / 2}" y="${startY + i * lineHeight}" font-family="-apple-system, system-ui, sans-serif" font-size="${titleSize}" font-weight="700" fill="white" text-anchor="middle">${l}</text>`,
    )
    .join("");
  const subtitleSvg = s
    ? `<text x="${W / 2}" y="${startY + lines.length * lineHeight + 30}" font-family="-apple-system, system-ui, sans-serif" font-size="${subtitleSize}" font-weight="400" fill="rgba(255,255,255,0.75)" text-anchor="middle">${s}</text>`
    : "";

  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${NAVY}" />
      <stop offset="100%" stop-color="${accent}" stop-opacity="0.85" />
    </linearGradient>
    <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
      <path d="M 60 0 L 0 0 0 60" fill="none" stroke="rgba(255,255,255,0.03)" stroke-width="1"/>
    </pattern>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#grid)"/>
  <rect x="60" y="60" width="160" height="4" fill="${LIGHT}"/>
  <text x="60" y="120" font-family="-apple-system, system-ui, sans-serif" font-size="22" font-weight="600" fill="${LIGHT}" letter-spacing="2">${c}</text>
  ${titleSvg}
  ${subtitleSvg}
  <text x="${W - 60}" y="${H - 60}" font-family="-apple-system, system-ui, sans-serif" font-size="20" font-weight="500" fill="rgba(255,255,255,0.5)" text-anchor="end">RestoreAssist</text>
</svg>`;
}

// 21 placeholders
const PLACEHOLDERS = [
  // 8 heros
  { id: "ra-help/getting-started/first-inspection-hero", title: "Your first inspection in 8 minutes", category: "getting-started", isHero: true },
  { id: "ra-help/inspections/cocoa-hero", title: "Capture photos with chain-of-custody", category: "inspections", isHero: true },
  { id: "ra-help/reports/first-ai-report-hero", title: "Generate your first AI-drafted S500 report", category: "reports", isHero: true },
  { id: "ra-help/clients-and-portal/share-via-portal-hero", title: "Share a report with your client", category: "clients-and-portal", isHero: true },
  { id: "ra-help/billing/upgrade-from-trial-hero", title: "Upgrade from trial to a paid plan", category: "billing", isHero: true },
  { id: "ra-help/team/invite-technician-hero", title: "Invite a technician + verify their licence", category: "team", isHero: true },
  { id: "ra-help/integrations/connect-xero-hero", title: "Connect Xero to push invoices", category: "integrations", isHero: true },
  { id: "ra-help/compliance/iicrc-citations-hero", title: "How RestoreAssist cites IICRC standards", category: "compliance", isHero: true },
  // 13 inline screenshots
  { id: "ra-help/compliance/citation-in-report", title: "Inline citation in an AI-drafted report", subtitle: "Monospaced inline reference linked to standard summary", category: "compliance" },
  { id: "ra-help/compliance/citation-panel", title: "The citation panel", subtitle: "Edit · add · remove actions", category: "compliance" },
  { id: "ra-help/inspections/camera-fab", title: "Capture-photo floating button", subtitle: "Bottom-right on every inspection page", category: "inspections" },
  { id: "ra-help/integrations/integrations-page", title: "Integrations page", subtitle: "Xero · MYOB · QuickBooks · ServiceM8 · Ascora", category: "integrations" },
  { id: "ra-help/integrations/xero-defaults", title: "Xero defaults", subtitle: "Sales account + tax rate pickers", category: "integrations" },
  { id: "ra-help/getting-started/new-inspection-button", title: "New inspection", subtitle: "From the inspections list page", category: "getting-started" },
  { id: "ra-help/team/invite-modal", title: "Invite technician", subtitle: "Email + role + IICRC tier", category: "team" },
  { id: "ra-help/team/engagement-licence-modal", title: "Engagement licence modal", subtitle: "IICRC + WHS + state licence fields", category: "team" },
  { id: "ra-help/clients-and-portal/share-with-client-button", title: "Share with client", subtitle: "Provisions a portal account if needed", category: "clients-and-portal" },
  { id: "ra-help/clients-and-portal/client-portal-view", title: "Client portal view", subtitle: "No login required — token-protected link", category: "clients-and-portal" },
  { id: "ra-help/billing/upgrade-page", title: "Upgrade page", subtitle: "STANDARD · PREMIUM · ENTERPRISE", category: "billing" },
  { id: "ra-help/reports/generate-report-button", title: "Generate report", subtitle: "Appears once minimum evidence is attached", category: "reports" },
  { id: "ra-help/reports/draft-editor", title: "Draft editor", subtitle: "AI-generated sections — editable inline", category: "reports" },
];

async function uploadOne(p) {
  const accent = CAT[p.category];
  if (!accent) throw new Error(`Unknown category: ${p.category}`);
  const svgStr = svg({
    title: p.title,
    subtitle: p.subtitle,
    category: p.category,
    accent,
    isHero: Boolean(p.isHero),
  });
  const png = await sharp(Buffer.from(svgStr)).png({ compressionLevel: 9 }).toBuffer();
  return new Promise((resolve, reject) => {
    const upload = cloudinary.uploader.upload_stream(
      {
        public_id: p.id,
        overwrite: true,
        resource_type: "image",
        format: "png",
        tags: ["ra-help", "placeholder", p.category],
      },
      (err, result) => {
        if (err) reject(err);
        else resolve({ id: p.id, secure_url: result.secure_url, bytes: result.bytes });
      },
    );
    upload.end(png);
  });
}

async function main() {
  console.log(`Generating + uploading ${PLACEHOLDERS.length} placeholders...`);
  let success = 0;
  let failed = 0;
  for (const p of PLACEHOLDERS) {
    try {
      const r = await uploadOne(p);
      console.log(`OK  ${r.id} (${r.bytes}B)`);
      success++;
    } catch (e) {
      console.error(`FAIL ${p.id}: ${e.message || e}`);
      failed++;
    }
  }
  console.log(`Done: ${success} uploaded, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
