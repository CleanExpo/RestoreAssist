import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getEffectiveSubscription = vi.fn();
const hasActiveOperatingProviderConnection = vi.fn();

vi.mock("@/lib/organization-credits", () => ({
  getEffectiveSubscription: (...args: unknown[]) =>
    getEffectiveSubscription(...args),
}));

vi.mock("@/lib/workspace/provider-connections", () => ({
  hasActiveOperatingProviderConnection: (...args: unknown[]) =>
    hasActiveOperatingProviderConnection(...args),
}));

import {
  canUsePlatformTrialCredential,
  hasReportGenerationCredential,
  isPlatformTrialEligible,
  tryPlatformTrialApiKey,
} from "../platform-trial-credential";

const future = new Date("2026-12-01T00:00:00.000Z");
const past = new Date("2026-01-01T00:00:00.000Z");
const now = new Date("2026-09-13T00:00:00.000Z");

describe("isPlatformTrialEligible (RA-6801)", () => {
  it("passes for an in-date TRIAL with remaining credits and a platform key", () => {
    expect(
      isPlatformTrialEligible({
        subscriptionStatus: "TRIAL",
        creditsRemaining: 50,
        trialEndsAt: future,
        platformKeyPresent: true,
        now,
      }),
    ).toBe(true);
  });

  it("fails when the platform key is missing — cannot silently invent a credential", () => {
    expect(
      isPlatformTrialEligible({
        subscriptionStatus: "TRIAL",
        creditsRemaining: 50,
        trialEndsAt: future,
        platformKeyPresent: false,
        now,
      }),
    ).toBe(false);
  });

  it("fails for ACTIVE even when leftover credits and a platform key exist", () => {
    expect(
      isPlatformTrialEligible({
        subscriptionStatus: "ACTIVE",
        creditsRemaining: 12,
        trialEndsAt: future,
        platformKeyPresent: true,
        now,
      }),
    ).toBe(false);
  });

  it("fails for CANCELED / PAST_DUE — those must not burn the platform key", () => {
    for (const subscriptionStatus of ["CANCELED", "PAST_DUE", "INACTIVE"]) {
      expect(
        isPlatformTrialEligible({
          subscriptionStatus,
          creditsRemaining: 50,
          trialEndsAt: future,
          platformKeyPresent: true,
          now,
        }),
      ).toBe(false);
    }
  });

  it("fails when trial credits are exhausted", () => {
    expect(
      isPlatformTrialEligible({
        subscriptionStatus: "TRIAL",
        creditsRemaining: 0,
        trialEndsAt: future,
        platformKeyPresent: true,
        now,
      }),
    ).toBe(false);
  });

  it("fails when the trial has expired", () => {
    expect(
      isPlatformTrialEligible({
        subscriptionStatus: "TRIAL",
        creditsRemaining: 50,
        trialEndsAt: past,
        platformKeyPresent: true,
        now,
      }),
    ).toBe(false);
  });

  it("treats a missing trialEndsAt as still in-date (matches getTrialStatus)", () => {
    expect(
      isPlatformTrialEligible({
        subscriptionStatus: "TRIAL",
        creditsRemaining: 1,
        trialEndsAt: null,
        platformKeyPresent: true,
        now,
      }),
    ).toBe(true);
  });
});

describe("canUsePlatformTrialCredential / hasReportGenerationCredential", () => {
  const originalKey = process.env.ANTHROPIC_API_KEY;

  beforeEach(() => {
    getEffectiveSubscription.mockReset();
    hasActiveOperatingProviderConnection.mockReset();
    process.env.ANTHROPIC_API_KEY = "sk-ant-platform-test";
  });

  afterEach(() => {
    if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = originalKey;
  });

  it("trial without BYOK and with credits may use the platform credential", async () => {
    getEffectiveSubscription.mockResolvedValue({
      subscriptionStatus: "TRIAL",
      creditsRemaining: 50,
      trialEndsAt: future,
    });
    hasActiveOperatingProviderConnection.mockResolvedValue(false);

    expect(await canUsePlatformTrialCredential("trial-user")).toBe(true);
    expect(await hasReportGenerationCredential("trial-user")).toBe(true);
    expect(await tryPlatformTrialApiKey("trial-user", "ANTHROPIC")).toBe(
      "sk-ant-platform-test",
    );
  });

  it("does not hand the platform Anthropic key to an OPENAI resolve", async () => {
    getEffectiveSubscription.mockResolvedValue({
      subscriptionStatus: "TRIAL",
      creditsRemaining: 50,
      trialEndsAt: future,
    });

    expect(await tryPlatformTrialApiKey("trial-user", "OPENAI")).toBeNull();
  });

  it("non-trial without BYOK cannot silently burn the platform key", async () => {
    getEffectiveSubscription.mockResolvedValue({
      subscriptionStatus: "ACTIVE",
      creditsRemaining: 0,
      trialEndsAt: null,
    });
    hasActiveOperatingProviderConnection.mockResolvedValue(false);

    expect(await canUsePlatformTrialCredential("paid-user")).toBe(false);
    expect(await hasReportGenerationCredential("paid-user")).toBe(false);
    expect(await tryPlatformTrialApiKey("paid-user", "ANTHROPIC")).toBeNull();
  });

  it("BYOK still wins for a paid workspace", async () => {
    getEffectiveSubscription.mockResolvedValue({
      subscriptionStatus: "ACTIVE",
      creditsRemaining: 0,
      trialEndsAt: null,
    });
    hasActiveOperatingProviderConnection.mockResolvedValue(true);

    expect(await hasReportGenerationCredential("paid-byok")).toBe(true);
  });
});
