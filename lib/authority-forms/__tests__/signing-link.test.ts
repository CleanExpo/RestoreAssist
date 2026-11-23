/**
 * RA-8589 — signing-link lifetime, and the reader allow-list that stops a
 * new route from handing out or accepting a signing token without the
 * expiry rule.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import {
  SIGNING_LINK_TTL_DAYS,
  clearedSigningLinkData,
  isSigningLinkLive,
  liveSigningLinkWhere,
  signingLinkExpiresAt,
} from "../signing-link";

const NOW = new Date("2026-11-23T00:00:00.000Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);

describe("signing-link lifetime (RA-8589)", () => {
  it("is 14 days", () => {
    expect(SIGNING_LINK_TTL_DAYS).toBe(14);
  });

  it("a link sent inside the period is live", () => {
    expect(isSigningLinkLive(daysAgo(0), NOW)).toBe(true);
    expect(isSigningLinkLive(daysAgo(13.9), NOW)).toBe(true);
  });

  it("a link sent at or before the period is expired", () => {
    expect(isSigningLinkLive(daysAgo(14), NOW)).toBe(false);
    expect(isSigningLinkLive(daysAgo(60), NOW)).toBe(false);
  });

  it("a token with no send time, or an unreadable one, is expired", () => {
    expect(isSigningLinkLive(null, NOW)).toBe(false);
    expect(isSigningLinkLive(undefined, NOW)).toBe(false);
    expect(isSigningLinkLive("not a date", NOW)).toBe(false);
  });

  it("accepts the ISO string a JSON row carries", () => {
    expect(isSigningLinkLive(daysAgo(1).toISOString(), NOW)).toBe(true);
  });

  it("the where fragment and the row check agree on the cutoff", () => {
    const where = liveSigningLinkWhere(NOW);
    expect(where).toEqual({ signatureRequestSentAt: { gt: daysAgo(14) } });
    expect(signingLinkExpiresAt(daysAgo(14))).toEqual(NOW);
  });

  it("clearing a link removes the token and the sent stamp", () => {
    expect(clearedSigningLinkData()).toEqual({
      signatureRequestToken: null,
      signatureRequestSent: false,
      signatureRequestSentAt: null,
    });
  });
});

// ---------------------------------------------------------------------------
// Token reader allow-list: every file that names signatureRequestToken either
// takes the lifetime rule from lib/authority-forms/signing-link or carries a
// reviewed reason here.
// ---------------------------------------------------------------------------

const REPO_ROOT = join(__dirname, "..", "..", "..");
const SCAN_ROOTS = ["app", "lib", "scripts"];
const TOKEN_USE = /\bsignatureRequestToken\b/;
const LINK_IMPORT = /from\s+["']@\/lib\/authority-forms\/signing-link["']/;
const OWNER = "lib/authority-forms/signing-link.ts";

/** Files that issue, accept, list or clear a signing token under the rule. */
const RULED = [
  "app/api/authority-forms/sign/[token]/route.ts",
  "app/api/authority-forms/[id]/send-signature-request/route.ts",
  "app/api/portal/[token]/authorities/route.ts",
];

/** Files reviewed and left without the rule, each with its reason. */
const EXEMPT: Record<string, string> = {
  "app/api/reports/[id]/authority-forms/route.ts":
    "staff-only read of the row for the report screen; issues and accepts nothing",
  "lib/portal/clear-client-signing-links.ts":
    "only sets the token to null, which switches a link off",
};

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "__tests__") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      out.push(full);
    }
  }
}

function findTokenUsers(): string[] {
  const files: string[] = [];
  for (const root of SCAN_ROOTS) walk(join(REPO_ROOT, root), files);
  return files
    .filter((f) => TOKEN_USE.test(readFileSync(f, "utf8")))
    .map((f) => relative(REPO_ROOT, f).split(sep).join("/"))
    .filter((f) => f !== OWNER)
    .sort();
}

describe("signing-token reader allow-list (RA-8589)", () => {
  const users = findTokenUsers();

  it("scan finds the known users (positive control: an empty scan fails)", () => {
    for (const f of RULED) expect(users).toContain(f);
  });

  it("every token user is ruled or a reviewed exemption", () => {
    const listed = new Set([...RULED, ...Object.keys(EXEMPT)]);
    expect(
      users.filter((f) => !listed.has(f)),
      "New signing-token user: import lib/authority-forms/signing-link and add it to RULED, or add a reviewed reason to EXEMPT",
    ).toEqual([]);
    expect(
      [...listed].filter((f) => !users.includes(f)),
      "Allow-list names a file that no longer uses the token",
    ).toEqual([]);
  });

  it("every ruled file imports the lifetime module", () => {
    for (const f of RULED) {
      const src = readFileSync(join(REPO_ROOT, f), "utf8");
      expect(LINK_IMPORT.test(src), `${f} must import signing-link`).toBe(true);
    }
  });
});
