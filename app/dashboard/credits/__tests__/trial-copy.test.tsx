/**
 * RA-7893 — the in-app trial line must not state a duration.
 *
 * A self-serve signup gets PRICING_CONFIG.free.trialDays (15); a Founding
 * Trial is granted for 60 days (app/api/admin/founding-trial). The credits
 * page shows the same line to both, so any fixed day count is wrong for one
 * of them. (The public pricing copy in lib/pricing.ts describes the self-serve
 * tier only and is pinned to trialDays by lib/__tests__/pricing-integrity.)
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const src = readFileSync(
  join(process.cwd(), "app/dashboard/credits/page.tsx"),
  "utf8",
);

describe("credits page trial copy (RA-7893)", () => {
  it("does not hardcode a trial length", () => {
    expect(src).not.toMatch(/\d+-day free trial/i);
  });

  it("still tells a trial user how many report credits remain", () => {
    expect(src).toMatch(/Your free trial includes \$\{data\?\.creditsRemaining \?\? 0\} report credit/);
  });
});
