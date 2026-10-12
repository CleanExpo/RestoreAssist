import { beforeEach, describe, expect, it, vi } from "vitest";

const { findFirst, findMany, reportFindFirst, syncXero } = vi.hoisted(() => ({
  findFirst: vi.fn(),
  findMany: vi.fn(),
  reportFindFirst: vi.fn(),
  syncXero: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    integration: { findFirst, findMany },
    report: { findFirst: reportFindFirst },
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

import { syncNIRToSpecificIntegration, syncNIRToAllConnectedIntegrations } from "../nir-sync-orchestrator";

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
  beforeEach(() => {
    vi.clearAllMocks();
    reportFindFirst.mockResolvedValue({ id: "report-1", userId: "owner-user", workspaceId: "workspace-a" });
  });

  it("does not dispatch through an integration owned by another tenant", async () => {
    findFirst.mockResolvedValue(null);

    const result = await syncNIRToSpecificIntegration(
      "owner-user",
      "other-tenant-integration",
      payload,
    );

    expect(findFirst).toHaveBeenCalledWith({
      where: { id: "other-tenant-integration", userId: "owner-user", workspaceId: "workspace-a" },
      select: expect.objectContaining({ id: true, provider: true, status: true, name: true, icon: true, config: true }),
    });
    expect(syncXero).not.toHaveBeenCalled();
    expect(result.status).toBe("error");
  });

  it.each([
    { provider: "XERO", name: "OpenAI GPT", icon: "[ra:ai]" },
    { provider: "XERO", name: "Private assistant", config: { apiKeyType: "ANTHROPIC" } },
    { provider: "QUICKBOOKS", name: "QuickBooks" },
    { provider: "ASCORA", name: "Ascora" },
  ])("does not dispatch an explicit Xero request through $name", async identity => {
    findFirst.mockResolvedValue({ id: "synthetic-id", status: "CONNECTED", ...identity });
    const result = await syncNIRToSpecificIntegration("owner-user", "synthetic-id", payload, "XERO");
    expect(result.status).toBe("skipped"); expect(syncXero).not.toHaveBeenCalled();
  });

  it("dispatches a genuine owner-scoped custom Xero connection", async () => {
    findFirst.mockResolvedValue({ id: "synthetic-id", provider: "XERO", name: "Company books", tenantId: "synthetic-org", status: "CONNECTED" });
    syncXero.mockResolvedValue({ xeroInvoiceId: "synthetic-invoice", xeroInvoiceNumber: "SYN-1" });
    await expect(syncNIRToSpecificIntegration("owner-user", "synthetic-id", payload, "XERO")).resolves.toMatchObject({ status: "success" });
    expect(syncXero).toHaveBeenCalledWith("synthetic-id", payload);
  });

  it.each(["workspace-a", null])("fan-out stays inside the source report workspace %s including exact null", async workspaceId => {
    reportFindFirst.mockResolvedValue({ id: "report-1", userId: "owner-user", workspaceId });
    const records = [
      { id: "allowed", userId: "owner-user", workspaceId, provider: "XERO", name: "Xero", status: "CONNECTED" },
      { id: "foreign", userId: "owner-user", workspaceId: "workspace-b", provider: "XERO", name: "Xero", status: "CONNECTED" },
    ];
    findMany.mockImplementation(async ({ where }) => records.filter(row => row.userId === where.userId && (!Object.hasOwn(where, "workspaceId") || row.workspaceId === where.workspaceId)));
    findFirst.mockImplementation(async ({ where }) => records.find(row => row.id === where.id && row.userId === where.userId && (!Object.hasOwn(where, "workspaceId") || row.workspaceId === where.workspaceId)) ?? null);
    syncXero.mockResolvedValue({ xeroInvoiceId: "synthetic-invoice", xeroInvoiceNumber: "SYN-1" });
    const result = await syncNIRToAllConnectedIntegrations("owner-user", payload);
    expect(result.map(row => row.integrationId)).toEqual(["allowed"]);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "owner-user", workspaceId, status: "CONNECTED" } }));
    expect(syncXero).toHaveBeenCalledExactlyOnceWith("allowed", payload);
  });

  it("rejects an explicit ID from another workspace for the same user", async () => {
    const foreign = { id: "foreign", userId: "owner-user", workspaceId: "workspace-b", provider: "XERO", name: "Xero", status: "CONNECTED" };
    findFirst.mockImplementation(async ({ where }) => !Object.hasOwn(where, "workspaceId") || where.workspaceId === foreign.workspaceId ? foreign : null);
    expect(await syncNIRToSpecificIntegration("owner-user", "foreign", payload)).toMatchObject({ status: "error" });
    expect(syncXero).not.toHaveBeenCalled();
  });

  it("does not resolve integrations or dispatch when the source report owner cannot be verified", async () => {
    reportFindFirst.mockResolvedValue(null);
    expect(await syncNIRToAllConnectedIntegrations("wrong-owner", payload)).toEqual([]);
    expect(await syncNIRToSpecificIntegration("wrong-owner", "synthetic-id", payload)).toMatchObject({ status: "error" });
    expect(reportFindFirst).toHaveBeenCalledWith({ where: { id: "report-1", userId: "wrong-owner" }, select: { id: true, userId: true, workspaceId: true } });
    expect(findMany).not.toHaveBeenCalled(); expect(findFirst).not.toHaveBeenCalled(); expect(syncXero).not.toHaveBeenCalled();
  });
});
