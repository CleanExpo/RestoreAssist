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
  resolveInspectionReach,
  resolveClientReach,
  resolveInvoiceReach,
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

  // Was "admin bypass: returns the report regardless of owner", asserting the
  // cross-tenant read as intended behaviour. Every firm self-registers as
  // ADMIN, so that made one customer's records reachable by another.
  it("tenant ADMIN does NOT reach a report owned by another tenant", async () => {
    userFindUnique.mockResolvedValueOnce({
      role: "ADMIN",
      organizationId: null,
    });
    reportFindUnique.mockResolvedValueOnce({
      id: "r_1",
      userId: "u_other",
      user: { organizationId: "org_other" },
    });
    const r = await assertReportTenancy(
      { user: { id: "u_admin", role: "ADMIN" } },
      "r_1",
    );
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.status).toBe(404);
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

  // Was "admin path: uses findUnique by id only". An unscoped read by id is
  // now reserved for allowlisted platform support, never a tenant ADMIN.
  it("tenant ADMIN does NOT read another tenant's inspection by id", async () => {
    userFindUnique.mockResolvedValueOnce({
      role: "ADMIN",
      organizationId: null,
    });
    inspFindUnique.mockResolvedValueOnce({
      id: "i_1",
      userId: "u_other",
      workspaceId: "ws_other",
    });
    inspFindFirst.mockResolvedValueOnce(null);
    const r = await assertInspectionTenancy(
      { user: { id: "u_admin", role: "ADMIN" } },
      "i_1",
    );
    expect(r.ok).toBe(false);
    // The scoped lookup is the one that must run; the unscoped read by id is
    // now reserved for allowlisted platform support.
    expect(inspFindFirst).toHaveBeenCalledTimes(1);
    expect(inspFindUnique).not.toHaveBeenCalled();
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

  // Was "admin: bypasses ownership — id-only scope, no child relation filter".
  // The id-only write scope is the dangerous one: it let a later update touch
  // a record the caller does not own. It now belongs to platform support only.
  it("platform support operator: id-only scope, no child relation filter", async () => {
    vi.stubEnv("PLATFORM_SUPPORT_USER_IDS", "admin_1");
    userFindUnique.mockResolvedValue({
      role: "ADMIN",
      organizationId: "org_a",
    });
    inspFindUnique.mockResolvedValue({ id: "insp_1" });
    const r = await resolveInspectionWrite(
      { user: { id: "admin_1", role: "ADMIN" } },
      "insp_1",
    );
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    expect(r.data.inspectionWhere).toEqual({ id: "insp_1" });
    expect(r.data.childInspectionFilter).toBeUndefined();
    // a platform operator must not be narrowed by an ownership findFirst
    expect(inspFindFirst).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it("tenant ADMIN gets a SCOPED write filter, never id-only", async () => {
    userFindUnique.mockResolvedValue({
      role: "ADMIN",
      organizationId: "org_a",
    });
    inspFindFirst.mockResolvedValue({ id: "insp_1" });
    const r = await resolveInspectionWrite(
      { user: { id: "admin_1", role: "ADMIN" } },
      "insp_1",
    );
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    expect(r.data.inspectionManyWhere).not.toEqual({ id: "insp_1" });
    expect(r.data.childInspectionFilter).toBeDefined();
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

// ─── resolveInspectionReach ──────────────────────────────────────────────────

describe("resolveInspectionReach", () => {
  it("401 when no session", async () => {
    const r = await resolveInspectionReach(null);
    expect(r.ok).toBe(false);
  });

  // RA-7582 / D-023. This assertion used to read "owner or active workspace
  // member only, for a non-admin", and it was the thing holding the defect in
  // place: a USER in an organisation got exactly two clauses, one of which
  // (workspace membership) matches nothing because no create path writes
  // `workspaceId`. The result was an empty dashboard for every invited
  // technician. Reading a job is now a colleague's right.
  it("widens to the organisation for a non-admin who has one", async () => {
    userFindUnique.mockResolvedValue({ role: "USER", organizationId: "org_1" });
    const r = await resolveInspectionReach({ user: { id: "u_1" } });
    if (!r.ok) throw new Error("unreachable");
    expect(r.data).toEqual({
      AND: [
        {
          OR: [
            { userId: "u_1" },
            {
              workspace: {
                members: { some: { userId: "u_1", status: "ACTIVE" } },
              },
            },
            { user: { organizationId: "org_1" } },
          ],
        },
      ],
    });
  });

  // The guard that matters more than the widening. Asserted with toEqual, not
  // toContainEqual: only an exact match can see an extra clause that would
  // match the whole platform.
  it("gives an org-less user exactly the two self clauses", async () => {
    userFindUnique.mockResolvedValue({ role: "USER", organizationId: null });
    const r = await resolveInspectionReach({ user: { id: "u_1" } });
    if (!r.ok) throw new Error("unreachable");
    expect(r.data).toEqual({
      AND: [
        {
          OR: [
            { userId: "u_1" },
            {
              workspace: {
                members: { some: { userId: "u_1", status: "ACTIVE" } },
              },
            },
          ],
        },
      ],
    });
  });

  // An `undefined` organisationId is DROPPED by Prisma, turning
  // `{ user: { organizationId } }` into `{ user: {} }` -- a filter that matches
  // every row on the platform. A user row that came back without the field at
  // all must therefore fall back to self, never to org.
  it("falls back to self when the user row carries no organisation field", async () => {
    userFindUnique.mockResolvedValue({ role: "ADMIN" });
    const r = await resolveInspectionReach({ user: { id: "u_1" } });
    if (!r.ok) throw new Error("unreachable");
    const clauses = (r.data as { AND: Array<{ OR: unknown[] }> }).AND[0].OR;
    expect(clauses).toHaveLength(2);
    expect(JSON.stringify(clauses)).not.toContain("organizationId");
  });

  it("widens to the organisation for a tenant admin", async () => {
    userFindUnique.mockResolvedValue({ role: "ADMIN", organizationId: "org_1" });
    const r = await resolveInspectionReach({ user: { id: "u_1" } });
    if (!r.ok) throw new Error("unreachable");
    const clauses = (r.data as { AND: Array<{ OR: unknown[] }> }).AND[0].OR;
    expect(clauses).toContainEqual({ user: { organizationId: "org_1" } });
  });
});

// ─── resolveClientReach / resolveInvoiceReach ────────────────────────────────

/**
 * Money is gated one rung higher than jobs. `/api/invoices` returns the firm's
 * receivables ledger, line-item pricing, `xeroAccountCode` and Stripe
 * payment-intent identifiers; `/api/clients` returns per-client revenue next to
 * customer contact details. RA-7582 reported neither, so the organisation
 * widening for those two stops at MANAGER.
 */
describe("financial reach is MANAGER or above", () => {
  for (const [name, fn] of [
    ["clients", resolveClientReach],
    ["invoices", resolveInvoiceReach],
  ] as const) {
    it(`${name}: a USER in an organisation stays on their own records`, async () => {
      userFindUnique.mockResolvedValue({
        role: "USER",
        organizationId: "org_1",
      });
      const r = await fn({ user: { id: "u_1" } });
      if (!r.ok) throw new Error("unreachable");
      expect(JSON.stringify(r.data)).not.toContain("organizationId");
    });

    it(`${name}: a MANAGER reaches the organisation`, async () => {
      userFindUnique.mockResolvedValue({
        role: "MANAGER",
        organizationId: "org_1",
      });
      const r = await fn({ user: { id: "u_1" } });
      if (!r.ok) throw new Error("unreachable");
      const clauses = (r.data as { AND: Array<{ OR: unknown[] }> }).AND[0].OR;
      expect(clauses).toContainEqual({ user: { organizationId: "org_1" } });
    });
  }
});
