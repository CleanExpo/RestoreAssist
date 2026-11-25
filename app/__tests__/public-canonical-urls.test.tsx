import { describe, it, expect, vi } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * RA-8542: the root layout declares canonical "/". A page that defines no
 * canonical of its own inherits it, which tells search engines the page
 * duplicates the home page. Each indexable page below must declare its own.
 */
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
// The pages import next/font; only their exported metadata is under test.
vi.mock("next/font/local", () => ({ default: () => ({ className: "", variable: "" }) }));
vi.mock("next/font/google", () => ({ default: () => ({ className: "", variable: "" }) }));

const ROUTES = [
  { route: "signup", file: "layout.tsx" },
  { route: "privacy", file: "page.tsx" },
  { route: "terms", file: "page.tsx" },
  { route: "support", file: "page.tsx" },
  { route: "status", file: "page.tsx" },
  { route: "contractors", file: "page.tsx" },
] as const;

describe("indexable public pages declare their own canonical URL", () => {
  for (const { route, file } of ROUTES) {
    it(`/${route} canonicalises to itself, not the home page`, async () => {
      const path = join(process.cwd(), "app", route, file);
      expect(existsSync(path), `app/${route}/${file} exists`).toBe(true);
      const mod = await import(pathToFileURL(path).href);
      const alternates = mod.metadata?.alternates as
        | { canonical?: string }
        | undefined;
      expect(alternates?.canonical).toBe(`/${route}`);
    });
  }
});
