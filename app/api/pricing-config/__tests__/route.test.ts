import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  user: vi.fn(),
  organisation: vi.fn(),
  company: vi.fn(),
  integration: vi.fn(),
  aiConfigured: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: mocks.session }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/observability", () => ({ reportError: vi.fn() }));
vi.mock("@/lib/services/integrations/ai-readiness", () => ({
  hasConfiguredAi: mocks.aiConfigured,
}));
// The real route and pricing resolver run. All database access is mocked.
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: mocks.user },
    organizationPricingConfig: { findUnique: mocks.organisation },
    companyPricingConfig: { findUnique: mocks.company },
    integration: { findFirst: mocks.integration },
  },
}));

import { GET } from "../route";

const legacy = { id: "legacy", masterQualifiedNormalHours: 999, customFields: null };
const canonical = {
  id: "canonical",
  organizationId: "org-ours",
  masterQualifiedNormalHours: 180,
  customFields: JSON.stringify({ fees: [{ name: "Site access", value: 75 }] }),
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({ user: { id: "signed-in-user", role: "ADMIN" } });
  mocks.user.mockResolvedValue({
    id: "signed-in-user",
    organizationId: "org-ours",
    role: "ADMIN",
    pricingConfig: legacy,
  });
  mocks.organisation.mockResolvedValue(canonical);
  mocks.company.mockResolvedValue(legacy);
  mocks.integration.mockResolvedValue(null);
  mocks.aiConfigured.mockResolvedValue(false);
});

const get = () => GET(new NextRequest(
  "http://localhost/api/pricing-config?organizationId=org-other&userId=someone-else",
));

describe("GET /api/pricing-config canonical rate card", () => {
  it("recognises canonical AI configuration without a legacy Integration row", async () => {
    mocks.aiConfigured.mockResolvedValue(true);
    const body = await (await get()).json();
    expect(body.hasApiKey).toBe(true);
    expect(mocks.aiConfigured).toHaveBeenCalledWith("signed-in-user");
    expect(mocks.integration).not.toHaveBeenCalled();
  });

  it("does not reactivate a legacy record when canonical readiness is false", async () => {
    mocks.integration.mockResolvedValue({ id: "stale-legacy-key" });
    expect((await (await get()).json()).hasApiKey).toBe(false);
  });

  it("shows the organisation card rather than a stale per-user card", async () => {
    const response = await get();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.pricingConfig.id).toBe("canonical");
    expect(body.pricingConfig.masterQualifiedNormalHours).toBe(180);
    expect(body.pricingConfig.customFields).toEqual({ fees: [{ name: "Site access", value: 75 }] });
    expect(mocks.company).not.toHaveBeenCalled();
  });

  it("shows setup's organisation rates even without a legacy card", async () => {
    mocks.user.mockResolvedValue({ id: "signed-in-user", organizationId: "org-ours", role: "ADMIN", pricingConfig: null });
    mocks.company.mockResolvedValue(null);
    const body = await (await get()).json();
    expect(body.pricingConfig?.id).toBe("canonical");
    expect(body.defaults).toBeUndefined();
  });

  it("derives the tenant from the authenticated user, ignoring supplied IDs", async () => {
    await get();
    expect(mocks.organisation).toHaveBeenCalledWith({ where: { organizationId: "org-ours" } });
    for (const [query] of mocks.user.mock.calls) {
      expect(query.where).toEqual({ id: "signed-in-user" });
    }
  });

  it("preserves the resolver's legacy fallback when the organisation has no card", async () => {
    mocks.organisation.mockResolvedValue(null);
    const body = await (await get()).json();
    expect(body.pricingConfig).toEqual(legacy);
  });

  it("preserves the existing default response when neither store has a card", async () => {
    mocks.user.mockResolvedValue({ id: "signed-in-user", organizationId: null, role: "ADMIN", pricingConfig: null });
    mocks.company.mockResolvedValue(null);
    const body = await (await get()).json();
    expect(body.pricingConfig).toBeNull();
    expect(body.defaults).toBeDefined();
    expect(mocks.organisation).not.toHaveBeenCalled();
  });

  it("requires authentication before reading any rate card", async () => {
    mocks.session.mockResolvedValue(null);
    expect((await get()).status).toBe(401);
    expect(mocks.user).not.toHaveBeenCalled();
    expect(mocks.organisation).not.toHaveBeenCalled();
    expect(mocks.company).not.toHaveBeenCalled();
  });

  it("refuses a card for a session user that no longer exists in the DB", async () => {
    // RA-paid-client tranche 1: the role check re-queries the DB on
    // every request. A user that the JWT still names but who has been
    // removed from the DB is rejected at the gate — the route never
    // reaches the pricing read.
    mocks.user.mockResolvedValue(null);
    const res = await get();
    expect(res.status).toBe(403);
    expect(mocks.organisation).not.toHaveBeenCalled();
    expect(mocks.company).not.toHaveBeenCalled();
  });
});
