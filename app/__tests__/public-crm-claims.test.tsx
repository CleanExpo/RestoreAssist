/**
 * RA-8148 — public pages advertise only what has shipped.
 *
 * RestoreAssist is the CRM, and the pages keep saying so. But there is no Lead,
 * Pipeline, Deal, Task or FollowUp model yet (those arrive under RA-8011), and
 * ServiceM8, MYOB and QuickBooks are off by default in
 * lib/flags/one-crm-flags.ts. Every technician seat is billed
 * (lib/billing/technician-seats-addon.ts) and no seat is included.
 *
 * Scans page source rather than rendered HTML so that a brand new page under a
 * public route is covered the moment it exists. The claim-by-claim evidence is
 * in docs/product/public-crm-claims.md. When RA-8011 ships a capability, remove
 * its pattern here in the same change that adds the copy.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

/** Everything a logged-out visitor, crawler or AI agent can read. */
const PUBLIC_ROOTS = [
  "app/page.tsx",
  "app/about",
  "app/blog",
  "app/compliance",
  "app/compliance-library",
  "app/contact",
  "app/evidence-score",
  "app/faq",
  "app/features",
  "app/help",
  "app/how-it-works",
  "app/job-file-audit",
  "app/landing",
  "app/pricing",
  "app/resources",
  "app/signup",
  "app/solutions",
  "app/support",
  "components/landing",
  "components/pricing",
  "data/content/help",
  "lib/pricing.ts",
  "lib/billing/service-crm-addon.ts",
  "lib/billing/technician-seats-addon.ts",
  "public/campaigns",
  "public/llms.txt",
];

const COPY_FILE = /\.(tsx?|mdx?|html|txt)$/;
const TEST_FILE = /\.test\.|__tests__/;

function collect(entry: string): string[] {
  const abs = path.join(ROOT, entry);
  // A renamed root must fail loudly, never quietly shrink what is scanned.
  if (!existsSync(abs)) throw new Error(`public root is missing: ${entry}`);
  if (statSync(abs).isFile()) return [entry];
  return readdirSync(abs).flatMap((name) => {
    const child = path.join(entry, name);
    if (statSync(path.join(ROOT, child)).isDirectory()) return collect(child);
    return COPY_FILE.test(name) && !TEST_FILE.test(child) ? [child] : [];
  });
}

