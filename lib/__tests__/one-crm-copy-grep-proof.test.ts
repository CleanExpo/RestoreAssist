/**
 * RA-7660 (One CRM, Unit A1) — grep proof for every changed string.
 *
 * The old homepage H1 and every user-facing NRPG sentence that was REMOVED
 * (not merely switched off) must appear nowhere in the code that reaches a
 * customer: app/, components/, lib/ (including lib/email-templates* and the
 * blog), public/ and the store listing under ops/fastlane. Tests are skipped,
 * because they quote the old strings on purpose.
 *
 * Whitespace is collapsed before matching, so a sentence split across JSX
 * lines is still caught.
 *
 * Switched-off items (the DR-NRPG card and modal, the ServiceM8 / MYOB /
 * QuickBooks cards, Import Data) keep their strings in source behind their
 * NEXT_PUBLIC_* switch; their absence is proven on the rendered page in
 * app/dashboard/integrations/__tests__/one-crm-visibility.test.tsx instead.
 *
 * Round 2 (CodeRabbit on PR #2295): public copy must not claim RestoreAssist
 * connects, syncs, pushes, exports or integrates with ServiceM8, MYOB or
 * QuickBooks, none of which has passed a real sync test. The provider NAMES
 * may still appear (existing connections, switched-off UI, identifiers); only
 * a CLAIM sentence on a public copy surface fails.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..");
const ROOTS = [
  "app",
  "components",
  "lib",
  "public",
  "ops/fastlane",
  "docs/distribution",
];
// Store "What's New" text files carry no extension, so the EXT filter below
// would skip them; they are added by explicit path.
const EXTRA_FILES = [
  "docs/distribution/app-store/whatsnew/whatsnew-en-AU",
  "docs/distribution/app-store/whatsnew/whatsnew-en-US",
];
const SKIP_DIRS = new Set(["node_modules", ".next", "__tests__", "__mocks__"]);
const EXT = /\.(ts|tsx|js|jsx|mjs|cjs|json|txt|md|mdx|html)$/;
const TEST_FILE = /\.(test|spec)\.[a-z]+$/;

function walk(dir: string, out: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (!SKIP_DIRS.has(name)) walk(full, out);
    } else if (EXT.test(name) && !TEST_FILE.test(name)) {
      out.push(full);
    }
  }
}

const files: string[] = [];
for (const r of ROOTS) walk(join(ROOT, r), files);
for (const f of EXTRA_FILES) files.push(join(ROOT, f));
const corpus = files.map((f) => {
  const raw = readFileSync(f, "utf8");
  return { file: relative(ROOT, f), raw, flat: raw.replace(/\s+/g, " ") };
});

function whereIs(needle: string): string[] {
  const flatNeedle = needle.replace(/\s+/g, " ");
  return corpus
    .filter((c) => c.raw.includes(needle) || c.flat.includes(flatNeedle))
    .map((c) => c.file);
}

const REMOVED: readonly string[] = [
  // Homepage H1 (recipe item 5).
  "Restoration software that works for you. Not the insurer.",
  // Service CRM add-on (pricing page + in-app add-ons).
  "Connect Ascora or DR-NRPG to sync jobs and pricing data.",
  // Bookkeeping add-on: the three-provider sentence is now built only when
  // the MYOB and QuickBooks switches are on.
  "Connect and sync Xero, QuickBooks or MYOB.",
  // NIR Australian Compliance section header.
  "DR-NRPG · Insurer · Technician credentials",
  // Dashboard inbound-job banner.
  "new job from DR/NRPG",
  "new jobs from DR/NRPG",
  "Inbound DR/NRPG jobs",
  // Pricing-configuration validation errors.
  "outside the NRPG typical range",
  // Quote generator.
  "NRPG-rated quotes",
  "National Restoration Pricing Guide (NRPG)",
  // Inspection cost-estimate panel.
  "company NRPG rates",
  "the NRPG pricing engine",
  // Public blog.
  "NRPG-aware pricing",
  '"NRPG rates"',
  // public/llms.txt integrations list.
  "DR-NRPG (claims distribution network)",
  // Public avian-influenza resource page.
  "DisasterRecovery.com.au and NRPG",
  // Google Play store listing.
  "Disaster Recovery / NRPG",
  // Round 2: claims of ServiceM8 / MYOB / QuickBooks support.
  "connect your existing Xero, MYOB, QuickBooks, ServiceM8, or Ascora account",
  "Push jobs and invoices directly to Xero, MYOB, QuickBooks, Ascora, and ServiceM8",
  "Direct invoicing to Xero, MYOB, QuickBooks, Ascora, and ServiceM8",
  "Xero/MYOB/Ascora integration",
  "accounting platforms including Xero, QuickBooks and MYOB",
  "accounting (Xero, QuickBooks, MYOB) and insurer (Guidewire) integrations",
  "accounting integrations for Xero, QuickBooks and MYOB",
  "(MYOB, QuickBooks and ServiceM8 are in beta)",
  "Bookkeeping connections to Xero, MYOB and QuickBooks",
  "The correct Xero, MYOB and QuickBooks tax code",
  "Connect Xero, QuickBooks, MYOB, ServiceM8, or Ascora when your office",
  "Connect your accounting software (Xero, MYOB, QuickBooks)",
  "Click Connect on your preferred provider (Xero, QuickBooks, MYOB, ServiceM8, Ascora)",
  "Xero, MYOB, QB, Drive",
  "Connect Xero, MYOB, QuickBooks, ServiceM8, or Ascora.",
  "Connect Xero, MYOB, QuickBooks, and more.",
  "Connect Xero, MYOB, QuickBooks, ServiceM8 or Ascora",
  // lib/youtube/metadata.ts splits this sentence across a string
  // concatenation, so the needle is the half that sits in one literal.
  "Ascora & ServiceM8, and professional PDF reports",
  "upgrade your plan to connect to Xero, QuickBooks, MYOB, ServiceM8, or Ascora",
  "Native QuickBooks sync, no re-keying",
  // RA-7714: the plan is 50 inspection reports a month, never unlimited.
  "Unlimited reports",
  // RA-7714: RestoreAssist IS the CRM; Ascora is a migration source, not an
  // ongoing connection.
  "Connect Ascora to sync jobs and pricing data.",
  "Connect your field service and CRM platforms",
  "Restoration Report Software Plans",
  "Xero and Ascora connections",
];

describe("grep proof — positive controls (the scan can find things)", () => {
  it("reads a realistic number of files from every root", () => {
    expect(files.length).toBeGreaterThan(500);
    for (const r of ROOTS) {
      expect(corpus.some((c) => c.file.startsWith(r + "/"))).toBe(true);
    }
  });

  it("finds the new homepage H1", () => {
    expect(
      whereIs(
        "The CRM built for Australian and New Zealand restoration professionals. One product, not three.",
      ),
    ).toContain("components/landing/home/homeContent.ts");
  });

  it("finds a switched-off string that legitimately stays in source", () => {
    expect(whereIs("DR-NRPG Integration")).toContain(
      "app/dashboard/integrations/page.tsx",
    );
  });

  it("finds a multi-line JSX sentence only after whitespace collapse", () => {
    // The switched-off DR-NRPG card description is split across two source
    // lines, so a raw substring search cannot see it; the collapsed one must.
    const sentence =
      "Disaster Recovery NRPG — receive job dispatch events via webhook";
    const page = corpus.find(
      (c) => c.file === "app/dashboard/integrations/page.tsx",
    );
    expect(page?.raw.includes(sentence)).toBe(false);
    expect(whereIs(sentence)).toContain("app/dashboard/integrations/page.tsx");
  });
});

describe("grep proof — removed strings appear nowhere user-facing", () => {
  it.each(REMOVED)("%j is gone", (needle) => {
    expect(whereIs(needle)).toEqual([]);
  });

  it("public/llms.txt and the store listing do not mention NRPG at all", () => {
    for (const file of [
      "public/llms.txt",
      "ops/fastlane/metadata/android/en-AU/full_description.txt",
    ]) {
      const entry = corpus.find((c) => c.file === file);
      expect(entry, `${file} was not scanned`).toBeDefined();
      expect(entry!.raw).not.toMatch(/NRPG/i);
    }
  });
});

// ── Round 2: no public claim of ServiceM8 / MYOB / QuickBooks support ──────

const PROVIDER = String.raw`\b(?:ServiceM8|MYOB|QuickBooks|QBO)\b`;
const CLAIM_VERB = String.raw`\b(?:connect|sync|push|integrat|export|invoic|link)\w*`;
// A claim verb and a provider name in the same sentence (no . ! ? ; between),
// in either order.
const CLAIMS = [
  new RegExp(`${CLAIM_VERB}[^.!?;]{0,80}?${PROVIDER}`, "i"),
  new RegExp(`${PROVIDER}[^.!?;]{0,40}?\\b(?:sync|integrat|connect)\\w*`, "i"),
];

function claimIn(text: string): string | null {
  for (const re of CLAIMS) {
    const m = text.match(re);
    if (m) return m[0];
  }
  return null;
}

/**
 * Public copy surfaces: marketing pages, store listings, the blog, llms.txt,
 * the onboarding email, help text and video descriptions. Deliberately an
 * inclusion list, not the whole tree: in-app controls for an existing
 * connection (invoice "Sync to" menu, sync-error and webhook pages), switched-
 * off UI, admin pages, identifiers and comments may name a provider.
 */
