/**
 * RA-8403 — the public footer must not send a stranger to a 404, and must
 * carry the trust links a buyer looks for (Contact, Help, About, a demo path).
 *
 * Every internal footer href is resolved against the App Router tree on disk:
 * a link passes only when a page (or route handler) exists for it. Route
 * groups `(name)` are transparent and `[param]` segments match any value,
 * which is how Next.js itself resolves them.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FOOTER_COLUMNS } from "../footer-links";

const APP_DIR = path.resolve(__dirname, "../../../../app");
const PAGE_FILES = ["page.tsx", "page.ts", "page.jsx", "page.js", "page.mdx", "route.ts", "route.js"];

function hasPage(dir: string): boolean {
  return PAGE_FILES.some((f) => fs.existsSync(path.join(dir, f)));
}

function childDirs(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
}

/** True when `segments` resolve to a page under `dir`. */
function resolves(dir: string, segments: string[]): boolean {
  const children = childDirs(dir);
  // Route groups do not add a URL segment, so descend into them first.
  for (const group of children.filter((c) => /^\(.+\)$/.test(c))) {
    if (resolves(path.join(dir, group), segments)) return true;
  }
  if (segments.length === 0) return hasPage(dir);
  const [head, ...rest] = segments;
  if (children.includes(head) && resolves(path.join(dir, head), rest)) return true;
  for (const dyn of children.filter((c) => /^\[.+\]$/.test(c))) {
    // [...slug] and [[...slug]] swallow the remaining segments.
    if (/^\[\[?\.\.\./.test(dyn)) {
      if (hasPage(path.join(dir, dyn))) return true;
      continue;
    }
    if (resolves(path.join(dir, dyn), rest)) return true;
  }
  return false;
}

function routeExists(href: string): boolean {
  const pathname = href.split(/[?#]/)[0];
  const segments = pathname.split("/").filter(Boolean);
  return resolves(APP_DIR, segments);
}

const allLinks = FOOTER_COLUMNS.flatMap((col) => col.links);
const internalLinks = allLinks.filter((l) => l.href.startsWith("/"));

describe("public footer links (RA-8403)", () => {
  it("the route resolver can fail (control)", () => {
    expect(routeExists("/pricing")).toBe(true);
    expect(routeExists("/definitely-not-a-real-page-ra8403")).toBe(false);
    expect(routeExists("/pricing/not-a-child-page-ra8403")).toBe(false);
  });

  it.each(internalLinks.map((l) => [l.label, l.href]))(
    "%s (%s) resolves to a page, not a 404",
    (_label, href) => {
      expect(routeExists(href), `${href} has no page under app/`).toBe(true);
    },
  );

  it("carries the trust links a buyer looks for", () => {
    const hrefs = internalLinks.map((l) => l.href.split(/[?#]/)[0]);
    for (const required of ["/contact", "/help", "/about"]) {
      expect(hrefs, `footer is missing ${required}`).toContain(required);
    }
  });

  it("offers a demo path that exists", () => {
    const demo = allLinks.find((l) => /demo/i.test(l.label));
    expect(demo, "footer has no demo link").toBeDefined();
    expect(routeExists(demo!.href)).toBe(true);
    expect(routeExists("/demo"), "/demo returns 404").toBe(true);
  });

  it("has no duplicate hrefs", () => {
    const hrefs = allLinks.map((l) => l.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});
