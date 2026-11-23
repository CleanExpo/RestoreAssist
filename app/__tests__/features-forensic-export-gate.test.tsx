/**
 * RA-8546 item 3 — the features page "Getting the work out the door" section
 * lists forensic reports among the A4 PDFs, and the free-trial column says the
 * trial gets "every ... export capability above". Verified 2026-11-22 against
 * the server: the forensic PDF route is held by the current-plan gate
 * (hasActiveSubscription: ACTIVE, or a TRIAL whose end date has not passed),
 * not by the paid $99 base-plan gate in lib/billing/paid-base-plan.ts. So the
 * copy is true today.
 *
 * This test pins the copy to the gate. If the forensic PDF route is ever put
 * behind the paid base plan, the page must stop listing forensic reports as an
 * export on every plan, and this test fails until it does.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const PAGE = join(ROOT, "app/features/page.tsx");
const FORENSIC_ROUTE = join(
  ROOT,
  "app/api/reports/[id]/generate-forensic-pdf/route.ts",
);
const SUBSCRIPTION_GATE = join(ROOT, "lib/billing/subscription-gate.ts");

const PAID_GATE = /\b(?:requirePaidBasePlan|hasPaidBasePlan)\b|billing\/paid-base-plan/;

function exportPdfDetail(source: string): string {
  const match = source.match(
    /label:\s*"A4 PDFs across the document set",\s*detail:\s*"([^"]*)"/,
  );
  if (!match) throw new Error("A4 PDFs export item not found on the features page");
  return match[1];
}

function forensicListedAsExport(pageSource: string): boolean {
  return /\bforensic\b/i.test(exportPdfDetail(pageSource));
}

/**
 * The copy is accurate when either the page does not list forensic reports
 * as an export, or the forensic route is not behind the paid base plan.
 */
function copyMatchesGate(pageSource: string, routeSource: string): boolean {
  return !forensicListedAsExport(pageSource) || !PAID_GATE.test(routeSource);
}

describe("RA-8546 forensic report export copy matches the server gate", () => {
  const page = readFileSync(PAGE, "utf8");
  const route = readFileSync(FORENSIC_ROUTE, "utf8");

  it("reads the real export item (non-empty)", () => {
    expect(exportPdfDetail(page).length).toBeGreaterThan(0);
  });

  it("the forensic PDF route is held by the current-plan gate", () => {
    expect(route).toMatch(
      /import\s*\{[^}]*\bhasActiveSubscription\b[^}]*\}\s*from\s*"@\/lib\/billing\/subscription-gate"/,
    );
    expect(route).toMatch(/if\s*\(\s*!\s*\(await hasActiveSubscription\(/);
  });

  it("the current-plan gate admits a current TRIAL as well as ACTIVE", () => {
    const gate = readFileSync(SUBSCRIPTION_GATE, "utf8");
    expect(gate).toMatch(
      /ALLOWED_SUBSCRIPTION_STATUSES\s*=\s*\[\s*"TRIAL",\s*"ACTIVE"\s*\]/,
    );
  });

  it("the page lists forensic reports only while the route is not paid-gated", () => {
    expect(copyMatchesGate(page, route)).toBe(true);
  });

  it("would fail if the route moved behind the paid base plan (control)", () => {
    const gatedRoute = `${route}\nimport { requirePaidBasePlan } from "@/lib/billing/paid-base-plan";\n`;
    expect(forensicListedAsExport(page)).toBe(true);
    expect(copyMatchesGate(page, gatedRoute)).toBe(false);
    const pageWithoutForensic = page.replace(
      /enhanced and forensic reports/,
      "enhanced reports",
    );
    expect(copyMatchesGate(pageWithoutForensic, gatedRoute)).toBe(true);
  });
});
