import {
  describe,
  expect,
  it,
  vi,
  beforeAll,
  afterAll,
  beforeEach,
} from "vitest";
import { runAllChecks, CHECKS, type CheckResult } from "../checks";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/ai/model-router", () => ({
  routeBasic: vi.fn(),
}));
import { routeBasic } from "@/lib/ai/model-router";

describe("runAllChecks", () => {
  let testOrgId = "";
  let testUserId = "";

  beforeAll(async () => {
    // Create a test user + org
    const user = await prisma.user.create({
      data: { email: `checks-${Date.now()}@test.com` },
    });
    testUserId = user.id;
    const org = await prisma.organization.create({
      data: { name: "Test Org", ownerId: user.id },
    });
    testOrgId = org.id;
    await prisma.user.update({
      where: { id: user.id },
      data: { organizationId: org.id },
    });
  });

  afterAll(async () => {
    // Cleanup
    await prisma.organizationPricingConfig.deleteMany({
      where: { organizationId: testOrgId },
    });
    await prisma.organization
      .delete({ where: { id: testOrgId } })
      .catch(() => {});
    await prisma.user.delete({ where: { id: testUserId } }).catch(() => {});
    await prisma.$disconnect();
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    // Default: AI generation returns success
    (routeBasic as any).mockResolvedValue({ text: "ok", confidence: 1 });
  });

  it("returns one result per registered check (10 total)", async () => {
    const results = await runAllChecks(testOrgId);
    expect(results).toHaveLength(CHECKS.length);
    expect(results).toHaveLength(10);
    for (const r of results) {
      expect(["green", "yellow", "red"]).toContain(r.status);
      expect(typeof r.capability).toBe("string");
      expect(typeof r.label).toBe("string");
    }
  });

  it("returns red for business_profile when required fields are missing", async () => {
    // The test org has no legalName / abn / state set
    const results = await runAllChecks(testOrgId);
    const bp = results.find((r) => r.capability === "business_profile");
    expect(bp?.status).toBe("red");
  });

  it("returns green for business_profile when required fields are populated", async () => {
    await prisma.organization.update({
      where: { id: testOrgId },
      data: { legalName: "Test Co", state: "NSW", abn: "53004085616" },
    });
    const results = await runAllChecks(testOrgId);
    const bp = results.find((r) => r.capability === "business_profile");
    expect(bp?.status).toBe("green");
  });

  it("returns red for ai_generation when routeBasic throws", async () => {
    (routeBasic as any).mockRejectedValueOnce(new Error("gemma down"));
    const results = await runAllChecks(testOrgId);
    const ai = results.find((r) => r.capability === "ai_generation");
    expect(ai?.status).toBe("red");
  });

  it("returns yellow for cloud_storage by default (stub — not connected)", async () => {
    const results = await runAllChecks(testOrgId);
    const cs = results.find((r) => r.capability === "cloud_storage");
    expect(cs?.status).toBe("yellow");
  });

  it("does not throw when org does not exist (returns red for org-dependent checks)", async () => {
    const results = await runAllChecks("non-existent-org-id");
    expect(results).toHaveLength(10);
    const bp = results.find((r) => r.capability === "business_profile");
    expect(bp?.status).toBe("red");
  });
});
