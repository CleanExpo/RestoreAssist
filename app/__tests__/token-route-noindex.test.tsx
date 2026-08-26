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

/**
 * Next's default `pageExtensions`, which this project does not override. The
 * repo is all-TSX today, but matching only `.tsx` would mean a token route
 * added later as `page.js` is never discovered by the finder below — it would
 * ship indexable with this suite still green, which is the exact failure this
 * file exists to prevent.
 */
const PAGE_EXTENSIONS = ["tsx", "ts", "jsx", "js"] as const;

/** Resolve `page`/`layout` in `dir` across every extension Next accepts. */
function resolveRouteFile(dir: string, base: "page" | "layout"): string | null {
  for (const ext of PAGE_EXTENSIONS) {
    const candidate = join(dir, `${base}.${ext}`);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/** Collect every `[token]` segment that renders a page, at any depth. */
function findTokenRouteDirs(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name === "node_modules" || entry.name === "__tests__") continue;
    const full = join(dir, entry.name);
    // Only segments that render a page. `app/api/**/[token]/route.ts` handlers
    // serve JSON, carry no metadata, and are already disallowed in robots.txt.
    if (entry.name === "[token]" && resolveRouteFile(full, "page")) {
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
      const layoutPath = resolveRouteFile(dir, "layout");
      expect(
        layoutPath,
        `${_route} has no layout file, so it inherits the root layout's index:true`,
      ).not.toBeNull();

      const mod = await import(
        /* @vite-ignore */ pathToFileURL(layoutPath as string).href
      );

      expect(mod.metadata?.robots).toMatchObject({
        index: false,
        follow: false,
      });
    },
  );
});
