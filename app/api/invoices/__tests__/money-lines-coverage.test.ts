/**
 * RA-8398: every route under app/api/invoices that reads `lineItems` from the
 * request body must call the one shared line check, `validateMoneyLines`.
 *
 * The check used to be copied by hand into three routes and missed in two
 * (credit notes, recurring templates), so those saved negative or NaN totals.
 * This test makes the next money route that forgets it fail in CI.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "..");

function routeFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "__tests__" ? [] : routeFiles(full);
    }
    return entry.name === "route.ts" ? [full] : [];
  });
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** True when the file takes `lineItems` from the parsed request body. */
function readsLineItemsFromBody(source: string): boolean {
  if (/\bbody\.lineItems\b/.test(source)) return true;
  const destructures = source.match(/const\s*\{[^}]*\}\s*=\s*body\b/g) ?? [];
  return destructures.some((d) => /\blineItems\b/.test(d));
}

const routes = routeFiles(ROOT)
  .map((file) => ({
    rel: path.relative(ROOT, file),
    source: stripComments(readFileSync(file, "utf8")),
  }))
  .filter((r) => readsLineItemsFromBody(r.source));

describe("invoice routes that take lineItems call validateMoneyLines", () => {
  it("finds every known line-taking route (the scan is not blind)", () => {
    expect(routes.map((r) => r.rel).sort()).toEqual(
      expect.arrayContaining([
        "[id]/route.ts",
        "[id]/variations/route.ts",
        "credit-notes/route.ts",
        "recurring/route.ts",
        "route.ts",
      ]),
    );
  });

  it.each(routes.map((r) => [r.rel, r.source]))(
    "%s calls validateMoneyLines",
    (_rel, source) => {
      expect(source).toMatch(/\bvalidateMoneyLines\(\s*request\b/);
    },
  );
});
