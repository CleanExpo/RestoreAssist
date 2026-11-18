/**
 * RA-8445 — one owner decides whether an accounting connection can be used.
 *
 * The owner is getOAuthReadiness (lib/integrations/identity.ts), reached via
 * selectOAuthIntegration({ requireReady: true }) or describeOAuthCard. A row
 * that is CONNECTED but has no organisation is NOT ready. Hand-written copies
 * of that question have drifted from the owner nine times (RA-7721, RA-8420,
 * RA-8432, RA-8435, RA-8437, RA-8438, RA-7805, RA-8443, and the metrics route
 * fixed with this test), so this test finds every copy instead of fixing them
 * one at a time.
 *
 * How it finds them: every .ts/.tsx file under app/, lib/ and components/
 * (tests excluded) is parsed with the TypeScript parser, so comments and plain
 * strings never count. A file "reads readiness by hand" when it has one of:
 *   - a comparison (=== == !== !=) or `case` against "CONNECTED",
 *     "DISCONNECTED" or "SYNCING" (values only IntegrationStatus uses);
 *   - an array of those values with `.includes(...)`;
 *   - a Prisma `where` with `status:` holding one of those values;
 *   - a `<`/`>` comparison involving `.tokenExpiresAt`, or a `where` filter
 *     object on `tokenExpiresAt`.
 * Such a file must be an owner or carry an ALLOWLIST entry with a reason. An
 * entry whose file no longer matches fails, so the list can only shrink.
 *
 * Known limits (named, not tested): "ERROR" is not a trigger on its own,
 * because three Prisma enums share it; a lookup table keyed by the raw status
 * (`{ CONNECTED: ... }[row.status]`) is not detected.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const repoRoot = join(__dirname, "..", "..", "..");
const ROOTS = ["app", "lib", "components"];
const SOURCE = /\.tsx?$/;
const TEST_FILE = /\.(test|spec)\.tsx?$/;
const PREFILTER = /CONNECTED|SYNCING|tokenExpiresAt/;

const OWNERS = new Set([
  "lib/integrations/identity.ts",
  "lib/services/integrations/select-oauth.ts",
]);

// Same defect kind as this ticket, not yet routed through the owner. Each one
// is a follow-up; remove the entry when the file asks getOAuthReadiness.
const KNOWN_COPY = "KNOWN COPY, follow-up RA-8446:";
const ALLOWLIST: Record<string, string> = {
  "app/api/admin/stats/route.ts": `${KNOWN_COPY} admin count of status CONNECTED rows`,
  "app/api/cron/sync-invoices/route.ts": `${KNOWN_COPY} cron picks status CONNECTED rows to sync`,
  "app/api/cron/sync-xero-payments/route.ts": `${KNOWN_COPY} cron picks status CONNECTED Xero rows`,
  "app/api/integrations/health/route.ts": `${KNOWN_COPY} token-validity check; fix is RA-8443 (not merged)`,
  "app/api/invoices/[id]/sync/route.ts": `${KNOWN_COPY} re-checks raw status and a lapsed token after selectOAuthIntegration`,
  "app/api/webhooks/myob/route.ts": `${KNOWN_COPY} webhook routing picks the status CONNECTED row`,
  "app/api/webhooks/quickbooks/route.ts": `${KNOWN_COPY} webhook routing picks the status CONNECTED row`,
  "app/api/webhooks/servicem8/route.ts": `${KNOWN_COPY} webhook routing picks status CONNECTED rows`,
  "app/api/webhooks/xero/route.ts": `${KNOWN_COPY} webhook routing picks the status CONNECTED row`,
  "lib/integrations/nir-sync-orchestrator.ts": `${KNOWN_COPY} picks status CONNECTED rows and skips the rest`,
  "lib/integrations/xero/webhook-processor.ts": `${KNOWN_COPY} matchesTenant requires raw status CONNECTED`,
  "lib/services/xero/binding.ts": `${KNOWN_COPY} binding guard repeats the owner's status set`,
  "lib/integrations/xero/client.ts":
    `refresh trigger (tokenExpiresAt within 5 min); ${KNOWN_COPY} mid-sync binding guard repeats the owner's status set`,
  "app/api/integrations/[id]/route.ts": "input check - PATCH body may only set status DISCONNECTED",
  "app/dashboard/integrations/health/page.tsx":
    "reads the describeOAuthCard state returned by /api/integrations/metrics, not Integration.status",
  "app/dashboard/integrations/page.tsx": "reads describeOAuthCard state (SYNCING), not Integration.status",
  "lib/integrations/base-client.ts": "refresh trigger - decides when to refresh the access token",
  "lib/integrations/oauth-handler.ts": "computes isExpired for token callers, which refresh; no usability verdict",
  "lib/integrations/quickbooks/client.ts": "refresh trigger - decides when to refresh the access token",
  "lib/integrations/zoho/client.ts": "refresh trigger - decides when to refresh the access token",
  "lib/integrations/zoho/queue.ts": "writer - updateMany sets the next status after a Zoho sync",
  "lib/services/integrations/ai-readiness.ts": "AI API-key rows (apiKey not null), not OAuth accounting connections",
  "lib/services/integrations/display.ts":
    "display owner built on getOAuthReadiness; maps AI key rows and passes through the state of a ready row",
  "lib/services/myob/credentials.ts": "refresh trigger - decides when to refresh the access token",
  "lib/services/quickbooks/credentials.ts": "refresh trigger - decides when to refresh the access token",
  "lib/services/xero/credentials.ts": "refresh trigger - decides when to refresh the access token",
  "lib/setup/checks.ts": "compares a readiness reason code (the owner's output), not Integration.status",
};

// ─── Detector ────────────────────────────────────────────────────────────────

const STATUS_VALUES = new Set(["CONNECTED", "DISCONNECTED", "SYNCING"]);
const EQUALITY = new Set([
  ts.SyntaxKind.EqualsEqualsEqualsToken,
  ts.SyntaxKind.EqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsToken,
]);
const ORDERING = new Set([
  ts.SyntaxKind.LessThanToken,
  ts.SyntaxKind.GreaterThanToken,
  ts.SyntaxKind.LessThanEqualsToken,
  ts.SyntaxKind.GreaterThanEqualsToken,
]);

const isStatusValue = (n: ts.Node | undefined): boolean =>
  !!n && (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) && STATUS_VALUES.has(n.text);
const isExpiryRead = (n: ts.Node): boolean =>
  ts.isPropertyAccessExpression(n) && n.name.text === "tokenExpiresAt";
const keyOf = (n: ts.PropertyName): string | undefined =>
  ts.isIdentifier(n) || ts.isStringLiteral(n) ? n.text : undefined;
const unwrap = (n: ts.Expression): ts.Expression =>
  ts.isAsExpression(n) || ts.isParenthesizedExpression(n) ? unwrap(n.expression) : n;

function contains(node: ts.Node, test: (n: ts.Node) => boolean): boolean {
  let found = false;
  const visit = (n: ts.Node) => {
    if (found) return;
    if (test(n)) found = true;
    else ts.forEachChild(n, visit);
  };
  visit(node);
  return found;
}

/** True when the property sits inside a Prisma `where`, not a `data` write. */
function insideWhere(node: ts.Node): boolean {
  for (let p = node.parent; p; p = p.parent) {
    if (ts.isPropertyAssignment(p)) {
      const key = keyOf(p.name);
      if (key === "where") return true;
      if (key === "data") return false;
    }
    if (ts.isFunctionLike(p)) return false;
  }
  return false;
}