function isPublicCopy(file: string): boolean {
  return (
    file.startsWith("ops/fastlane/") ||
    file.startsWith("docs/distribution/app-store/") ||
    file.startsWith("components/landing/") ||
    [
      "public/llms.txt",
      "public/campaigns/features-gallery.html",
      "lib/blog/articles.ts",
      "app/features/page.tsx",
      "app/how-it-works/page.tsx",
      "app/pricing/page.tsx",
      "lib/email.ts",
      "lib/email-templates.ts",
      "lib/help-content.ts",
      "components/help/HowToDropdown.tsx",
      "app/dashboard/learn/LearnPageClient.tsx",
      "components/setup/video-registry.ts",
      "lib/youtube/metadata.ts",
    ].includes(file)
  );
}

const publicCopy = corpus.filter(
  (c) => isPublicCopy(c.file) && !c.file.endsWith(".mjs"),
);

describe("grep proof — the claim matcher can fire (controls)", () => {
  it.each([
    "connect your existing Xero, MYOB, QuickBooks, ServiceM8, or Ascora account. We sync; we don't replace.",
    "Push jobs and invoices directly to Xero, MYOB, QuickBooks, Ascora, and ServiceM8.",
    "Xero and Ascora connections (MYOB, QuickBooks and ServiceM8 are in beta)",
    "Native QuickBooks sync, no re-keying",
    "Link MYOB for streamlined bookkeeping.",
  ])("flags %j", (sentence) => {
    expect(claimIn(sentence)).not.toBeNull();
  });

  it.each([
    "connect your existing Xero or Ascora account. We sync; we don't replace.",
    "Xero and Ascora connections",
    "Connect and sync Xero.",
    "Bookkeeping connections to Xero also require the Bookkeeping add-on.",
  ])("does not flag %j", (sentence) => {
    expect(claimIn(sentence)).toBeNull();
  });

  it("finds a real claim in a file outside the public list (the scan reads real code)", () => {
    // The setup-wizard tile descriptions are in-app connect UI, not public
    // copy, but they prove the matcher fires on real source text.
    const card = corpus.find(
      (c) => c.file === "components/setup/IntegrationsCard.tsx",
    );
    expect(card).toBeDefined();
    expect(claimIn(card!.flat)).not.toBeNull();
  });

  it("scans every public copy surface it names", () => {
    const scanned = new Set(publicCopy.map((c) => c.file));
    for (const f of [
      "ops/fastlane/metadata/android/en-AU/full_description.txt",
      "docs/distribution/app-store/store-listings.md",
      "docs/distribution/app-store/whatsnew/whatsnew-en-AU",
      "docs/distribution/app-store/whatsnew/whatsnew-en-US",
      "lib/blog/articles.ts",
      "app/features/page.tsx",
      "lib/email.ts",
      "public/campaigns/features-gallery.html",
    ]) {
      expect(scanned.has(f), `${f} was not scanned`).toBe(true);
    }
  });
});

describe("grep proof — no public sentence claims ServiceM8, MYOB or QuickBooks support", () => {
  it("every public copy surface is free of such claims", () => {
    const hits = publicCopy
      .map((c) => ({ file: c.file, claim: claimIn(c.flat) }))
      .filter((h) => h.claim !== null);
    expect(hits).toEqual([]);
  });
});
