import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  REPORT_CREATION_CREDITS_ROUTE,
  TRIAL_EXPIRED_PAY_REASON,
  TRIAL_EXPIRED_PAY_ROUTE,
  TRIAL_EXPIRED_REFUSAL_CODE,
  isExpiredTrialWindow,
  isTrialExpiredPayRoute,
  resolveReportCreationPayRoute,
  shouldLockDashboardForSubscription,
  trialExpiredRefusal,
} from "../trial-expired-pay-route";

const repoRoot = join(__dirname, "..", "..", "..");
const readSrc = (rel: string) => readFileSync(join(repoRoot, rel), "utf8");

describe("trial-expired pay-route helper (RA-7462)", () => {
  it("is the single producer of reason=trial-expired", () => {
    expect(TRIAL_EXPIRED_PAY_ROUTE).toBe(
      "/billing/upgrade?reason=trial-expired",
    );
    expect(TRIAL_EXPIRED_PAY_REASON).toBe("trial-expired");
    expect(trialExpiredRefusal().payRoute).toBe(TRIAL_EXPIRED_PAY_ROUTE);
    expect(trialExpiredRefusal().code).toBe(TRIAL_EXPIRED_REFUSAL_CODE);
  });

  it("treats EXPIRED and a TRIAL past trialEndsAt as the same ended trial", () => {
    const yesterday = new Date(Date.now() - 86_400_000);
    const tomorrow = new Date(Date.now() + 86_400_000);

    expect(isExpiredTrialWindow("EXPIRED", tomorrow)).toBe(true);
    expect(isExpiredTrialWindow("TRIAL", yesterday)).toBe(true);
    expect(isExpiredTrialWindow("TRIAL", tomorrow)).toBe(false);
    expect(isExpiredTrialWindow("TRIAL", null)).toBe(false);
    expect(isExpiredTrialWindow("ACTIVE", yesterday)).toBe(false);
    expect(isExpiredTrialWindow("CANCELED", yesterday)).toBe(false);
  });

  it("keeps the dashboard open for an expired trial and after the EXPIRED flip", () => {
    const yesterday = new Date(Date.now() - 86_400_000).toISOString();

    expect(
      shouldLockDashboardForSubscription({
        subscriptionStatus: "TRIAL",
        trialEndsAt: yesterday,
      }),
    ).toBe(false);
    expect(
      shouldLockDashboardForSubscription({
        subscriptionStatus: "EXPIRED",
        trialEndsAt: yesterday,
      }),
    ).toBe(false);
  });

  it("does not lock an active trial or a paying account", () => {
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString();
    const yesterday = new Date(Date.now() - 86_400_000).toISOString();

    expect(
      shouldLockDashboardForSubscription({
        subscriptionStatus: "TRIAL",
        trialEndsAt: tomorrow,
      }),
    ).toBe(false);
    expect(
      shouldLockDashboardForSubscription({
        subscriptionStatus: "ACTIVE",
        trialEndsAt: yesterday,
      }),
    ).toBe(false);
    expect(
      shouldLockDashboardForSubscription({
        subscriptionStatus: "CANCELED",
        lifetimeAccess: true,
      }),
    ).toBe(false);
    expect(
      shouldLockDashboardForSubscription({
        subscriptionStatus: undefined,
      }),
    ).toBe(false);
  });

  it("still locks cancelled and past-due paid accounts", () => {
    expect(
      shouldLockDashboardForSubscription({ subscriptionStatus: "CANCELED" }),
    ).toBe(true);
    expect(
      shouldLockDashboardForSubscription({ subscriptionStatus: "PAST_DUE" }),
    ).toBe(true);
  });

  it("routes a trial-expired refusal to the subscribe page, not pricing", () => {
    expect(resolveReportCreationPayRoute(trialExpiredRefusal())).toBe(
      TRIAL_EXPIRED_PAY_ROUTE,
    );
    expect(
      resolveReportCreationPayRoute({ code: TRIAL_EXPIRED_REFUSAL_CODE }),
    ).toBe(TRIAL_EXPIRED_PAY_ROUTE);
    expect(resolveReportCreationPayRoute({})).toBe(
      REPORT_CREATION_CREDITS_ROUTE,
    );
    expect(isTrialExpiredPayRoute(TRIAL_EXPIRED_PAY_ROUTE)).toBe(true);
    expect(isTrialExpiredPayRoute(REPORT_CREATION_CREDITS_ROUTE)).toBe(false);
  });

  it("wires the helper into the banner, sidebar, new-report page, and report-limit gate", () => {
    expect(readSrc("components/billing/TrialCountdownBanner.tsx")).toContain(
      "TRIAL_EXPIRED_PAY_ROUTE",
    );
    expect(readSrc("app/dashboard/DashboardShell.tsx")).toContain(
      "resolveReportCreationPayRoute",
    );
    expect(readSrc("app/dashboard/reports/new/page.tsx")).toContain(
      "resolveReportCreationPayRoute",
    );
    expect(readSrc("lib/report-limits.ts")).toContain("trialExpiredRefusal");
    expect(readSrc("proxy.ts")).toContain("shouldLockDashboardForSubscription");
  });
});
