/**
 * RA-8184 / L-2 — client components must not import the prisma-backed
 * paid-base-plan module. Doing so pulls `pg` into the browser bundle and
 * fails `next build` with "Can't resolve 'dns'/'fs'/'net'/'tls'/'util/types'".
 *
 * Live evidence: origin/main e7e5b439 Sketch E2E + digest-pinned image,
 * import trace OrganizationProfileSetting / PaidPlanFeatureNotice
 * → paid-base-plan → organization-credits → prisma → pg.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../../..");
const SCAN_ROOTS = ["app", "components"];

function walkTs(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "__tests__") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      walkTs(full, acc);
      continue;
    }
    if (/\.(ts|tsx)$/.test(name) && !/\.(test|spec)\.(ts|tsx)$/.test(name)) {
      acc.push(full);
    }
  }
  return acc;
}

function isClientModule(source: string): boolean {
  const body = source
    .replace(/^\uFEFF/, "")
    .replace(/^(\s*(\/\/[^\n]*\n|\/\*[\s\S]*?\*\/))*\s*/, "");
  return /^["']use client["']/.test(body);
}

const SERVER_PAID_PLAN_IMPORT =
  /from\s+["']@\/lib\/billing\/paid-base-plan["']/;
const SERVER_GRAPH_IMPORT =
  /from\s+["']@\/lib\/(prisma|organization-credits)["']|from\s+["'](?:pg|next\/server)["']/;

describe("paid-base-plan client/server split", () => {
  const files = SCAN_ROOTS.flatMap((root) => walkTs(join(ROOT, root)));

  it("finds the client billing surfaces that used to import the server module", () => {
    const clients = files
      .filter((p) => isClientModule(readFileSync(p, "utf8")))
      .map((p) => relative(ROOT, p));
    expect(clients).toEqual(
      expect.arrayContaining([
        "components/billing/PaidPlanFeatureNotice.tsx",
        "components/settings/OrganizationProfileSetting.tsx",
      ]),
    );
  });

  it("no use-client module imports the prisma-backed paid-base-plan module", () => {
    const offenders = files
      .filter((p) => {
        const src = readFileSync(p, "utf8");
        return isClientModule(src) && SERVER_PAID_PLAN_IMPORT.test(src);
      })
      .map((p) => relative(ROOT, p));
    expect(offenders).toEqual([]);
  });

  it("paid-base-plan-copy is prisma-free and holds the shared copy", () => {
    const src = readFileSync(
      join(ROOT, "lib/billing/paid-base-plan-copy.ts"),
      "utf8",
    );
    expect(src).not.toMatch(SERVER_GRAPH_IMPORT);
    expect(src).not.toMatch(/from\s+["']\.\/paid-base-plan["']/);
    expect(src).toContain("PAID_BASE_PLAN_MESSAGE");
    expect(src).toContain("PAID_BASE_PLAN_UPGRADE_HREF");
    expect(src).toContain("export function isPaidReportDepth");
  });

  it("server paid-base-plan is marked server-only and still returns 402", () => {
    const src = readFileSync(join(ROOT, "lib/billing/paid-base-plan.ts"), "utf8");
    expect(src).toMatch(/import ["']server-only["']/);
    expect(src).toContain("requirePaidBasePlan");
    expect(src).toContain("status: 402");
    expect(src).toContain("getEffectiveSubscription");
  });
});
