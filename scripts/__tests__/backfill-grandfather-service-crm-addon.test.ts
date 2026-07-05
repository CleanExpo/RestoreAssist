/**
 * RA-6920 B1 — unit tests for the SERVICE_CRM grandfather backfill.
 *
 * Runs without a database — prisma and the workspace resolver are mocked.
 * Proves: existing Ascora/DR-NRPG integrations get their workspace's
 * FeatureEntitlement{SERVICE_CRM} marked active; already-entitled workspaces
 * are left alone (idempotent); users with no workspace are skipped and
 * counted, never crash the run.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

const mockAscoraFindMany = vi.fn();
const mockDrNrpgFindMany = vi.fn();
const mockEntitlementFindUnique = vi.fn();
const mockEntitlementUpsert = vi.fn();
const mockGetWorkspaceForUser = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    ascoraIntegration: { findMany: (...a: unknown[]) => mockAscoraFindMany(...a) },
    drNrpgIntegration: { findMany: (...a: unknown[]) => mockDrNrpgFindMany(...a) },
    featureEntitlement: {
      findUnique: (...a: unknown[]) => mockEntitlementFindUnique(...a),
      upsert: (...a: unknown[]) => mockEntitlementUpsert(...a),
    },
  },
}));

vi.mock("@/lib/workspace/provider-connections", () => ({
  getWorkspaceForUser: (...a: unknown[]) => mockGetWorkspaceForUser(...a),
}));

import { grandfatherServiceCrmAddon } from "../backfill-grandfather-service-crm-addon";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("grandfatherServiceCrmAddon", () => {
  it("grandfathers every workspace with an active Ascora or DR-NRPG integration", async () => {
    mockAscoraFindMany.mockResolvedValue([{ userId: "u1" }, { userId: "u2" }]);
    mockDrNrpgFindMany.mockResolvedValue([{ userId: "u3" }]);
    mockGetWorkspaceForUser.mockImplementation(async (userId: string) => ({
      id: `ws_${userId}`,
      name: userId,
    }));
    mockEntitlementFindUnique.mockResolvedValue(null);

    const result = await grandfatherServiceCrmAddon();

    expect(result).toEqual({
      usersWithIntegration: 3,
      workspacesGrandfathered: 3,
      alreadyEntitled: 0,
      noWorkspace: 0,
    });
    expect(mockEntitlementUpsert).toHaveBeenCalledTimes(3);
    expect(mockEntitlementUpsert).toHaveBeenCalledWith({
      where: { workspaceId_sku: { workspaceId: "ws_u1", sku: "SERVICE_CRM" } },
      create: { workspaceId: "ws_u1", sku: "SERVICE_CRM", active: true },
      update: { active: true },
    });
  });

  it("is idempotent — an already-active entitlement is skipped, not re-upserted", async () => {
    mockAscoraFindMany.mockResolvedValue([{ userId: "u1" }]);
    mockDrNrpgFindMany.mockResolvedValue([]);
    mockGetWorkspaceForUser.mockResolvedValue({ id: "ws_1", name: "Acme" });
    mockEntitlementFindUnique.mockResolvedValue({ active: true });

    const result = await grandfatherServiceCrmAddon();

    expect(result.workspacesGrandfathered).toBe(0);
    expect(result.alreadyEntitled).toBe(1);
    expect(mockEntitlementUpsert).not.toHaveBeenCalled();
  });

  it("counts users with no resolvable workspace and does not crash", async () => {
    mockAscoraFindMany.mockResolvedValue([{ userId: "orphan" }]);
    mockDrNrpgFindMany.mockResolvedValue([]);
    mockGetWorkspaceForUser.mockResolvedValue(null);

    const result = await grandfatherServiceCrmAddon();

    expect(result.noWorkspace).toBe(1);
    expect(result.workspacesGrandfathered).toBe(0);
    expect(mockEntitlementUpsert).not.toHaveBeenCalled();
  });

  it("dedupes when both integrations belong to the same workspace", async () => {
    mockAscoraFindMany.mockResolvedValue([{ userId: "owner" }]);
    mockDrNrpgFindMany.mockResolvedValue([{ userId: "member" }]);
    mockGetWorkspaceForUser.mockResolvedValue({ id: "ws_shared", name: "Shared" });
    mockEntitlementFindUnique.mockResolvedValue(null);

    const result = await grandfatherServiceCrmAddon();

    expect(result.usersWithIntegration).toBe(2);
    expect(result.workspacesGrandfathered).toBe(1);
    expect(mockEntitlementUpsert).toHaveBeenCalledTimes(1);
  });
});
