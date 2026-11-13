import { describe, it, expect, vi, beforeEach } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    reportShareAccess: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/portal-token", () => ({
  verifyInsurerToken: vi.fn(() => null),
}));

import {
  mintReportShareAccess,
  verifyReportReaderToken,
  revokeReportShareAccess,
} from "../access";
import { ReportShareScope } from "@prisma/client";

describe("report-share access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("mints opaque tokens with expiry", async () => {
    prismaMock.reportShareAccess.create.mockResolvedValue({
      id: "acc_1",
      token: "opaque-token",
      expiresAt: new Date("2030-01-01"),
    });

    const row = await mintReportShareAccess({
      reportId: "rep_1",
      scope: ReportShareScope.INSURER,
      createdByUserId: "user_1",
    });

    expect(row.token).toBe("opaque-token");
    expect(prismaMock.reportShareAccess.create).toHaveBeenCalled();
  });

  it("rejects revoked stored tokens", async () => {
    prismaMock.reportShareAccess.findUnique.mockResolvedValue({
      id: "acc_1",
      reportId: "rep_1",
      scope: ReportShareScope.OWNER_VIEW,
      revokedAt: new Date(),
      expiresAt: new Date("2030-01-01"),
    });

    const result = await verifyReportReaderToken("opaque-token");
    expect(result).toBeNull();
  });

  it("revokes by access id and report id", async () => {
    prismaMock.reportShareAccess.updateMany.mockResolvedValue({ count: 1 });
    const ok = await revokeReportShareAccess("acc_1", "rep_1");
    expect(ok).toBe(true);
  });
});
