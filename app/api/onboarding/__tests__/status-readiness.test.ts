import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  session: vi.fn(), user: vi.fn(), userPresence: vi.fn(), legacy: vi.fn(), count: vi.fn(),
  owner: vi.fn(), subscription: vi.fn(), configured: vi.fn(), failed: vi.fn(), active: vi.fn(), pricing: vi.fn(), trial: vi.fn(),
}));
vi.mock("@/lib/auth/get-api-session", () => ({ getApiSession: mocks.session }));
vi.mock("@/lib/prisma", () => ({ prisma: {
  user: { findUnique: mocks.user, findFirst: mocks.userPresence },
  integration: { findFirst: mocks.legacy },
  report: { count: mocks.count }, inspection: { count: mocks.count }, propertyLookup: { count: mocks.count },
} }));
vi.mock("@/lib/organization-credits", () => ({ getOrganizationOwner: mocks.owner, getEffectiveSubscription: mocks.subscription }));
vi.mock("@/lib/services/integrations/ai-readiness", () => ({ hasConfiguredAi: mocks.configured }));
vi.mock("@/lib/workspace/provider-connections", () => ({ getFailedOperatingProviderConnection: mocks.failed, hasActiveOperatingProviderConnection: mocks.active }));
vi.mock("@/lib/pricing/effective-pricing", () => ({ isPricingConfigured: mocks.pricing }));
vi.mock("@/lib/ai/platform-trial-credential", () => ({ describePlatformTrialCoverage: mocks.trial }));
vi.mock("@/lib/observability", () => ({ reportError: vi.fn() }));

import { GET } from "../status/route";
const request = () => new NextRequest("http://localhost/api/onboarding/status?userId=foreign-user");

beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({ user: { id: "signed-in-member" } });
  mocks.user.mockResolvedValue({ role: "MANAGER", businessName: "Synthetic", businessAddress: "Fixture", subscriptionStatus: "ACTIVE" });
  mocks.owner.mockResolvedValue("org-owner");
  mocks.subscription.mockResolvedValue({ subscriptionStatus: "ACTIVE" });
  mocks.legacy.mockResolvedValue(null);
  mocks.userPresence.mockResolvedValue(null);
  mocks.count.mockResolvedValue(0);
  mocks.configured.mockResolvedValue(false);
  mocks.failed.mockResolvedValue(null);
  mocks.active.mockResolvedValue(false);
  mocks.trial.mockResolvedValue({ canUsePlatformTrial: false, fundedTrial: false });
});

describe("onboarding AI readiness", () => {
  it("passes explicit disconnect state to the trial display", async () => {
    mocks.trial.mockResolvedValue({ fundedTrial: true, platformKeyPresent: true, canUsePlatformTrial: false, platformProviderStatus: "DISABLED" });
    const body = await (await GET(request())).json();
    expect(body.steps.ai_provider.completed).toBe(false);
    expect(body.steps.ai_provider.description).toMatch(/disabled/i);
  });
  it("recognises canonical configuration without selecting a legacy credential", async () => {
    mocks.configured.mockResolvedValue(true);
    const response = await GET(request());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.steps.ai_provider.completed).toBe(true);
    expect(mocks.configured).toHaveBeenCalledWith("signed-in-member");
    expect(mocks.legacy).not.toHaveBeenCalled();
    for (const [query] of mocks.user.mock.calls) expect(query.select).not.toHaveProperty("deepseekApiKey");
  });

  it("a rejected canonical key is not hidden by stale legacy configuration", async () => {
    mocks.legacy.mockResolvedValue({ apiKey: "synthetic-stale-key" });
    mocks.failed.mockResolvedValue({ provider: "ANTHROPIC", rejectedAt: new Date("2026-10-01T00:00:00Z") });
    const body = await (await GET(request())).json();
    expect(body.steps.ai_provider.completed).toBe(false);
    expect(body.steps.ai_provider.rejectedKey.provider).toBe("ANTHROPIC");
    expect(mocks.failed).toHaveBeenCalledWith("org-owner");
  });

  it("retains legacy DeepSeek presence without retrieving its key", async () => {
    mocks.userPresence.mockResolvedValue({ id: "org-owner" });
    const body = await (await GET(request())).json();
    expect(body.steps.ai_provider.completed).toBe(true);
    expect(mocks.userPresence).toHaveBeenCalledWith({
      where: { id: "org-owner", deepseekApiKey: { not: null }, NOT: { deepseekApiKey: "" } },
      select: { id: true },
    });
  });

  it("requires a session before readiness access", async () => {
    mocks.session.mockResolvedValue(null);
    expect((await GET(request())).status).toBe(401);
    expect(mocks.configured).not.toHaveBeenCalled();
    expect(mocks.user).not.toHaveBeenCalled();
  });
});
