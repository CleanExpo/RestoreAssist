import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { IOS_SHELL_UA_TOKEN, isIosShellUserAgent } from "@/lib/capacitor";

/**
 * The App Review 3.1.1 gate depends on a FOUR-LINK chain, and every link lives
 * in a different file. The component tests all supply their own provider, so
 * they stay green even if the layout stops passing the verdict — an
 * independent reviewer proved exactly that. These tests bind the links.
 *
 * If one of these fails, the billing UI is painted in the iOS shell again.
 * Fix the wiring; do not relax the assertion.
 */
const repoRoot = process.cwd();
const read = (p: string) => readFileSync(join(repoRoot, p), "utf8");

describe("iOS shell detection — cross-file wiring", () => {
  it("link 1: capacitor.config.ts appends the exact token lib/capacitor.ts matches", () => {
    const config = read("capacitor.config.ts");
    const appended = /appendUserAgent:\s*"([^"]+)"/u.exec(config)?.[1];

    expect(appended).toBe(IOS_SHELL_UA_TOKEN);
  });

  it("link 2: the root layout computes the verdict from the request user-agent", () => {
    const layout = read("app/layout.tsx");

    expect(layout).toContain("isIosShellUserAgent");
    expect(layout).toMatch(/headers\(\)/u);
    expect(layout).toMatch(/user-agent/iu);
  });

  it("link 3: the root layout passes the COMPUTED verdict, not a literal", () => {
    const layout = read("app/layout.tsx");

    // A first attempt at this test matched `isIosShell={` and therefore passed
    // against a hardcoded `isIosShell={false}` — a silent fail-open. Bind the
    // prop to the variable derived from the request instead.
    const passed = /<ShellPlatformProvider\s+isIosShell=\{([^}]+)\}/u.exec(
      layout,
    )?.[1];

    expect(passed).toBeDefined();
    expect(passed?.trim()).toBe("isIosShell");
    // And that variable must come from the user-agent, not be reassigned.
    expect(layout).toMatch(
      /const\s+isIosShell\s*=\s*isIosShellUserAgent\(/u,
    );
  });

  it("link 4: BillingGate prefers the server verdict over its client read", () => {
    const gate = read("components/capacitor/BillingGate.tsx");

    expect(gate).toContain("useServerIosShell");
    expect(gate).toMatch(/serverVerdict\s*===\s*true\s*\|\|/u);
  });

  it("matches a real shell user-agent and rejects ordinary browsers", () => {
    const shellUa = `Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 ${IOS_SHELL_UA_TOKEN}`;
    const safariUa =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1";
    const googlebot =
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

    expect(isIosShellUserAgent(shellUa)).toBe(true);
    expect(isIosShellUserAgent(safariUa)).toBe(false);
    // Crawlers must keep seeing pricing, or the public page stops ranking.
    expect(isIosShellUserAgent(googlebot)).toBe(false);
    expect(isIosShellUserAgent(null)).toBe(false);
    expect(isIosShellUserAgent(undefined)).toBe(false);
    expect(isIosShellUserAgent("")).toBe(false);
  });

  it("no BillingGate lives under a force-static route", () => {
    // force-static makes headers() return empty, so the server verdict
    // silently becomes false AND the fail-open response is CDN-cached.
    const gateFiles = read(".planning/BILLING_GATE_ROUTES.txt")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"));

    for (const file of gateFiles) {
      const src = read(file);
      expect(
        src,
        `${file} renders a BillingGate and must not be force-static`,
      ).not.toMatch(/dynamic\s*=\s*["']force-static["']/u);
    }
  });
});
