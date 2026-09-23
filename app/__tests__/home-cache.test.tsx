/**
 * RA-7712 — the marketing home page must not be served from a one-year cache.
 *
 * A `"use client"` page with no dynamic APIs is prerendered at build time and
 * Next sends `Cache-Control: s-maxage=31536000`, so a fix to `/` can sit behind
 * a CDN for a year. The page must be a server component with a short
 * `revalidate` (ISR). Next overwrites page Cache-Control set in next.config
 * `headers()`, so route segment config is the only lever.
 *
 * Source is parsed rather than imported: the page pulls in next/font/google,
 * which only resolves inside the Next compiler.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const PAGE = join(process.cwd(), "app", "page.tsx");

/** Directive must be the first statement; leading comments are allowed. */
const USE_CLIENT_DIRECTIVE =
  /^\s*(?:(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)\s*)*["']use client["']/;
const REVALIDATE_EXPORT = /export\s+const\s+revalidate\s*=\s*(\d+)\s*;?/;

describe("RA-7712 home page caching", () => {
  const source = readFileSync(PAGE, "utf8");

  it("directive regex detects a client module (positive control)", () => {
    expect(USE_CLIENT_DIRECTIVE.test('"use client";\nexport default 1')).toBe(
      true,
    );
    expect(
      USE_CLIENT_DIRECTIVE.test("// note\n/* x */\n'use client'\nexport {}"),
    ).toBe(true);
    expect(USE_CLIENT_DIRECTIVE.test("export const revalidate = 300;")).toBe(
      false,
    );
  });

  it("app/page.tsx is a server component, not a 'use client' module", () => {
    expect(USE_CLIENT_DIRECTIVE.test(source)).toBe(false);
  });

  it("app/page.tsx exports a numeric revalidate between 1 and 600 seconds", () => {
    const match = source.match(REVALIDATE_EXPORT);
    expect(match, "export const revalidate = <seconds> not found").not.toBe(
      null,
    );
    const seconds = Number(match![1]);
    expect(seconds).toBeGreaterThanOrEqual(1);
    expect(seconds).toBeLessThanOrEqual(600);
  });
});
