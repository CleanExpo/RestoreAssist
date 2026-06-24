import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    report: { findUnique: vi.fn(), findFirst: vi.fn() },
    inspection: { findUnique: vi.fn(), findFirst: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import {
  assertInspectionTenancy,
  assertPortalReportTenancy,
  assertReportTenancy,
  resolveInspectionWrite,
} from "../assert-tenancy";

const reportFindUnique = (
  prisma as unknown as {
    report: { findUnique: ReturnType<typeof vi.fn> };
  }
).report.findUnique;
const reportFindFirst = (
  prisma as unknown as {
    report: { findFirst: ReturnType<typeof vi.fn> };
  }
).report.findFirst;
const inspFindUnique = (
  prisma as unknown as {
    inspection: { findUnique: ReturnType<typeof vi.fn> };
  }
).inspection.findUnique;
const inspFindFirst = (
  prisma as unknown as {
    inspection: { findFirst: ReturnType<typeof vi.fn> };
  }
).inspection.findFirst;
const userFindUnique = (
  prisma as unknown as {
    user: { findUnique: ReturnType<typeof vi.fn> };
  }
).user.findUnique;

beforeEach(() => {
  userFindUnique.mockReset();
  reportFindUnique.mockReset();
  reportFindFirst.mockReset();
  inspFindUnique.mockReset();
  inspFindFirst.mockReset();
});

// ─── assertReportTenancy ─────────────────────────────────────────────────────

describe("assertReportTenancy", () => {
  it("401 when no session", async () => {
    const r = await assertReportTenancy(null, "r_1");
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.status).toBe(401);
  });

  it("401 when session has no user.id", async () => {
    const r = await assertReportTenancy({ user: { id: null } }, "r_1");
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.status).toBe(401);
  });

  it("404 when report does not exist", async () => {
    reportFindUnique.mockResolvedValueOnce(null);
    const r = await assertReportTenancy({ user: { id: "u_1" } }, "r_missing");
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.status).toBe(404);
  });

  it("404 when report belongs to a different user (no enumeration)", async () => {
    reportFindUnique.mockResolvedValueOnce({ id: "r_1", userId: "u_other" });
    const r = await assertReportTenancy({ user: { id: "u_1" } }, "r_1");
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.status).toBe(404);
  });

  it("returns the report when owned by the session user", async () => {
    reportFindUnique.mockResolvedValueOnce({ id: "r_1", userId: "u_1" });
    const r = await assertReportTenancy({ user: { id: "u_1" } }, "r_1");
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    expect(r.data.userId).toBe("u_1");
  });

  it("admin bypass: returns the report regardless of owner", async () => {
    userFindUnique.mockResolvedValueOnce({ role: "ADMIN" });
    reportFindUnique.mockResolvedValueOnce({ id: "r_1", userId: "u_other" });
    const r = await assertReportTenancy(
      { user: { id: "u_admin", role: "ADMIN" } },
      "r_1",
    );
    expect(r.ok).toBe(true);
  });

  it("stale admin JWT does not bypass report ownership", async () => {
    userFindUnique.mockResolvedValueOnce({ role: "USER" });
    reportFindUnique.mockResolvedValueOnce({ id: "r_1", userId: "u_other" });

    const r = await assertReportTenancy(
      { user: { id: "u_admin", role: "ADMIN" } },
      "r_1",
    );

    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.status).toBe(404);
  });
});

// ─── assertInspectionTenancy ─────────────────────────────────────────────────

describe("assertInspectionTenancy", () => {
  it("401 when no session", async () => {
    const r = await assertInspectionTenancy(null, "i_1");
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.status).toBe(401);
  });

  it("admin path: uses findUnique by id only", async () => {
    userFindUnique.mockResolvedValueOnce({ role: "ADMIN" });
    inspFindUnique.mockResolvedValueOnce({
      id: "i_1",
      userId: "u_other",
      workspaceId: "ws_other",
    });
    const r = await assertInspectionTenancy(
      { user: { id: "u_admin", role: "ADMIN" } },
      "i_1",
    );
    expect(r.ok).toBe(true);
    expect(inspFindUnique).toHaveBeenCalledTimes(1);
    expect(inspFindFirst).not.toHaveBeenCalled();
  });

  it("admin path: 404 when inspection does not exist", async () => {
    userFindUnique.mockResolvedValueOnce({ role: "ADMIN" });
    inspFindUnique.mockResolvedValueOnce(null);
    const r = await assertInspectionTenancy(
      { user: { id: "u_admin", role: "ADMIN" } },
      "i_missing",
    );
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.status).toBe(404);
  });

  it("stale admin JWT falls back to normal inspection tenancy", async () => {
    userFindUnique.mockResolvedValueOnce({ role: "USER" });
    inspFindFirst.mockResolvedValueOnce(null);

    const r = await assertInspectionTenancy(
      { user: { id: "u_admin", role: "ADMIN" } },
      "i_1",
    );

    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.status).toBe(404);
    expect(inspFindUnique).not.toHaveBeenCalled();
    expect(inspFindFirst).toHaveBeenCalledTimes(1);
  });

  it("member path: scopes by userId OR active workspace membership", async () => {
    inspFindFirst.mockResolvedValueOnce({
      id: "i_1",
      userId: "u_1",
      workspaceId: "ws_1",
    });
    const r = await assertInspectionTenancy({ user: { id: "u_1" } }, "i_1");
    expect(r.ok).toBe(true);
    expect(inspFindFirst).toHaveBeenCalledTimes(1);
    const where = inspFindFirst.mock.calls[0][0].where;
    expect(where.id).toBe("i_1");
    // OR clause must contain both ownership and workspace-membership branches
    expect(where.OR).toBeDefined();
    expect(where.OR).toHaveLength(2);
  });

  it("member path: 404 when inspection does not match any tenancy clause", async () => {
    inspFindFirst.mockResolvedValueOnce(null);
    const r = await assertInspectionTenancy(
      { user: { id: "u_outsider" } },
      "i_1",
    );
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.status).toBe(404);
  });
});

