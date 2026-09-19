/**
 * RA-7540 — muscle-memory auth aliases must land on a live destination.
 *
 * /auth/signup 404'd while /signup worked. Same class as /register → /signup
 * and /auth/signin → /login: Next.js permanent (308) redirects in next.config.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import nextConfig from "../../next.config.mjs";

const repoRoot = join(__dirname, "..", "..");

describe("legacy auth route aliases (RA-7540)", () => {
  it("permanently redirects /auth/signup and /register to /signup", async () => {
    const redirects = await nextConfig.redirects();
    const toSignup = redirects.filter((r) => r.destination === "/signup");

    expect(toSignup).toEqual(
      expect.arrayContaining([
        { source: "/register", destination: "/signup", permanent: true },
        { source: "/auth/signup", destination: "/signup", permanent: true },
      ]),
    );
    expect(toSignup.every((r) => r.permanent === true)).toBe(true);
  });

  it("keeps /auth/signin on the same permanent-alias pattern toward /login", async () => {
    const redirects = await nextConfig.redirects();
    expect(redirects).toEqual(
      expect.arrayContaining([
        { source: "/auth/signin", destination: "/login", permanent: true },
      ]),
    );
  });

  it("redirect destinations exist as App Router pages", () => {
    expect(existsSync(join(repoRoot, "app/signup/page.tsx"))).toBe(true);
    expect(existsSync(join(repoRoot, "app/login/page.tsx"))).toBe(true);
    expect(existsSync(join(repoRoot, "app/auth/signup/page.tsx"))).toBe(false);
  });
});
