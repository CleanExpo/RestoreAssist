/**
 * RA-6922 — unit tests for the requireAddon() entitlement guard.
 *
 * Runs without a database — prisma and the workspace resolver are mocked.
 * Covers: entitled → allow; not-entitled → 402 deny; unknown SKU → 400 deny;
 * inactive entitlement → 402 deny; no workspace → 402 deny.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    featureEntitlement: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/lib/workspace/provider-connections", () => ({
  getWorkspaceForUser: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { getWorkspaceForUser } from "@/lib/workspace/provider-connections";
import {
  requireAddon,
  requireAddonOrThrow,
  AddonNotEntitledError,
} from "../require-addon";
import { ADDON_SKUS } from "../types";

const mockFindUnique = prisma.featureEntitlement
  .findUnique as ReturnType<typeof vi.fn>;
const mockGetWorkspaceForUser = getWorkspaceForUser as ReturnType<typeof vi.fn>;

const WORKSPACE = { id: "ws_123", name: "Acme Restoration" };

beforeEach(() => {
  vi.clearAllMocks();
  mockGetWorkspaceForUser.mockResolvedValue(WORKSPACE);
});

describe("requireAddon", () => {
  it("allows when an ACTIVE entitlement exists for the SKU", async () => {
    mockFindUnique.mockResolvedValue({ id: "fe_1", active: true });

    const result = await requireAddon("user_1", "VOICE");

    expect(result.allowed).toBe(true);
    if (result.allowed) {
      expect(result.sku).toBe("VOICE");
      expect(result.workspaceId).toBe("ws_123");
    }
    // Explicit-select query, keyed on the compound unique.
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { workspaceId_sku: { workspaceId: "ws_123", sku: "VOICE" } },
      select: { id: true, active: true },
    });
  });

  it("denies with a 402 when the workspace has no entitlement row", async () => {
    mockFindUnique.mockResolvedValue(null);

    const result = await requireAddon("user_1", "PAYMENTS");

    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toBe("NOT_ENTITLED");
      expect(result.sku).toBe("PAYMENTS");
      expect(result.response.status).toBe(402);
      const body = await result.response.json();
      expect(body.code).toBe("ADDON_REQUIRED");
      expect(body.sku).toBe("PAYMENTS");
    }
  });

  it("denies with a 402 when the entitlement row is inactive", async () => {
    mockFindUnique.mockResolvedValue({ id: "fe_2", active: false });

    const result = await requireAddon("user_1", "BOOKKEEPING");

    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toBe("NOT_ENTITLED");
      expect(result.response.status).toBe(402);
    }
  });

  it("denies with a 400 for an unknown SKU and never hits the database", async () => {
    const result = await requireAddon("user_1", "NOT_A_REAL_SKU");

    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toBe("UNKNOWN_SKU");
      expect(result.sku).toBe("NOT_A_REAL_SKU");
      expect(result.response.status).toBe(400);
      const body = await result.response.json();
      expect(body.code).toBe("UNKNOWN_ADDON");
    }
    expect(mockGetWorkspaceForUser).not.toHaveBeenCalled();
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("denies with a 402 when the user has no workspace", async () => {
    mockGetWorkspaceForUser.mockResolvedValue(null);

    const result = await requireAddon("user_1", "SERVICE_CRM");

    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toBe("NO_WORKSPACE");
      expect(result.response.status).toBe(402);
      const body = await result.response.json();
      expect(body.code).toBe("NO_WORKSPACE");
    }
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("allows FLOORPLAN_UNDERLAY when entitled and 402s when not (RA-6922)", async () => {
    mockFindUnique.mockResolvedValueOnce({ id: "fe_fp", active: true });
    const allowed = await requireAddon("user_1", "FLOORPLAN_UNDERLAY");
    expect(allowed.allowed).toBe(true);

    mockFindUnique.mockResolvedValueOnce(null);
    const denied = await requireAddon("user_1", "FLOORPLAN_UNDERLAY");
    expect(denied.allowed).toBe(false);
    if (!denied.allowed) {
      expect(denied.reason).toBe("NOT_ENTITLED");
      expect(denied.response.status).toBe(402);
    }
  });

  it("covers every declared add-on SKU as a valid key", async () => {
    mockFindUnique.mockResolvedValue({ id: "fe_x", active: true });

    for (const sku of ADDON_SKUS) {
      const result = await requireAddon("user_1", sku);
      expect(result.allowed).toBe(true);
    }
  });
});

describe("requireAddonOrThrow", () => {
  it("returns the entitled workspace when allowed", async () => {
    mockFindUnique.mockResolvedValue({ id: "fe_1", active: true });

    await expect(requireAddonOrThrow("user_1", "VOICE")).resolves.toEqual({
      sku: "VOICE",
      workspaceId: "ws_123",
    });
  });

  it("throws AddonNotEntitledError when not entitled", async () => {
    mockFindUnique.mockResolvedValue(null);

    await expect(requireAddonOrThrow("user_1", "VOICE")).rejects.toBeInstanceOf(
      AddonNotEntitledError,
    );
  });

  it("throws AddonNotEntitledError for an unknown SKU", async () => {
    await expect(
      requireAddonOrThrow("user_1", "NOPE"),
    ).rejects.toMatchObject({ reason: "UNKNOWN_SKU", sku: "NOPE" });
  });
});
