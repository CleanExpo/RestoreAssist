import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PRICING_CONFIG } from "@/lib/pricing";
import { TRIAL_INCLUDES, PAID_ADDS, KEY_BILLING_NOTE } from "../features/features-copy";

/**
 * RA-8542: the Features page said the trial includes Enhanced and Optimised
 * reports and that report generation always runs on the customer's own key.
 * lib/pricing.ts (and the server gate) say the trial is Basic only, with no
 * key needed. The Features copy must agree with the pricing config.
 */
const freeFeatures: readonly string[] = PRICING_CONFIG.free.features;
const basicLines = freeFeatures.filter((f) => /basic report/i.test(f));
const page = readFileSync(join(process.cwd(), "app/features/page.tsx"), "utf8");

describe("Features trial copy agrees with lib/pricing.ts", () => {
  it("pricing config still states the trial as Basic reports with no key", () => {
    expect(basicLines.length).toBeGreaterThanOrEqual(2);
    expect(basicLines.some((l) => /without pasting an api key/i.test(l))).toBe(
      true,
    );
  });

  it("repeats every Basic-report line from pricing in the trial list", () => {
    for (const line of basicLines) expect(TRIAL_INCLUDES).toContain(line);
  });

  it("does not put Enhanced or Optimised reports in the trial list", () => {
    expect(TRIAL_INCLUDES.join(" | ")).not.toMatch(/enhanced|optimi[sz]ed/i);
  });

  it("does not say the trial matches the paid plan on report types", () => {
    expect(TRIAL_INCLUDES.join(" | ")).not.toMatch(/same as on the paid plan/i);
  });

  it("lists Enhanced and Optimised reports as a paid addition", () => {
    expect(PAID_ADDS.join(" | ")).toMatch(/enhanced and optimi[sz]ed/i);
  });

  it("bills the provider only when the customer adds their own key", () => {
    expect(KEY_BILLING_NOTE).toMatch(/only if you add your own/i);
    expect(KEY_BILLING_NOTE).toMatch(/basic reports/i);
    expect(KEY_BILLING_NOTE).not.toMatch(/both plans/i);
  });

  it("the page renders the shared copy and carries no copy of its own", () => {
    expect(page).toContain("./features-copy");
    expect(page).toContain("KEY_BILLING_NOTE");
    expect(page).not.toMatch(/runs on your own AI provider key/);
    expect(page).not.toMatch(/Basic, Enhanced and Optimised report types/);
    expect(page).not.toMatch(/const (TRIAL_INCLUDES|PAID_ADDS)/);
  });

  it("the every-plan capability list does not promise Enhanced reports", () => {
    expect(page).not.toMatch(/cost estimation, enhanced and forensic/i);
  });
});
