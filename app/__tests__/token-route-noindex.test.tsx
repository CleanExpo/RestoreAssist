import { describe, it, expect } from "vitest";
import { readdirSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Every `[token]` route is reached through an unguessable share link, so the
 * URL is the only thing protecting the record behind it. The root layout
 * declares `robots: { index: true, follow: true }`, and Next merges metadata
 * shallowly with the deepest segment winning — so a `[token]` route that
 * declares nothing inherits an explicit "index, follow" instruction for a
 * secret URL.
 *
 * This scans the route tree rather than listing the known routes, so a token
 * route added later fails here instead of silently shipping as indexable.
 */

const APP_DIR = join(process.cwd(), "app");

function findTokenRouteDirs(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name === "node_modules" || entry.name === "__tests__") continue;
    const full = join(dir, entry.name);
    // Only segments that render a page. `app/api/**/[token]/route.ts` handlers
    // serve JSON, carry no metadata, and are already disallowed in robots.txt.
    if (entry.name === "[token]" && existsSync(join(full, "page.tsx"))) {
      found.push(full);
    }
    findTokenRouteDirs(full, found);
  }
  return found;
}

const tokenRouteDirs = findTokenRouteDirs(APP_DIR);

describe("token-gated routes are never indexable", () => {
  it("finds the token routes it is meant to guard", () => {
    // Guards against a broken finder making every case below vacuously pass.
    const routes = tokenRouteDirs.map((d) => relative(APP_DIR, d));
    expect(routes).toEqual(
      expect.arrayContaining([
        join("invoices", "public", "[token]"),
        join("portal", "[token]"),
        join("portal", "insurer", "[token]"),
        join("capture", "[token]"),
        join("invite", "[token]"),
        join("sign", "[token]"),
      ]),
    );
  });

  it.each(tokenRouteDirs.map((d) => [relative(APP_DIR, d), d]))(
    "%s declares noindex",
    async (_route, dir) => {
      const layoutPath = join(dir, "layout.tsx");
      expect(
        existsSync(layoutPath),
        `${_route} has no layout.tsx, so it inherits the root layout's index:true`,
      ).toBe(true);

      const mod = await import(
        /* @vite-ignore */ pathToFileURL(layoutPath).href
      );

      expect(mod.metadata?.robots).toMatchObject({
        index: false,
        follow: false,
      });
    },
  );
});
