import { describe, it, expect } from "vitest";
import { TRIAL_DAYS } from "@/lib/billing/constants";

describe("trial duration centralisation", () => {
  it("auth.ts uses TRIAL_DAYS for new signup trialEndsAt", async () => {
    const fs = await import("fs/promises");
    const src = await fs.readFile("lib/auth.ts", "utf-8");
    expect(src).toContain("TRIAL_DAYS");
    expect(src).not.toMatch(/30\s*\*\s*24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/);
  });

  it("setup/activate route uses TRIAL_DAYS in welcome email", async () => {
    const fs = await import("fs/promises");
    const src = await fs.readFile("app/api/setup/activate/route.ts", "utf-8");
    expect(src).toContain("TRIAL_DAYS");
    expect(src).not.toMatch(/trialDays:\s*14/);
    expect(src).not.toMatch(/trialDays:\s*30/);
  });

  it("trial-handling.ts null-fallback uses TRIAL_DAYS", async () => {
    const fs = await import("fs/promises");
    const src = await fs.readFile("lib/trial-handling.ts", "utf-8");
    expect(src).toContain("TRIAL_DAYS");
    expect(src).not.toMatch(/daysRemaining:\s*30/);
  });
});
