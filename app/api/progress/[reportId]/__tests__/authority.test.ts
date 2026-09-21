import { beforeEach, describe, expect, it, vi } from "vitest";

const userFindUnique = vi.fn();
const reportFindUnique = vi.fn();
const resolveProgressRole = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (...args: unknown[]) => userFindUnique(...args) },
    report: { findUnique: (...args: unknown[]) => reportFindUnique(...args) },
  },
}));
vi.mock("@/lib/progress/permissions", () => ({
  resolveProgressRole: (...args: unknown[]) => resolveProgressRole(...args),
}));

import { resolveProgressAuthority } from "../_authority";

const staleAdminSession = {
  user: { id: "u_demoted", role: "ADMIN", email: "u@test.com" },
  expires: "2099-01-01T00:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  resolveProgressRole.mockReturnValue("TECHNICIAN");
});

describe("resolveProgressAuthority", () => {
  it("rejects a stale ADMIN JWT after DB demotion for another tenant report", async () => {
    userFindUnique.mockResolvedValueOnce({ role: "USER" });
    reportFindUnique.mockResolvedValueOnce({
      id: "r_other",
      userId: "u_other",
    });

    const result = await resolveProgressAuthority(staleAdminSession, "r_other");

    expect(result).toEqual({
      ok: false,
      status: 404,
      reason: "Report not found",
    });
    expect(resolveProgressRole).not.toHaveBeenCalled();
  });

  it("preserves owner access but derives Progress role from the current DB role", async () => {
    userFindUnique
      .mockResolvedValueOnce({ role: "USER" })
      .mockResolvedValueOnce({
        role: "USER",
        isJuniorTechnician: true,
        email: "u@test.com",
        name: "Demoted Owner",
      });
    reportFindUnique.mockResolvedValueOnce({
      id: "r_owned",
      userId: "u_demoted",
    });
    resolveProgressRole.mockReturnValueOnce("TECHNICIAN_JUNIOR");

    const result = await resolveProgressAuthority(staleAdminSession, "r_owned");

    expect(result).toMatchObject({ ok: true, role: "TECHNICIAN_JUNIOR" });
    expect(resolveProgressRole).toHaveBeenCalledWith({
      userRole: "USER",
      isJuniorTechnician: true,
    });
  });
});
