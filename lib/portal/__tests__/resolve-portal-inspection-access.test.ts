import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    clientPortalAccount: { findUnique: vi.fn(), update: vi.fn() },
    inspection: { findFirst: vi.fn() },
  },
}));
vi.mock("@/lib/portal-token", () => ({ verifyPortalToken: vi.fn() }));

import { verifyPortalToken } from "@/lib/portal-token";
import { prisma } from "@/lib/prisma";
import { resolvePortalInspectionAccess } from "../resolve-portal-inspection-access";

const p = prisma as unknown as {
  clientPortalAccount: {
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  inspection: { findFirst: ReturnType<typeof vi.fn> };
};
const mVerify = verifyPortalToken as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  p.clientPortalAccount.findUnique.mockResolvedValue(null);
  p.clientPortalAccount.update.mockResolvedValue({});
  p.inspection.findFirst.mockResolvedValue({ id: "inspection_1" });
  mVerify.mockReturnValue(null);
});

describe("resolvePortalInspectionAccess", () => {
  it("returns client scope and read-only access for an active no-expiry account", async () => {
    p.clientPortalAccount.findUnique.mockResolvedValue({
      id: "portal_1",
      clientId: "client_1",
      expiresAt: null,
      revokedAt: null,
    });
    p.clientPortalAccount.update.mockRejectedValue(new Error("telemetry down"));

    await expect(resolvePortalInspectionAccess("db-token")).resolves.toEqual({
      inspectionId: "inspection_1",
      clientId: "client_1",
      source: "ACCOUNT",
      accessMode: "READ_ONLY",
    });
    expect(p.clientPortalAccount.findUnique).toHaveBeenCalledWith({
      where: { token: "db-token" },
      select: {
        id: true,
        clientId: true,
        expiresAt: true,
        revokedAt: true,
      },
    });
    expect(p.inspection.findFirst).toHaveBeenCalledWith({
      where: { report: { clientId: "client_1" } },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
  });

  it("treats an expired account as terminal without HMAC fallback", async () => {
    p.clientPortalAccount.findUnique.mockResolvedValue({
      id: "portal_1",
      clientId: "client_1",
      expiresAt: new Date("2000-01-01T00:00:00.000Z"),
      revokedAt: null,
    });
    mVerify.mockReturnValue({ inspectionId: "legacy" });

    await expect(
      resolvePortalInspectionAccess("collision"),
    ).resolves.toBeNull();
    expect(mVerify).not.toHaveBeenCalled();
    expect(p.inspection.findFirst).not.toHaveBeenCalled();
  });

  it("rejects an active account that has no client-scoped inspection", async () => {
    p.clientPortalAccount.findUnique.mockResolvedValue({
      id: "portal_1",
      clientId: "client_1",
      expiresAt: new Date("2099-01-01T00:00:00.000Z"),
      revokedAt: null,
    });
    p.inspection.findFirst.mockResolvedValue(null);

    await expect(resolvePortalInspectionAccess("db-token")).resolves.toBeNull();
    expect(p.clientPortalAccount.update).not.toHaveBeenCalled();
  });

  it("fails closed when legacy verification is unavailable", async () => {
    mVerify.mockImplementation(() => {
      throw new Error("PORTAL_SECRET missing");
    });

    await expect(resolvePortalInspectionAccess("unknown")).resolves.toBeNull();
  });
});
