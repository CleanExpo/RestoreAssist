/**
 * RA-7552 — public client-portal entry: aliases 308 to a real portal
 * destination, and the CTA href is the homeowner login — never contractor
 * `/login` or `/dashboard/help`.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import nextConfig from "../../next.config.mjs";
import {
  CLIENT_PORTAL_ENTRY_ALIASES,
  CLIENT_PORTAL_ENTRY_PATH,
  CLIENT_PORTAL_JOB_ALIASES,
  CLIENT_PORTAL_JOB_PATH_PATTERN,
  CLIENT_PORTAL_PUBLIC_CTA,
} from "../portal/canonical-entry";

const repoRoot = join(__dirname, "..", "..");

const FORBIDDEN_DESTINATIONS = ["/dashboard/help", "/login", "/help"];

async function configuredRedirects() {
  return nextConfig.redirects();
}

describe("client portal entry aliases (RA-7552)", () => {
  it("permanently redirects bare aliases to /portal/login", async () => {
    const redirects = await configuredRedirects();
    const expected = CLIENT_PORTAL_ENTRY_ALIASES.map((source) => ({
      source,
      destination: CLIENT_PORTAL_ENTRY_PATH,
      permanent: true,
    }));

    expect(redirects).toEqual(expect.arrayContaining(expected));
    for (const source of CLIENT_PORTAL_ENTRY_ALIASES) {
      const matches = redirects.filter((r) => r.source === source);
      expect(matches).toHaveLength(1);
      expect(matches[0]?.destination).toBe(CLIENT_PORTAL_ENTRY_PATH);
      expect(matches[0]?.permanent).toBe(true);
    }
  });

  it("permanently redirects token aliases to /portal/:token (real job view)", async () => {
    const redirects = await configuredRedirects();
    const expected = CLIENT_PORTAL_JOB_ALIASES.map((source) => ({
      source,
      destination: CLIENT_PORTAL_JOB_PATH_PATTERN,
      permanent: true,
    }));

    expect(redirects).toEqual(expect.arrayContaining(expected));
    for (const source of CLIENT_PORTAL_JOB_ALIASES) {
      const matches = redirects.filter((r) => r.source === source);
      expect(matches).toHaveLength(1);
      expect(matches[0]?.destination).toBe(CLIENT_PORTAL_JOB_PATH_PATTERN);
    }
  });

  it("does not steal /invite/:token — that is the technician accept page", async () => {
    const redirects = await configuredRedirects();
    expect(redirects.some((r) => r.source === "/invite/:token")).toBe(false);
    expect(existsSync(join(repoRoot, "app/invite/[token]/page.tsx"))).toBe(
      true,
    );
  });

  it("never targets contractor help or contractor NextAuth", async () => {
    const redirects = await configuredRedirects();
    const portalSources = new Set<string>([
      ...CLIENT_PORTAL_ENTRY_ALIASES,
      ...CLIENT_PORTAL_JOB_ALIASES,
    ]);
    const portalRedirects = redirects.filter((r) =>
      portalSources.has(r.source),
    );

    expect(portalRedirects).toHaveLength(portalSources.size);
    for (const redirect of portalRedirects) {
      expect(FORBIDDEN_DESTINATIONS).not.toContain(redirect.destination);
    }
  });

  it("redirect destinations exist as App Router pages", () => {
    expect(existsSync(join(repoRoot, "app/portal/login/page.tsx"))).toBe(true);
    expect(existsSync(join(repoRoot, "app/portal/[token]/page.tsx"))).toBe(
      true,
    );
    expect(existsSync(join(repoRoot, "app/portal/page.tsx"))).toBe(true);
    expect(existsSync(join(repoRoot, "app/client/page.tsx"))).toBe(false);
    expect(existsSync(join(repoRoot, "app/share/page.tsx"))).toBe(false);
    expect(existsSync(join(repoRoot, "app/invite/page.tsx"))).toBe(false);
  });
});

describe("client portal public CTA (RA-7552)", () => {
  it("points at the homeowner portal login, not contractor auth or help", () => {
    expect(CLIENT_PORTAL_PUBLIC_CTA.href).toBe("/portal/login");
    expect(CLIENT_PORTAL_PUBLIC_CTA.href).not.toBe("/login");
    expect(CLIENT_PORTAL_PUBLIC_CTA.href).not.toBe("/dashboard/help");
    expect(CLIENT_PORTAL_PUBLIC_CTA.label).toBe("Client portal");
    expect(CLIENT_PORTAL_PUBLIC_CTA.invitedLabel).toBe("Already invited?");
  });

  it("is wired into existing public chrome (hide over invent)", () => {
    const surfaces = [
      "components/landing/home/LandingNav.tsx",
      "components/landing/home/LandingFooter.tsx",
      "components/landing/Footer.tsx",
      "app/login/page.tsx",
    ];

    for (const relative of surfaces) {
      const src = readFileSync(join(repoRoot, relative), "utf8");
      expect(src, relative).toContain("CLIENT_PORTAL_PUBLIC_CTA");
      expect(src, relative).not.toMatch(/href=["']\/dashboard\/help["']/);
    }
  });
});
