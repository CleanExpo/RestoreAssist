/**
 * RA-6920 B3 — grandfather backfill for existing Xero/QuickBooks/MYOB
 * integrations. Runs without a database — prisma and the workspace resolver
 * are mocked so this always executes in CI (unlike the DB-gated
 * grandfather-existing-orgs test).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    integration: { findMany: vi.fn() },
    featureEntitlement: { upsert: vi.fn() },
  },
}));

vi.mock("@/lib/workspace/provider-connections", () => ({
  getWorkspaceForUser: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { getWorkspaceForUser } from "@/lib/workspace/provider-connections";
import { grandfatherBookkeepingAddon } from "../grandfather-bookkeeping-addon";

const mockFindMany = prisma.integration.findMany as ReturnType<typeof vi.fn>;
const mockUpsert = prisma.featureEntitlement.upsert as ReturnType<typeof vi.fn>;
const mockGetWorkspaceForUser = getWorkspaceForUser as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockUpsert.mockResolvedValue({});
});

describe("grandfatherBookkeepingAddon", () => {
  it("grants an ACTIVE BOOKKEEPING entitlement for each connected integration's workspace", async () => {
    mockFindMany.mockResolvedValue([
      { userId: "u1", workspaceId: "ws_1" },
      { userId: "u2", workspaceId: "ws_2" },
    ]);

    const result = await grandfatherBookkeepingAddon();

    expect(result).toEqual({ granted: 2, skippedNoWorkspace: 0 });
    expect(mockFindMany).toHaveBeenCalledWith({
      where: {
        provider: { in: ["XERO", "QUICKBOOKS", "MYOB"] },
        status: "CONNECTED",
      },
      select: { userId: true, workspaceId: true },
    });
    expect(mockUpsert).toHaveBeenCalledWith({
      where: { workspaceId_sku: { workspaceId: "ws_1", sku: "BOOKKEEPING" } },
      create: { workspaceId: "ws_1", sku: "BOOKKEEPING", active: true },
      update: { active: true },
    });
    expect(mockUpsert).toHaveBeenCalledWith({
      where: { workspaceId_sku: { workspaceId: "ws_2", sku: "BOOKKEEPING" } },
      create: { workspaceId: "ws_2", sku: "BOOKKEEPING", active: true },
      update: { active: true },
    });
  });

  it("falls back to getWorkspaceForUser when the Integration row has no workspaceId", async () => {
    mockFindMany.mockResolvedValue([{ userId: "u1", workspaceId: null }]);
    mockGetWorkspaceForUser.mockResolvedValue({ id: "ws_3", name: "Fallback" });

    const result = await grandfatherBookkeepingAddon();

    expect(result).toEqual({ granted: 1, skippedNoWorkspace: 0 });
    expect(mockGetWorkspaceForUser).toHaveBeenCalledWith("u1");
    expect(mockUpsert).toHaveBeenCalledWith({
      where: { workspaceId_sku: { workspaceId: "ws_3", sku: "BOOKKEEPING" } },
      create: { workspaceId: "ws_3", sku: "BOOKKEEPING", active: true },
      update: { active: true },
    });
  });

  it("skips an integration whose user has no resolvable workspace at all", async () => {
    mockFindMany.mockResolvedValue([{ userId: "orphan", workspaceId: null }]);
    mockGetWorkspaceForUser.mockResolvedValue(null);

    const result = await grandfatherBookkeepingAddon();

    expect(result).toEqual({ granted: 0, skippedNoWorkspace: 1 });
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("dedupes multiple integrations on the same workspace into one upsert", async () => {
    mockFindMany.mockResolvedValue([
      { userId: "u1", workspaceId: "ws_shared" },
      { userId: "u1", workspaceId: "ws_shared" },
    ]);

    const result = await grandfatherBookkeepingAddon();

    expect(result).toEqual({ granted: 1, skippedNoWorkspace: 0 });
    expect(mockUpsert).toHaveBeenCalledTimes(1);
  });

  it("is idempotent — running twice still ends with active:true and no error", async () => {
    mockFindMany.mockResolvedValue([{ userId: "u1", workspaceId: "ws_1" }]);

    await grandfatherBookkeepingAddon();
    const second = await grandfatherBookkeepingAddon();

    expect(second).toEqual({ granted: 1, skippedNoWorkspace: 0 });
    expect(mockUpsert).toHaveBeenCalledTimes(2);
    for (const call of mockUpsert.mock.calls) {
      expect(call[0].update).toEqual({ active: true });
    }
  });
});
