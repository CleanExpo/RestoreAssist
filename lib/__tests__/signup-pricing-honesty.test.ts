/**
 * RA-7549 — signup / pricing honesty.
 *
 * A stranger must see that Basic works without pasting an API key, and
 * when provider charges apply. The post-signup CTA must name that path
 * and land on `/dashboard/reports/new`.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BASIC_REPORT_CTA_LABEL,
  BASIC_REPORT_PATH,
  BASIC_WITHOUT_KEY_BODY,
  BASIC_WITHOUT_KEY_HEADLINE,
} from "@/lib/signup-pricing-honesty";

const repoRoot = join(__dirname, "..", "..");
const readSrc = (rel: string) => readFileSync(join(repoRoot, rel), "utf8");

const DISHONEST = [
  /API key is required to operate/i,
  /You will need an Anthropic or OpenAI API key to generate/i,
  /Without a key configured, report generation will be unavailable/i,
  /Report generation on every plan[^.]*runs on your own/i,
  /Bring your own AI key/i,
];

describe("RA-7549 signup/pricing honesty SSOT", () => {
  it("names the Basic-without-key claim and the working report path", () => {
    expect(BASIC_WITHOUT_KEY_HEADLINE).toMatch(/without an API key/i);
    expect(BASIC_WITHOUT_KEY_BODY).toMatch(/without pasting/i);
    expect(BASIC_WITHOUT_KEY_BODY).toMatch(/Provider charges apply only when/i);
    expect(BASIC_REPORT_CTA_LABEL).toBe("Create Basic report without API key");
    expect(BASIC_REPORT_PATH).toBe("/dashboard/reports/new");
  });

  it("signup and pricing pages source the claim from the SSOT", () => {
    const signup = readSrc("app/signup/page.tsx");
    expect(signup).toContain("SIGNUP_KEY_NOTE_TITLE");
    expect(signup).toContain("SIGNUP_KEY_NOTE_BODY");
    expect(signup).toContain("@/lib/signup-pricing-honesty");

    const pricing = readSrc("app/pricing/page.tsx");
    expect(pricing).toContain("PRICING_KEY_ALERT_TITLE");
    expect(pricing).toContain("PRICING_KEY_ALERT_BODY");
    expect(pricing).toContain("@/lib/signup-pricing-honesty");
  });

  it("signup, pricing, and post-signup surfaces drop the BYOK-required lie", () => {
    for (const rel of [
      "app/signup/page.tsx",
      "app/pricing/page.tsx",
      "components/pricing/CostDisclosure.tsx",
      "lib/email.ts",
      "app/dashboard/onboarding/OnboardingClient.tsx",
      "app/dashboard/page.tsx",
    ]) {
      const src = readSrc(rel);
      for (const pattern of DISHONEST) {
        expect(src, `${rel} must not match ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  it("post-signup CTA component links the labelled action to the Basic path", () => {
    const src = readSrc("components/onboarding/BasicReportWithoutKeyCta.tsx");
    expect(src).toContain("BASIC_REPORT_CTA_LABEL");
    expect(src).toContain("BASIC_REPORT_PATH");
    expect(src).toContain("href={BASIC_REPORT_PATH}");
  });
});
