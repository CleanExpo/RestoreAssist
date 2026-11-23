/**
 * RA-8494 (DRC S1) — static guard: every server path that touches money is
 * classified, handler by handler.
 *
 * The behaviour is proven route by route in technician-no-money.test.ts. This
 * file stops the next path from slipping past it. Source files are read as
 * text (never imported). Three rules, each one a lesson from the bench review:
 *
 *  1. "Money" is not a second hand-typed list. The detector is built from the
 *     sets the redactor itself uses (lib/auth/money-redaction.ts), plus the
 *     Prisma models whose rows carry money, so adding a key to the redactor
 *     widens this guard on the same day.
 *  2. Server components count. Every app/**\/route.ts is walked, and so is
 *     every page.tsx / layout.tsx that imports Prisma directly.
 *  3. An import is not compliance. Each exported handler that touches money
 *     must itself call the owner (assertMoneyViewer, moneySafe, canSeeMoney
 *     or redactMoney), or be listed below with the reason no money from it
 *     reaches a technician.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

import path from "node:path";
import {
  MONEY_JSON_OR_PROSE_KEYS,
  MONEY_JSON_TEXT_KEYS,
  MONEY_KEYS,
  MONEY_RELATIONS,
} from "@/lib/auth/money-redaction";

const APP_ROOT = path.resolve(__dirname, "../../..");

/**
 * Names in MONEY_KEYS that are also ordinary words or counts in route code
 * (`total` pages, a `rate` limiter, `amount` of moisture). They are still
 * redacted as fields; the guard reaches the records that carry them through
 * the money models below instead of by the bare word.
 */
const GENERIC_NAMES = new Set([
  "rate",
  "total",
  "amount",
  "revenue",
  "subtotal",
  "contingency",
  "gst",
  "estimate",
  "invoice",
  "payments",
  // The Inspection relation of readings shares its name with the Report text
  // column that can carry a priced NIR blob; the guard reaches that column
  // through the `report` model instead.
  "moistureReadings",
  // Reached through the `report` model; the word alone is in most report code.
  "detailedReport",
  // A local count in the Ascora pricing database ("newTotal = accepted + rejected").
  "newTotal",
]);

/** Prisma models whose rows carry money (columns in MONEY_KEYS, or priced text). */
const MONEY_MODELS = [
  "invoice",
  "invoicePayment",
  "invoiceLineItem",
  "estimate",
  "estimateLineItem",
  "costEstimate",
  "creditNote",
  "recurringInvoice",
  "invoiceTemplate",
  "scopeVariation",
  "report",
  "scope",
  "scopeItem",
  "contentsPackOutItem",
  "reportApproval",
];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const MONEY_FIELD_NAMES = [...MONEY_KEYS, ...MONEY_RELATIONS, ...MONEY_JSON_TEXT_KEYS, ...MONEY_JSON_OR_PROSE_KEYS]
  .filter((k) => !GENERIC_NAMES.has(k))
  .map(escape);
/**
 * Models with free JSON text columns whose writers may put money in them
 * (an audit row's `changes` carries a cost-estimate total). Only their reads
 * are money sources; the owner redacts money inside JSON text by value.
 */
