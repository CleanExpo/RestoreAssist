import { beforeEach, describe, expect, it, vi } from "vitest";

const { findFirst, syncXero } = vi.hoisted(() => ({
  findFirst: vi.fn(),
  syncXero: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    integration: { findFirst, findMany: vi.fn() },
  },
}));
vi.mock("../xero/nir-sync", () => ({ syncNIRJobToXero: syncXero }));
vi.mock("../quickbooks/nir-sync", () => ({ syncNIRJobToQuickBooks: vi.fn() }));
vi.mock("../myob/nir-sync", () => ({ syncNIRJobToMYOB: vi.fn() }));
vi.mock("../servicem8/nir-sync", () => ({ syncNIRJobToServiceM8: vi.fn() }));
vi.mock("../ascora/nir-sync", () => ({ syncNIRJobToAscora: vi.fn() }));
vi.mock("@/lib/iicrc-inclusion-check", () => ({
  runInclusionCheck: () => ({ missing: [], claimType: "water" }),
}));

import { syncNIRToSpecificIntegration } from "../nir-sync-orchestrator";

const payload = {
  reportId: "report-1",
  country: "AU" as const,
  currency: "AUD" as const,
  clientName: "Client",
  propertyAddress: "1 Test Street",
  reportNumber: "NIR-1",
  damageType: "WATER" as const,
  scopeItems: [],
  totalExGST: 0,
  gstAmount: 0,
  totalIncGST: 0,
  inspectionDate: new Date("2026-01-01"),
  reportDate: new Date("2026-01-01"),
};

describe("NIR specific integration tenant boundary", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does not dispatch through an integration owned by another tenant", async () => {
    findFirst.mockResolvedValue(null);

    const result = await syncNIRToSpecificIntegration(
      "owner-user",
      "other-tenant-integration",
      payload,
    );

    expect(findFirst).toHaveBeenCalledWith({
      where: { id: "other-tenant-integration", userId: "owner-user" },
      select: { id: true, provider: true, status: true },
    });
    expect(syncXero).not.toHaveBeenCalled();
    expect(result.status).toBe("error");
  });
});
