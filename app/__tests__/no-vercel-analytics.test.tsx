/**
 * RA-7712 — production runs on DigitalOcean, not Vercel. The Vercel Analytics
 * component requests /_vercel/insights/script.js, which 404s there and logs two
 * console errors on every public page. No app or component source may import
 * the Vercel analytics packages.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = process.cwd();
const SCAN_DIRS = ["app", "components"];
const SOURCE_EXT = /\.(?:[cm]?[jt]sx?)$/;
const VERCEL_IMPORT =
  /(?:from\s+|import\s*\(\s*|require\s*\(\s*|import\s+)["']@vercel\/(?:analytics|speed-insights)(?:\/[^"']*)?["']/;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "__tests__") continue;
      out.push(...walk(full));
    } else if (SOURCE_EXT.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

describe("RA-7712 no Vercel Analytics on a non-Vercel host", () => {
  it("import regex detects the known import forms (positive control)", () => {
    expect(VERCEL_IMPORT.test('import { Analytics } from "@vercel/analytics/next";')).toBe(true);
    expect(VERCEL_IMPORT.test("import { SpeedInsights } from '@vercel/speed-insights/next'")).toBe(true);
    expect(VERCEL_IMPORT.test('const a = await import("@vercel/analytics")')).toBe(true);
    expect(VERCEL_IMPORT.test('import "@vercel/analytics";')).toBe(true);
    expect(VERCEL_IMPORT.test('import { track } from "@/lib/analytics";')).toBe(false);
  });

  it("scan covers the real source tree (non-empty)", () => {
    const files = SCAN_DIRS.flatMap((d) => walk(join(ROOT, d)));
    expect(files.some((f) => f.endsWith(`${sep}app${sep}layout.tsx`))).toBe(true);
  });

  it("no file under app/ or components/ imports @vercel/analytics or @vercel/speed-insights", () => {
    const offenders = SCAN_DIRS.flatMap((d) => walk(join(ROOT, d)))
      .filter((f) => VERCEL_IMPORT.test(readFileSync(f, "utf8")))
      .map((f) => relative(ROOT, f));
    expect(offenders).toEqual([]);
  });
});