/** Comments may name what was removed and why; only shipped copy is judged. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/(^|[\s;,{(])\/\/.*$/gm, "$1");
}

const UNBACKED: ReadonlyArray<{ claim: string; pattern: RegExp }> = [
  // CRM core: arrives with RA-8011.
  { claim: "lead pipeline", pattern: /\b(lead|sales|deal)s? (pipeline|inbox|management|tracking)\b/i },
  { claim: "pipeline or stages", pattern: /\b(pipeline stages?|job pipeline|your pipeline)\b/i },
  { claim: "managing leads", pattern: /\b(manage|track|capture|convert|win) (your |more |new )?leads\b/i },
  { claim: "task management", pattern: /\btask (management|lists?|boards?)\b/i },
  { claim: "follow-ups", pattern: /\b(automated|automatic|scheduled|client|customer|lead) (follow-?ups?|reminders?)\b/i },
  { claim: "a complete CRM", pattern: /\b(full|complete|all-in-one) CRM\b/i },
  { claim: "does everything", pattern: /\b(does )?all your (professional )?restoration needs\b/i },

  // Integrations switched off in lib/flags/one-crm-flags.ts.
  { claim: "ServiceM8", pattern: /\bServiceM8\b/i },
  { claim: "QuickBooks", pattern: /\bQuickBooks\b/i },
  { claim: "MYOB", pattern: /\bMYOB\b/i },
  { claim: "NRPG", pattern: /\bNRPG\b/ },

  // Ascora is a one-way migration source, never an ongoing connection (RA-7714).
  { claim: "Ascora as a connection", pattern: /\b(connect (xero or )?ascora|ascora (bridge|integration|sync|connection))\b/i },

  // Xero push is hourly or by hand, never "the moment" something closes.
  { claim: "automatic Xero sync", pattern: /\bauto-?sync/i },

  // Nothing here is pushed live to a second person's screen.
  { claim: "real-time collaboration", pattern: /\breal-?time (collaboration|analytics|sync)\b/i },
  { claim: "in real time", pattern: /\bin real[- ]time\b/i },

  // Every seat is billed.
  { claim: "an included seat", pattern: /\b(seats?|technicians?|users?) (is |are )?included\b|\bincluded (seats?|technicians?|users?)\b/i },
  { claim: "a free seat", pattern: /\b(free|unlimited) (seats?|technicians?|users?)\b/i },
  { claim: "a user allowance", pattern: /\b(up to )?\d+ users?\b/i },
  { claim: "flat team pricing", pattern: /\b(no per-seat|whole team|flat (rate|price|pricing))\b/i },

  // Videos whose thumbnail or narration states an unbacked claim. The words are
  // burned into the picture, so no text scan of the page would catch them.
  // Remove an id once its video is re-rendered with true wording.
  {
    claim: "a withheld video",
    pattern:
      /K1RuRDblr3Y|6VZrAgt52L8|bkIoga02MYo|tis9wRNVAaU|2HsQ6Z85nlA|_BvIX7gCAs4|6yCxJtkKwjQ|2KGjAsgo6DU|SJccjCgupAc|KS6K7xMS6go|7pBJH-AMBBA|mfU_FD6Tgj8|qfqcdcRxC9o|8MK-xCoCQiU|J01Eqfmn9_4|zDI9z3oYCzU|eNDjbHMwtVE|jY5BRpT2NyM|-K97VvRwOF4/,
  },

  // Retired catalogue: there is one $99 Monthly Plan (lib/pricing.ts).
  { claim: "a retired tier", pattern: /\b(PREMIUM|ENTERPRISE)\b/ },
  { claim: "the retired yearly price", pattern: /\$1,188/ },
];

function findUnbacked(text: string): string[] {
  return UNBACKED.filter(({ pattern }) => pattern.test(text)).map(
    ({ claim }) => claim,
  );
}

const files = PUBLIC_ROOTS.flatMap(collect);

describe("public pages claim only what has shipped", () => {
  it("scans the real public surface", () => {
    expect(files.length).toBeGreaterThan(50);
    for (const page of [
      "app/pricing/page.tsx",
      "app/how-it-works/page.tsx",
      "public/llms.txt",
      "public/campaigns/launch-30-in-30.html",
      "data/content/help/billing/upgrade-from-trial.mdx",
    ]) {
      expect(files).toContain(page);
    }
  });

  it.each([
    "Manage your leads in one place",
    "A sales pipeline for every branch",
    "Automated follow-ups to every client",
    "Task lists for the office",
    "Australia's first full CRM",
    "Connect Xero or Ascora",
    "Syncs with ServiceM8, MYOB and QuickBooks",
    "real-time collaboration for your crew",
    "The office sees today's jobs in real time",
    "One technician seat included",
    "Includes 5 users",
    "Free seats for your team",
    "https://youtu.be/K1RuRDblr3Y",
  ])("the check fires on planted copy: %s", (planted) => {
    expect(findUnbacked(planted)).not.toEqual([]);
  });

  it.each([
    "Offline capture that syncs when you are back online",
    "Routes to the team for human follow-up",
    "Field technician seats are billed per seat",
    "The CRM built for Australian and New Zealand restoration professionals",
    "Push an invoice to Xero as a draft",
  ])("the check leaves true copy alone: %s", (truthful) => {
    expect(findUnbacked(truthful)).toEqual([]);
  });

  it("no public file carries an unbacked claim", () => {
    const hits = files.flatMap((file) => {
      const text = stripComments(readFileSync(path.join(ROOT, file), "utf8"));
      return findUnbacked(text).map((claim) => `${file}: ${claim}`);
    });
    expect(hits).toEqual([]);
  });

  it("the pages still call RestoreAssist the CRM", () => {
    for (const file of [
      "app/page.tsx",
      "app/pricing/page.tsx",
      "app/how-it-works/page.tsx",
      "components/landing/home/homeContent.ts",
      "public/llms.txt",
    ]) {
      expect(readFileSync(path.join(ROOT, file), "utf8"), file).toMatch(/\bCRM\b/);
    }
  });
});
