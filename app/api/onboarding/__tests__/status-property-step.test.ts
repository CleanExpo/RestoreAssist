// RA-8459: the optional "Property lookup" step counted PropertyLookup rows,
// a table no code writes since the stub lookup was removed (RA-7581), so it
// could never be ticked. Until a real lookup exists and writes something the
// step can count, the status API must not return the step at all.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  user: vi.fn(),
  userPresence: vi.fn(),
  reportCount: vi.fn(),
  inspectionCount: vi.fn(),
  propertyLookupCount: vi.fn(),
  owner: vi.fn(),
  subscription: vi.fn(),
  configured: vi.fn(),
  failed: vi.fn(),
  pricing: vi.fn(),
  trial: vi.fn(),
}));
vi.mock("@/lib/auth/get-api-session", () => ({ getApiSession: mocks.session }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: mocks.user, findFirst: mocks.userPresence },
    report: { count: mocks.reportCount },
    inspection: { count: mocks.inspectionCount },
    // Kept so a returning read is caught by the assertion below, not by a crash.
    propertyLookup: { count: mocks.propertyLookupCount },
  },
}));
vi.mock("@/lib/organization-credits", () => ({
  getOrganizationOwner: mocks.owner,
  getEffectiveSubscription: mocks.subscription,
}));
vi.mock("@/lib/services/integrations/ai-readiness", () => ({ hasConfiguredAi: mocks.configured }));
vi.mock("@/lib/workspace/provider-connections", () => ({
  getFailedOperatingProviderConnection: mocks.failed,
}));
vi.mock("@/lib/pricing/effective-pricing", () => ({ isPricingConfigured: mocks.pricing }));
vi.mock("@/lib/ai/platform-trial-credential", () => ({ describePlatformTrialCoverage: mocks.trial }));
vi.mock("@/lib/observability", () => ({ reportError: vi.fn() }));

import { GET } from "../status/route";

const request = () => new NextRequest("http://localhost/api/onboarding/status");

beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({ user: { id: "admin-user" } });
  mocks.user.mockResolvedValue({
    role: "ADMIN",
    businessName: "Synthetic Restorations",
    businessAddress: "1 Fixture Street",
    subscriptionStatus: "ACTIVE",
  });
  mocks.owner.mockResolvedValue(null);
  mocks.subscription.mockResolvedValue({ subscriptionStatus: "ACTIVE" });
  mocks.userPresence.mockResolvedValue(null);
  mocks.reportCount.mockResolvedValue(0);
  mocks.inspectionCount.mockResolvedValue(0);
  // A legacy row from before RA-7581 must not resurrect the step.
  mocks.propertyLookupCount.mockResolvedValue(3);
  mocks.configured.mockResolvedValue(true);
  mocks.failed.mockResolvedValue(null);
  mocks.pricing.mockResolvedValue(true);
  mocks.trial.mockResolvedValue({ canUsePlatformTrial: false, fundedTrial: false });
});

describe("onboarding status: property lookup step (RA-8459)", () => {
  it("does not return a property_data step or read the writerless PropertyLookup table", async () => {
    const res = await GET(request());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body.steps)).not.toContain("property_data");
    expect(mocks.propertyLookupCount).not.toHaveBeenCalled();
    for (const step of Object.values(body.steps) as Array<{ route: string; title: string }>) {
      expect(step.route).not.toBe("/dashboard/integrations");
      expect(step.title).not.toMatch(/property lookup/i);
    }
  });

  it("keeps isComplete and incompleteSteps unchanged for a fully set-up admin", async () => {
    const body = await (await GET(request())).json();
    expect(body.isComplete).toBe(true);
    expect(body.incompleteSteps).toEqual([]);
    expect(body.nextStep).toBeNull();
  });

  it("keeps isComplete and incompleteSteps unchanged for an admin missing required setup", async () => {
    mocks.user.mockResolvedValue({ role: "ADMIN", subscriptionStatus: "ACTIVE" });
    mocks.pricing.mockResolvedValue(false);
    const body = await (await GET(request())).json();
    expect(body.isComplete).toBe(false);
    expect(body.incompleteSteps).toEqual(["business_profile", "pricing_config"]);
    expect(body.nextStep).toBe("business_profile");
  });
});
