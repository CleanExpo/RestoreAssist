// @vitest-environment node
/**
 * Customer copy must not carry developer wording: no ticket ids, no HTTP
 * status codes, no "Coming soon" tiles, no internal host names. Comments and
 * tests are exempt; only text that can reach a screen is scanned.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "..", "..", "..");

/**
 * Trees and files the scan does not cover, each with the reason. A path here
 * is a recorded decision, not an oversight.
 */
const SKIPPED: { path: string; reason: string }[] = [
  { path: "app/api", reason: "route handlers return JSON to clients; screens map it through customerErrorMessage" },
  { path: "app/dashboard/admin", reason: "platform-staff surface, never shown to customers" },
  { path: "app/dashboard/margot/home", reason: "owned by the Mission Control removal PR (its own guard covers it)" },
  // Not skipped: remaining Hermes / SOUL.md mentions in lib/margot/*.ts and
  // app/api/margot/chat/route.ts sit in comments that never render.
];

function isSkipped(full: string): boolean {
  const rel = relative(root, full);
  return SKIPPED.some((s) => rel === s.path || rel.startsWith(s.path + "/"));
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "__tests__" || name === "node_modules") continue;
    const full = join(dir, name);
    if (isSkipped(full)) continue;
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.(test|spec)\./.test(name)) out.push(full);
  }
  return out;
}

/** Remove block comments (including JSX {/* *\/}) and line comments. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[\s;{},)])\/\/.*$/gm, "$1");
}

const RULES: { name: string; pattern: RegExp }[] = [
  { name: "ticket id", pattern: /\bRA-\d+\b(?!-\d)/ }, // not an invoice number such as RA-2026-0099
  { name: "HTTP status code", pattern: /\bHTTP (\d{3}|\$\{)/ },
  { name: "Coming soon", pattern: /coming soon/i },
  { name: "internal host name", pattern: /\bHermes\b|\bMac mini\b|SOUL\.md/ },
];

function findViolations(source: string): string[] {
  const code = stripComments(source);
  const hits: string[] = [];
  code.split("\n").forEach((line, i) => {
    for (const rule of RULES) {
      if (rule.pattern.test(line)) hits.push(`line ${i + 1}: ${rule.name}: ${line.trim()}`);
    }
  });
  return hits;
}

// lib files that build strings a customer can read. Other lib files throw or
// log developer diagnostics (server routes, providers, cron, release tooling)
// and are skipped on purpose.
const LIB_FILES = [
  "lib/client/customer-error-copy.ts",
  "lib/client/parse-api-error.ts",
  "lib/addons/addon-guide.ts",
  "lib/billing/addon-access.ts",
  "lib/sketch/roomplan-custody-queue.ts",
  "lib/voice-note-queue.ts",
  "lib/compliance/make-safe-actions.ts",
  "lib/moisture/moisture-map-placement.ts",
  "lib/integrations/external-sync-client.ts",
  "lib/forms/hooks/useInterviewAnalytics.ts",
];

describe("customer copy has no developer wording", () => {
  it("the scanner itself catches each kind (positive control)", () => {
    expect(findViolations('<p>Tracked under RA-1260.</p>')).toHaveLength(1);
    expect(findViolations("message: `unavailable (HTTP ${status})`")).toHaveLength(1);
    expect(findViolations('<p>HTTP 401 returned</p>')).toHaveLength(1);
    expect(findViolations('<p>Coming Soon</p>')).toHaveLength(1);
    expect(findViolations("<p>Hermes stack on the Mac mini</p>")).toHaveLength(1);
    expect(findViolations("<code>SOUL.md</code>")).toHaveLength(1);
    // Comments are exempt.
    expect(findViolations("// RA-1260 note\n{/* RA-1 */}\n/* HTTP 500 */")).toHaveLength(0);
  });

  it("skips only recorded paths, and each one exists", () => {
    for (const s of SKIPPED) expect(() => statSync(join(root, s.path))).not.toThrow();
  });

  const trees: [string, string[]][] = [
    ["app", walk(join(root, "app"))],
    ["components", walk(join(root, "components"))],
    ["lib (customer-facing files)", LIB_FILES.map((f) => join(root, f))],
  ];

  it.each(trees)("%s has no developer wording", (_name, files) => {
    expect(files.length).toBeGreaterThan(0);
    const hits = files.flatMap((file) =>
      findViolations(readFileSync(file, "utf8")).map((h) => `${relative(root, file)} ${h}`),
    );
    expect(hits).toEqual([]);
  });

  it("scans a non-trivial set of files", () => {
    expect(trees[0][1].length).toBeGreaterThan(300);
    expect(trees[1][1].length).toBeGreaterThan(100);
  });
});
