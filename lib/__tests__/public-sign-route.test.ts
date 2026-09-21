/**
 * RA-7583 — /sign/[token] is a public token-gated surface, same class as
 * /invite/[token]. Homeowners have no account; the login gate must not
 * intercept the URL, and the confirmation screen must not point at a
 * session-gated PDF that 401s the signer.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = join(__dirname, "..", "..");

function loginGatePrefixesSource(): string {
  const src = readFileSync(join(repoRoot, "proxy.ts"), "utf8");
  const match = src.match(/const LOGIN_GATE_PREFIXES = \[([\s\S]*?)\];/);
  if (!match) {
    throw new Error("LOGIN_GATE_PREFIXES not found in proxy.ts");
  }
  return match[1];
}

describe("public /sign/[token] route (RA-7583)", () => {
  it("is not listed in LOGIN_GATE_PREFIXES", () => {
    const prefixes = loginGatePrefixesSource();
    expect(prefixes).toMatch(/["']\/reports["']/);
    expect(prefixes).toMatch(/["']\/compliance["']/);
    expect(prefixes).not.toMatch(/["']\/sign\/?["']/);
  });

  it("does not offer a session-gated Download Signed PDF on the public page", () => {
    const page = readFileSync(
      join(repoRoot, "app/sign/[token]/page.tsx"),
      "utf8",
    );
    expect(page).not.toMatch(/Download Signed PDF/);
    expect(page).not.toMatch(/\/api\/authority-forms\/\$\{form\.id\}\/pdf/);
  });

  it("proves these source checks can see an offender", () => {
    const plantedGate = `const LOGIN_GATE_PREFIXES = [\n  "/sign/",\n  "/sign",\n];`;
    const plantedButton =
      'href={`/api/authority-forms/${form.id}/pdf`} Download Signed PDF';
    expect(/["']\/sign\/?["']/.test(plantedGate)).toBe(true);
    expect(/Download Signed PDF/.test(plantedButton)).toBe(true);
    expect(/\/api\/authority-forms\/\$\{form\.id\}\/pdf/.test(plantedButton)).toBe(
      true,
    );
  });
});