// ─── assertPortalReportTenancy ───────────────────────────────────────────────

describe("assertPortalReportTenancy", () => {
  it("401 when not a client session", async () => {
    const r = await assertPortalReportTenancy(
      { user: { id: "u_1", userType: "user" } },
      "r_1",
    );
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.status).toBe(401);
  });

  it("401 when client session has no clientId", async () => {
    const r = await assertPortalReportTenancy(
      { user: { id: "u_1", userType: "client", clientId: null } },
      "r_1",
    );
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.status).toBe(401);
  });

  it("scopes the lookup by clientId so cross-client IDs return 404", async () => {
    reportFindFirst.mockResolvedValueOnce(null);
    const r = await assertPortalReportTenancy(
      { user: { id: "u_1", userType: "client", clientId: "c_1" } },
      "r_belongs_to_other_client",
    );
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.status).toBe(404);
    expect(reportFindFirst).toHaveBeenCalledTimes(1);
    expect(reportFindFirst.mock.calls[0][0].where.clientId).toBe("c_1");
  });

  it("returns the report when client owns it", async () => {
    reportFindFirst.mockResolvedValueOnce({ id: "r_1", clientId: "c_1" });
    const r = await assertPortalReportTenancy(
      { user: { id: "u_1", userType: "client", clientId: "c_1" } },
      "r_1",
    );
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    expect(r.data.clientId).toBe("c_1");
  });
});

// ─── resolveInspectionWrite (RA-6800) ────────────────────────────────────────

describe("resolveInspectionWrite", () => {
  it("401 when no session", async () => {
    const r = await resolveInspectionWrite(null, "insp_1");
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.status).toBe(401);
  });

  it("owner: returns ownership-scoped write filters (id + OR)", async () => {
    inspFindFirst.mockResolvedValue({ id: "insp_1" });
    const r = await resolveInspectionWrite(
      { user: { id: "owner_1" } },
      "insp_1",
    );
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    // parent where re-asserts ownership atomically
    expect(r.data.inspectionWhere).toMatchObject({ id: "insp_1" });
    expect((r.data.inspectionWhere as { OR?: unknown }).OR).toBeTruthy();
    // child writes get a relation filter to scope by the same ownership
    expect(r.data.childInspectionFilter).toBeTruthy();
    // the access query was scoped to owner OR active workspace member
    const where = inspFindFirst.mock.calls[0][0].where;
    expect(where.id).toBe("insp_1");
    expect(where.OR).toEqual([
      { userId: "owner_1" },
      {
        workspace: { members: { some: { userId: "owner_1", status: "ACTIVE" } } },
      },
    ]);
  });

  it("non-owner / non-member: 404 (no write scope leaked)", async () => {
    inspFindFirst.mockResolvedValue(null);
    const r = await resolveInspectionWrite(
      { user: { id: "attacker" } },
      "insp_victim",
    );
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.status).toBe(404);
  });

  it("admin: bypasses ownership — id-only scope, no child relation filter", async () => {
    userFindUnique.mockResolvedValue({ role: "ADMIN" });
    inspFindUnique.mockResolvedValue({ id: "insp_1" });
    const r = await resolveInspectionWrite(
      { user: { id: "admin_1", role: "ADMIN" } },
      "insp_1",
    );
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    expect(r.data.inspectionWhere).toEqual({ id: "insp_1" });
    expect(r.data.childInspectionFilter).toBeUndefined();
    // admin must not be narrowed by an ownership findFirst
    expect(inspFindFirst).not.toHaveBeenCalled();
  });

  it("admin token but DB role no longer ADMIN: falls back to ownership scope", async () => {
    userFindUnique.mockResolvedValue({ role: "USER" }); // stale token
    inspFindFirst.mockResolvedValue({ id: "insp_1" });
    const r = await resolveInspectionWrite(
      { user: { id: "ex_admin", role: "ADMIN" } },
      "insp_1",
    );
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    expect((r.data.inspectionWhere as { OR?: unknown }).OR).toBeTruthy();
    expect(inspFindFirst).toHaveBeenCalled();
  });
});
