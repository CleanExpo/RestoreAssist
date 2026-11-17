/**
 * RA-8439 — every OAuth provider route selects its Integration row through
 * the one shared helper, so the explicit `integrationId` input and the 409
 * that names it cannot drift between routes.
 *
 * Discovers routes with readdirSync on the literal directory: a glob would
 * read "[provider]" as a character class, match nothing and pass vacuously.
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROUTE_ROOT = path.join(process.cwd(), "app/api/integrations/oauth/[provider]");

function routeFiles(): string[] {
  return readdirSync(ROUTE_ROOT, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && entry.name !== "__tests__")
    .map(entry => path.join(ROUTE_ROOT, entry.name, "route.ts"))
    .filter(file => existsSync(file));
}

describe("OAuth provider routes use the shared selection helper", () => {
  const files = routeFiles();

  it("discovers the whole route family", () => {
    expect(files.length).toBeGreaterThanOrEqual(6);
  });

  it.each(files.map(file => [path.relative(ROUTE_ROOT, file), file]))("%s selects only through select-oauth-request", (_name, file) => {
    const source = readFileSync(file, "utf8");
    expect(source).not.toMatch(/from\s+["']@\/lib\/services\/integrations\/select-oauth["']/);
    expect(source).not.toMatch(/\bselectOAuthIntegration\s*\(/);
    expect(source).toMatch(/from\s+["']@\/lib\/services\/integrations\/select-oauth-request["']/);
  });
});