function findReadinessReads(text: string, file = "scratch.ts"): string[] {
  const kind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
  const hits: string[] = [];
  const add = (n: ts.Node, what: string) =>
    hits.push(`${what}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}`);
  const visit = (n: ts.Node) => {
    if (ts.isBinaryExpression(n) && EQUALITY.has(n.operatorToken.kind) &&
        (isStatusValue(n.left) || isStatusValue(n.right))) add(n, "status-compare");
    if (ts.isCaseClause(n) && isStatusValue(n.expression)) add(n, "status-case");
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) &&
        n.expression.name.text === "includes" &&
        ts.isArrayLiteralExpression(unwrap(n.expression.expression)) &&
        contains(n.expression.expression, isStatusValue)) add(n, "status-includes");
    if (ts.isPropertyAssignment(n) && keyOf(n.name) === "status" &&
        contains(n.initializer, isStatusValue) && insideWhere(n)) add(n, "status-where");
    if (ts.isPropertyAssignment(n) && keyOf(n.name) === "tokenExpiresAt" &&
        ts.isObjectLiteralExpression(n.initializer) && insideWhere(n)) add(n, "expiry-where");
    if (ts.isBinaryExpression(n) && ORDERING.has(n.operatorToken.kind) &&
        (contains(n.left, isExpiryRead) || contains(n.right, isExpiryRead))) add(n, "expiry-compare");
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return hits;
}

// ─── Discovery ───────────────────────────────────────────────────────────────

function listSources(): Map<string, string> {
  const files = new Map<string, string>();
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (entry === "node_modules" || entry === "__tests__") continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (SOURCE.test(entry) && !TEST_FILE.test(entry)) {
        files.set(relative(repoRoot, full).split(sep).join("/"), readFileSync(full, "utf8"));
      }
    }
  };
  for (const root of ROOTS) walk(join(repoRoot, root));
  return files;
}