const MONEY_TEXT_READS = [
  "\\b(?:prisma|tx|db)\\.auditLog\\.(?:find\\w*|aggregate|groupBy)\\b",
  "\\bauditLogs\\s*:",
];
export const MONEY_SOURCE = new RegExp(
  `\\b(?:prisma|tx|db)\\.(?:${MONEY_MODELS.join("|")})\\b|\\b(?:${MONEY_FIELD_NAMES.join("|")})\\b|${MONEY_TEXT_READS.join("|")}`,
);
const OWNER_CALL = /\b(?:assertMoneyViewer|moneySafe|canSeeMoney|redactMoney)\s*\(/;
const HANDLER =
  /^export\s+(?:async\s+function\s+(GET|POST|PUT|PATCH|DELETE)\b|const\s+(GET|POST|PUT|PATCH|DELETE)\s*=|default\s+(?:async\s+)?function\b)/gm;

/**
 * Paths that touch money but return none of it to a technician. A key is a
 * file under app/ ("api/x/route.ts", every handler) or one handler
 * ("api/x/route.ts#POST").
 */
const NO_MONEY_TO_TECHNICIAN: Record<string, string> = {
  "api/account/delete/route.ts": "reassigns money rows internally; answers { success } only",
  "api/admin/live-teacher/gate-metrics/route.ts": "ADMIN only (verifyAdminFromDb); its cost is platform AI spend",
  "api/admin/seed-demo/route.ts": "ADMIN only (verifyAdminFromDb); answers ids only",
  "api/admin/usage/route.ts": "ADMIN only (verifyAdminFromDb); platform AI usage cost",
  "api/cron/sync-invoices/route.ts": "CRON_SECRET only; answers job counts",
  "api/cron/sync-xero-payments/route.ts": "CRON_SECRET only; writes payment state, answers counts",
  "api/inspections/[id]/submit/route.ts": "writes the cost estimate; the answer carries no money",
  "api/integrations/metrics/route.ts": "counts of synced payments, no amount",
  "api/integrations/nir-sync/route.ts": "pushes totals to the accounting system; answers status and counts",
  "api/invoices/public/[token]/route.ts":
    "no session: the client's invoice link, protected by the token (outside the technician rule)",
  "api/invoices/templates/[id]/duplicate/route.ts": "copies layout flags; the template holds no amounts",
  "api/notifications/email/route.ts": "answers { sent, messageId }; the invoice email itself is a follow-up",
  "api/reports/bulk-duplicate/route.ts": "answers ids, counts and credits only",
  "api/inspections/[id]/activity/route.ts#GET": "audit rows selected without changes, previousValue or newValue",
  "api/inspections/[id]/comms-readiness/route.ts#GET": "reads audit row timestamps only",
  "api/reports/initial-entry/route.ts": "prices equipment server-side; answers { report: { id } } and a message",
  "api/setup/activate/route.ts": "branding setup; answers organisation id and redirect",
  "api/test/seed-inspection/route.ts": "test helper, blocked unless ALLOW_TEST_HELPERS",
  "api/test/v1-reference-claim/finalize-exit/route.ts": "test helper, blocked unless ALLOW_TEST_HELPERS",
  "api/test/v1-reference-claim/issue-invoice/route.ts": "test helper, blocked unless ALLOW_TEST_HELPERS",
  "api/admin/cron-jobs/route.ts": "ADMIN only (verifyAdminFromDb + platform support operator); static job list",
  "api/admin/stats/route.ts": "ADMIN only (verifyAdminFromDb + platform support operator); counts only",
  "api/admin/vectorise/route.ts": "ADMIN only (verifyAdminFromDb); answers counts",
  "api/analytics/activity-feed/route.ts#GET": "selects id, title, client name, status and dates; no money column",
  "api/analytics/completion-metrics/route.ts#GET": "selects status and dates; answers day counts and completion rates",
  "api/ascora/sync/route.ts#POST": "imports into the pricing store; answers counts, job types and a message",
  "api/billing/connect/onboard/route.ts#POST": "refuseNonOwner: business owner only; answers a Stripe onboarding URL",
  "api/billing/connect/return/route.ts#GET": "refuseNonOwner: business owner only; redirects, no body",
  "api/chatbot/route.ts#POST": "static system prompt and the user's message; no job data reaches the model",
  "api/clients/[id]/route.ts#DELETE": "answers { success } or an error",
  "api/clients/route.ts#POST": "a new client has no revenue yet (literal 0); answers the client row",
  "api/contractors/reviews/route.ts#POST": "always 503 FEATURE_UNAVAILABLE",
  "api/cron/backfill-progress/route.ts": "CRON_SECRET only",
  "api/cron/sync-ascora-labour/route.ts": "CRON_SECRET only",
  "api/dashboard/stats/route.ts#GET": "counts of jobs, readings and scope items; no revenue",
  "api/forms/submit/route.ts#POST": "answers submission id, number, status and the caller's own metadata",
  "api/inspections/[id]/apply-checklist/route.ts#POST": "answers selected scope items as id, type and description",
  "api/inspections/[id]/contents-manifest/route.ts": "estimatedValue is a contents valuation, not job pricing; redacting it would wipe values on the next draft save (named limit, founder question in RA-8494)",
  "api/inspections/[id]/contents-pack-out/[itemId]/route.ts#DELETE": "answers { deleted: true }",
  "api/inspections/[id]/draft-snapshot/route.ts#PUT": "answers { saved, counts }",
  "api/inspections/[id]/route.ts#DELETE": "answers { success: true }",
  "api/inspections/[id]/route.ts#PATCH": "answers { success: true }",
  "api/inspections/[id]/scope-items/[itemId]/route.ts#DELETE": "answers { success: true }",
  "api/inspections/[id]/vectorise-jobs/route.ts#POST": "answers counts, errors, provider and duration",
  "api/integrations/oauth/[provider]/jobs/route.ts#POST": "answers imported and failed counts and a message",
  "api/onboarding/first-run/route.ts#GET": "checklist flags and counts",
  "api/onboarding/status/route.ts#GET": "setup booleans and static step text",
  "api/portal/[token]/route.ts": "no staff session: the client portal token (outside the technician rule)",
  "api/portal/[token]/updates/route.ts": "no staff session: the client portal token; progress steps only",
  "api/portal/reports/[id]/approvals/route.ts": "client JWT (requireClientAuth), not a staff session (outside the technician rule)",
  "api/portal/reports/[id]/download/route.ts": "client JWT (requireClientAuth), not a staff session (outside the technician rule)",
  "api/portal/reports/[id]/route.ts": "client JWT (requireClientAuth); select carries no money",
  "api/portal/reports/route.ts": "client JWT (requireClientAuth); status fields only",
  "api/reports/[id]/acknowledge-ownership/route.ts#POST": "answers the acknowledged flag and ownership fields",
  "api/reports/[id]/authority-forms/route.ts": "authority forms and signatures have no money columns",
  "api/reports/[id]/authority-forms/suggestions/route.ts#GET": "answers form categories and scope item ids; no totals",
  "api/reports/[id]/equipment/route.ts#POST": "prices server-side; answers { success, message }",
  "api/reports/[id]/generate-forensic-pdf/route.ts#GET": "the forensic PDF draws no price (lib/generate-forensic-report-pdf.ts); named limit if the generator changes",
  "api/reports/[id]/insurer-link/route.ts#POST": "answers the link, token, expiry, report number and address",
  "api/reports/[id]/nir-data/route.ts#POST": "answers counts and photo URLs",
  "api/reports/[id]/route.ts#DELETE": "answers { message }",
  "api/reports/[id]/send/route.ts#POST": "emails the client a link; answers success, recipient and email id",
  "api/reports/[id]/share-access/[accessId]/revoke/route.ts#POST": "answers { ok: true }",
  "api/reports/[id]/share-access/route.ts#GET": "selects id, scope and dates of each grant",
  "api/reports/[id]/share-link/route.ts#POST": "answers the share URL, token and expiry",
  "api/reports/[id]/weakness-check/route.ts#POST": "selects incident and water fields; answers findings text",
  "api/reports/analyze-technician-report/route.ts#POST": "prompt is the field report, address and dates; no totals",
  "api/reports/bulk-delete/route.ts#DELETE": "answers a message and the deleted count",
  "api/reports/bulk-export-zip/route.ts#POST": "each PDF is fetched from /api/reports/[id]/download without the caller's session, so no priced PDF is returned (that route also refuses a technician)",
  "api/reports/bulk-status/route.ts#PATCH": "answers updated and failed counts and warnings",
  "api/reports/completeness-check/route.ts#POST": "answers scores and section text; no values",
  "api/reports/generate-enhanced/route.ts#POST": "answers the narrative it just generated from the caller's own notes, photos and form fields; no price is an input",
  "api/subscription/portal/route.ts#POST": "refuseNonOwner: business owner only; answers a Stripe portal URL",
  "api/team/activity/route.ts#GET": "ADMIN or MANAGER only (role read from the database)",
  "api/user/profile/route.ts#PUT": "the caller's own profile and plan state; no job money",
  "api/webhooks/stripe-connect/route.ts": "Stripe signature only; no session",
  "api/webhooks/stripe/route.ts": "Stripe signature only; no session",
  "portal/insurer/[token]/page.tsx": "no staff session: the insurer token; renders no cost or total",
};

function serverFiles(rel = ""): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(path.join(APP_ROOT, rel), { withFileTypes: true })) {
    if (entry.name === "__tests__" || entry.name === "node_modules") continue;
    const next = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.splice(out.length, 0, ...serverFiles(next));
    else if (/^(route\.ts|page\.tsx|layout\.tsx)$/.test(entry.name)) out.splice(out.length, 0, next);
  }
  return out;
}

