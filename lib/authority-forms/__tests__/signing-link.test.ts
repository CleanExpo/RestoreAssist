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
  UNSTAMPED_GRACE_DAYS,
  UNSTAMPED_GRACE_STARTS_ON,
  clearedSigningLinkData,
  isSigningLinkLive,
  liveSigningLinkWhere,
  signingLinkExpiresAt,
  unchangedSlotWhere,
  unstampedGraceEndsAt,
} from "../signing-link";

// NOW is before the deploy day; the unstamped grace is tested at IN_GRACE and
// AFTER_GRACE so the stamped-link tests do not depend on the grace window.
const NOW = new Date("2026-11-23T00:00:00.000Z");
const IN_GRACE = new Date("2026-11-27T00:00:00.000Z");
const AFTER_GRACE = new Date("2026-12-11T00:00:00.000Z");
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

  it("an unreadable send time is never live, in or after the grace", () => {
    expect(isSigningLinkLive("not a date", NOW)).toBe(false);
    expect(isSigningLinkLive("not a date", AFTER_GRACE)).toBe(false);
  });

  it("accepts the ISO string a JSON row carries", () => {
    expect(isSigningLinkLive(daysAgo(1).toISOString(), NOW)).toBe(true);
  });

  it("the where fragment and the row check agree on the cutoff", () => {
    const where = liveSigningLinkWhere(AFTER_GRACE);
    expect(where).toEqual({
      OR: [
        {
          signatureRequestSentAt: {
            gt: new Date(AFTER_GRACE.getTime() - 14 * 86_400_000),
          },
          signatureRequestToken: { not: null },
        },
      ],
    });
    expect(signingLinkExpiresAt(daysAgo(14))).toEqual(NOW);
  });
});

// Founder ruling, Phill 26/11/2026: signing links with no recorded send time
// get 14 days from the day this deploys, then expire.
describe("signing links with no recorded send time (founder ruling 26/11/2026)", () => {
  it("the grace is 14 days from the deploy day, ending 10/12/2026", () => {
    expect(UNSTAMPED_GRACE_DAYS).toBe(14);
    expect(UNSTAMPED_GRACE_STARTS_ON.toISOString()).toBe(
      "2026-11-26T00:00:00.000Z",
    );
    expect(unstampedGraceEndsAt().toISOString()).toBe(
      "2026-12-10T00:00:00.000Z",
    );
  });

  it("a token with no send time is live on the deploy day and until the grace ends", () => {
    expect(isSigningLinkLive(null, IN_GRACE)).toBe(true);
    expect(isSigningLinkLive(undefined, IN_GRACE)).toBe(true);
    expect(isSigningLinkLive(null, new Date("2026-12-09T23:59:59.999Z"))).toBe(
      true,
    );
  });

  it("a token with no send time is expired once the grace has ended", () => {
    expect(isSigningLinkLive(null, new Date("2026-12-10T00:00:00.000Z"))).toBe(
      false,
    );
    expect(isSigningLinkLive(null, AFTER_GRACE)).toBe(false);
    expect(isSigningLinkLive(undefined, AFTER_GRACE)).toBe(false);
  });

  it("a stamped link is unaffected by the grace", () => {
    const sent = new Date(IN_GRACE.getTime() - 15 * 86_400_000);
    expect(isSigningLinkLive(sent, IN_GRACE)).toBe(false);
  });

  it("the where fragment takes an unstamped token during the grace, never a row with no token", () => {
    expect(liveSigningLinkWhere(IN_GRACE).OR).toEqual([
      {
        signatureRequestSentAt: {
          gt: new Date(IN_GRACE.getTime() - 14 * 86_400_000),
        },
        signatureRequestToken: { not: null },
      },
      { signatureRequestSentAt: null, signatureRequestToken: { not: null } },
    ]);
  });

  // A live link is a row that holds a token. The portal revoke and rotate
  // clear the token and leave the send time, so a branch without the token
  // test would list a revoked slot, and the portal would pick its null token
  // ahead of a live slot on the same form. Walk every branch, in and after the
  // grace, so a branch added later without the token test fails here.
  it.each([
    ["in the grace", IN_GRACE],
    ["after the grace", AFTER_GRACE],
  ])(
    "every branch of the where fragment requires a token (%s)",
    (_label, at) => {
      const { OR } = liveSigningLinkWhere(at);
      expect(OR.length).toBeGreaterThan(0);
      for (const branch of OR) {
        expect(branch).toHaveProperty("signatureRequestToken", { not: null });
      }
    },
  );

  it("the where fragment drops the unstamped branch after the grace", () => {
    expect(liveSigningLinkWhere(AFTER_GRACE).OR).toHaveLength(1);
  });

  it("unchangedSlotWhere pins the email and token a writer read, with null never undefined", () => {
    expect(
      unchangedSlotWhere({
        signatoryEmail: "a@example.com",
        signatureRequestToken: "t",
      }),
    ).toEqual({ signatoryEmail: "a@example.com", signatureRequestToken: "t" });
    const unsent = unchangedSlotWhere({ signatoryEmail: "a@example.com" });
    expect(unsent).toHaveProperty("signatureRequestToken", null);
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