function readersOf(files: Map<string, string>): Map<string, string[]> {
  const readers = new Map<string, string[]>();
  for (const [path, text] of files) {
    if (!PREFILTER.test(text)) continue;
    const hits = findReadinessReads(text, path);
    if (hits.length) readers.set(path, hits);
  }
  return readers;
}

function offenders(readers: Map<string, string[]>): string[] {
  return [...readers.entries()]
    .filter(([path]) => !OWNERS.has(path) && !(path in ALLOWLIST))
    .map(([path, hits]) => `${path} (${hits.join(", ")})`);
}

const sources = listSources();
const readers = readersOf(sources);

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("RA-8445: connection readiness has one owner", () => {
  it("discovers a real file set", () => {
    // Positive control: if discovery broke, everything below would pass empty.
    expect(sources.size).toBeGreaterThan(500);
    expect(readers.has("lib/integrations/identity.ts")).toBe(true);
  });

  it("no file outside the owners decides readiness by hand without an allow-list reason", () => {
    expect(
      offenders(readers),
      "Ask getOAuthReadiness (lib/integrations/identity.ts) or selectOAuthIntegration({ requireReady: true }) " +
        "instead of reading Integration.status or tokenExpiresAt. If the read is not a readiness decision " +
        "(a writer, a refresh trigger), add an ALLOWLIST entry with a one-line reason.",
    ).toEqual([]);
  });

  it("every allow-list entry still matches and gives a reason, so the list only shrinks", () => {
    const stale = Object.keys(ALLOWLIST).filter((path) => !readers.has(path));
    expect(stale, "remove these entries: the file no longer reads readiness by hand").toEqual([]);
    for (const [path, reason] of Object.entries(ALLOWLIST)) {
      expect(reason.trim().length, path).toBeGreaterThan(10);
    }
  });

  it("the fixed metrics route and sync-history screen are not on the allow-list", () => {
    expect(ALLOWLIST).not.toHaveProperty(["app/api/integrations/metrics/route.ts"]);
    expect(ALLOWLIST).not.toHaveProperty(["app/dashboard/integrations/sync-history/page.tsx"]);
  });
});

describe("RA-8445 detector controls (planted in memory, real files untouched)", () => {
  const red = (code: string) => expect(findReadinessReads(code)).not.toEqual([]);
  const clean = (code: string) => expect(findReadinessReads(code)).toEqual([]);

  it("goes red on each shape of a hand-written readiness read", () => {
    red(`const ok = row.status === "CONNECTED";`);
    red(`if ("SYNCING" !== integration.status) return;`);
    red(`switch (row.status) { case "DISCONNECTED": break; }`);
    red(`const ok = ["CONNECTED", "SYNCING"].includes(row.status);`);
    red(`const ok = (["CONNECTED"] as const).includes(row.status as never);`);
    red(`prisma.integration.findMany({ where: { userId, status: "CONNECTED" } });`);
    red(`prisma.integration.findMany({ where: { status: { in: ["CONNECTED", "ERROR"] } } });`);
    red(`const expired = row.tokenExpiresAt && row.tokenExpiresAt < new Date();`);
    red(`const soon = row.tokenExpiresAt.getTime() - Date.now() < 300000;`);
    red(`prisma.integration.findMany({ where: { tokenExpiresAt: { lt: new Date() } } });`);
    red(`const dot = <span>{props.status === "CONNECTED" ? "on" : "off"}</span>;`);
  });

  it("stays clean on comments, plain strings, writers and the owner's call", () => {
    clean(`// if (row.status === "CONNECTED") show green\n/* status: "CONNECTED" */`);
    clean(`const help = 'row.status === "CONNECTED" is not enough';`);
    clean(`prisma.integration.update({ where: { id }, data: { status: "CONNECTED" } });`);
    clean(`const ready = getOAuthReadiness(row, "XERO").ready;`);
    clean(`const failed = log.status === "FAILED" || row.status === "ERROR";`);
  });

  it("goes red on a scratch copy of the metrics route with a raw read planted", () => {
    const path = "app/api/integrations/metrics/route.ts";
    const real = sources.get(path);
    expect(real).toBeDefined();
    expect(findReadinessReads(real!, path), "the fixed route itself must be clean").toEqual([]);

    const scratch = new Map(sources);
    scratch.set(path, `${real}\nexport const planted = (i: { status: string }) => i.status === "CONNECTED";\n`);
    expect(offenders(readersOf(scratch))).toEqual([
      expect.stringContaining("app/api/integrations/metrics/route.ts (status-compare:"),
    ]);
  });

  it("goes red when a new, unlisted file copies the question", () => {
    const scratch = new Map(sources);
    scratch.set("app/api/scratch-ra-8445/route.ts", `export const live = (r: any) => r.status === "SYNCING";`);
    expect(offenders(readersOf(scratch))).toEqual([
      expect.stringContaining("app/api/scratch-ra-8445/route.ts"),
    ]);
  });
});