/** The handlers in one source file, each with the code that belongs to it. */
export function handlersOf(rel: string, src: string): { id: string; body: string }[] {
  const isPage = !rel.endsWith("route.ts");
  if (isPage && !/from\s+["']@\/lib\/prisma["']/.test(src)) return [];
  const marks = [...src.matchAll(HANDLER)];
  if (marks.length === 0) return isPage ? [{ id: rel, body: src }] : [];
  const preamble = src.slice(0, marks[0].index);
  return marks.map((m, i) => {
    const end = i + 1 < marks.length ? marks[i + 1].index : src.length;
    const verb = m[1] ?? m[2] ?? "default";
    // Helpers above the first handler run on behalf of every handler.
    return { id: `${rel}#${verb}`, body: preamble + src.slice(m.index, end) };
  });
}

export function unclassified(files: Record<string, string>): string[] {
  const out: string[] = [];
  for (const [rel, src] of Object.entries(files)) {
    if (rel in NO_MONEY_TO_TECHNICIAN) continue;
    for (const h of handlersOf(rel, src)) {
      if (h.id in NO_MONEY_TO_TECHNICIAN) continue;
      if (!MONEY_SOURCE.test(h.body)) continue;
      if (!OWNER_CALL.test(h.body)) out.splice(out.length, 0, h.id);
    }
  }
  return out.sort();
}

describe("RA-8494 static guard: every money handler is classified", () => {
  const files = Object.fromEntries(
    serverFiles().map((rel) => [rel, readFileSync(path.join(APP_ROOT, rel), "utf8")]),
  );

  it("finds the route and page files (positive control on the walk)", () => {
    expect(Object.keys(files).filter((f) => f.endsWith("route.ts")).length).toBeGreaterThan(200);
    expect(files["api/invoices/route.ts"]).toBeDefined();
    expect(files["reports/[id]/view/page.tsx"]).toBeDefined();
  });

  it("every money handler calls lib/auth/redact-money or has a stated reason", () => {
    expect(unclassified(files)).toEqual([]);
  });

  it("one owner: only redact-money (and its test double) imports the pure half", () => {
    // The pure half exists so the shared test double keeps the real redactor.
    // Every route and page goes through lib/auth/redact-money.ts, so one
    // place decides who sees money.
    const allowed = new Set([
      "lib/auth/redact-money.ts",
      "lib/auth/__mocks__/redact-money.ts",
      "app/api/inspections/__tests__/technician-no-money.guard.test.ts",
    ]);
    // A grep over tracked and untracked source: a full directory walk with a
    // read per file takes over 30 s on a slow disk.
    const out = execFileSync(
      "git",
      ["grep", "-l", "--untracked", "-E", "money-redaction[\"']", "--", "app", "lib", "components"],
      { cwd: path.resolve(APP_ROOT, ".."), encoding: "utf8" },
    );
    const importers = out.split("\n").filter(Boolean);
    // Positive control: the walk finds the owner itself.
    expect(importers).toContain("lib/auth/redact-money.ts");
    expect(importers.filter((rel) => !allowed.has(rel))).toEqual([]);
  });

  it("every allow-listed path still exists and still touches money", () => {
    for (const key of Object.keys(NO_MONEY_TO_TECHNICIAN)) {
      const rel = key.split("#")[0];
      expect(files[rel], key).toBeDefined();
      expect(MONEY_SOURCE.test(files[rel]), key).toBe(true);
    }
  });

  it("the detector is the redactor's own list: every non-generic money key is caught", () => {
    for (const key of [...MONEY_KEYS, ...MONEY_JSON_TEXT_KEYS, ...MONEY_JSON_OR_PROSE_KEYS]) {
      if (GENERIC_NAMES.has(key)) continue;
      expect(MONEY_SOURCE.test(`return { ${key}: row.${key} };`), key).toBe(true);
    }
  });

  it("planted: a route reading invoices with no owner call is caught", () => {
    const planted = {
      "api/planted/route.ts": `export async function GET() { return Response.json(await prisma.invoice.findMany()); }`,
    };
    expect(unclassified(planted)).toEqual(["api/planted/route.ts#GET"]);
  });

  it("planted: a whole Scope row (no money word, a money model) is caught", () => {
    const planted = {
      "api/planted/route.ts": `export async function GET() { return Response.json(await prisma.scope.findUnique({ where: { id } })); }`,
    };
    expect(unclassified(planted)).toEqual(["api/planted/route.ts#GET"]);
  });

  it("planted: a dailyRate-only route is caught", () => {
    const planted = {
      "api/planted/route.ts": `export async function GET() { return Response.json({ dailyRate: line.dailyRate }); }`,
    };
    expect(unclassified(planted)).toEqual(["api/planted/route.ts#GET"]);
  });

  it("planted: an import of the owner without a call is caught", () => {
    const planted = {
      "api/planted/route.ts": `import { moneySafe } from "@/lib/auth/redact-money";\nexport async function GET() { return Response.json(await prisma.invoice.findMany()); }`,
    };
    expect(unclassified(planted)).toEqual(["api/planted/route.ts#GET"]);
  });

  it("planted: a second handler without its own gate is caught", () => {
    const planted = {
      "api/planted/route.ts": [
        `import { assertMoneyViewer } from "@/lib/auth/redact-money";`,
        `export async function GET() { await assertMoneyViewer(s); return Response.json(await prisma.invoice.findMany()); }`,
        `export async function POST() { return Response.json(await prisma.invoice.create({ data })); }`,
      ].join("\n"),
    };
    expect(unclassified(planted)).toEqual(["api/planted/route.ts#POST"]);
  });

  it("planted: a server page reading a report total through Prisma is caught", () => {
    const planted = {
      "reports/planted/page.tsx": `import { prisma } from "@/lib/prisma";\nexport default async function Page() { const r = await prisma.report.findUnique({ select: { totalCost: true } }); return <V r={r} />; }`,
    };
    expect(unclassified(planted)).toEqual(["reports/planted/page.tsx#default"]);
  });

  it("planted: the gated forms pass", () => {
    const planted = {
      "api/planted/route.ts": `export async function GET() { return Response.json(await moneySafe(s, await prisma.invoice.findMany())); }`,
      "reports/planted/page.tsx": `import { prisma } from "@/lib/prisma";\nexport default async function Page() { const may = await canSeeMoney(s); const r = await prisma.report.findUnique({}); return <V r={r} />; }`,
    };
    expect(unclassified(planted)).toEqual([]);
  });
});
