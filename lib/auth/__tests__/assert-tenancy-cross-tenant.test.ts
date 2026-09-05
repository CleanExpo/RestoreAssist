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
  assertReportTenancy,
  resolveInspectionWrite,
} from "../assert-tenancy";

/**
 * Cross-tenant containment for the "ADMIN" role.
 *
 * Every firm that self-registers is given `role: "ADMIN"` over its own account
 * (`app/api/auth/register/route.ts`). The tenancy helpers treated that word as
 * a GLOBAL bypass and looked records up by id with no ownership check, across
 * ~100 routes carrying claim photographs, moisture readings, hazard
 * assessments and property addresses. One firm holding another firm's record
 * id could read and write it.
 *
 * "ADMIN" means *the owner of this tenant*. It has never meant *RestoreAssist
 * staff*. Genuine cross-tenant support access is a separate, allowlisted
 * authority — the same rule `verifyStorePublishingOperator` already applies:
 * "tenant ADMIN is not sufficient authority... Missing or empty configuration
 * deliberately fails closed."
 */

const p = prisma as unknown as {
  user: { findUnique: ReturnType<typeof vi.fn> };
  report: { findUnique: ReturnType<typeof vi.fn> };
  inspection: {
    findUnique: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
  };
};

const ATTACKER = { user: { id: "u_firm_a", role: "ADMIN" } };

beforeEach(() => {
  p.user.findUnique.mockReset();
  p.report.findUnique.mockReset();
  p.inspection.findUnique.mockReset();
  p.inspection.findFirst.mockReset();
  vi.unstubAllEnvs();
});

/** Firm A's admin, belonging to org A. */
function callerIsFirmAAdmin() {
  p.user.findUnique.mockResolvedValue({
    role: "ADMIN",
    organizationId: "org_a",
  });
}

describe("a tenant ADMIN cannot reach another tenant's records", () => {
  it("refuses an inspection owned by a different firm", async () => {
    callerIsFirmAAdmin();
    // The unscoped lookup the bug used WOULD find it — that is the breach.
    p.inspection.findUnique.mockResolvedValue({
      id: "insp_firm_b",
      userId: "u_firm_b",
      workspaceId: null,
    });
    // A correctly scoped lookup finds nothing, because it belongs to org B.
    p.inspection.findFirst.mockResolvedValue(null);

    const r = await assertInspectionTenancy(ATTACKER, "insp_firm_b");

    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    // 404, not 403 — a tenant must not learn the id exists.
    expect(r.status).toBe(404);
  });

  it("refuses to hand back a write scope for another firm's inspection", async () => {
    callerIsFirmAAdmin();
    // Same shape: the unscoped lookup would succeed, the scoped one must not.
    p.inspection.findUnique.mockResolvedValue({ id: "insp_firm_b" });
    p.inspection.findFirst.mockResolvedValue(null);

    const r = await resolveInspectionWrite(ATTACKER, "insp_firm_b");

    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.status).toBe(404);
  });

  it("never returns an unscoped write filter to a tenant ADMIN", async () => {
    callerIsFirmAAdmin();
    p.inspection.findFirst.mockResolvedValue({ id: "insp_own" });

    const r = await resolveInspectionWrite(ATTACKER, "insp_own");

    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    // The bug returned `{ id }` alone. A bare id filter is what let a later
    // update touch a record the caller does not own.
    expect(r.data.inspectionManyWhere).not.toEqual({ id: "insp_own" });
    expect(r.data.childInspectionFilter).toBeDefined();
  });

  it("refuses a report owned by a different firm", async () => {
    callerIsFirmAAdmin();
    p.report.findUnique.mockResolvedValue({
      id: "rep_firm_b",
      userId: "u_firm_b",
      user: { organizationId: "org_b" },
    });

    const r = await assertReportTenancy(ATTACKER, "rep_firm_b");

    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.status).toBe(404);
  });

  it("does not treat two org-less accounts as the same tenant", async () => {
    // A null organisation must never match another null organisation,
    // otherwise every solo operator shares one tenant.
    p.user.findUnique.mockResolvedValue({
      role: "ADMIN",
      organizationId: null,
    });
    p.report.findUnique.mockResolvedValue({
      id: "rep_other",
      userId: "u_other_solo",
      user: { organizationId: null },
    });

    const r = await assertReportTenancy(ATTACKER, "rep_other");

    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.status).toBe(404);
  });
});

describe("a tenant ADMIN still reaches their own firm's records", () => {
  it("allows an inspection owned by a colleague in the same organisation", async () => {
    callerIsFirmAAdmin();
    p.inspection.findFirst.mockResolvedValue({
      id: "insp_colleague",
      userId: "u_tech_a",
      workspaceId: null,
    });

    const r = await assertInspectionTenancy(ATTACKER, "insp_colleague");

    expect(r.ok).toBe(true);
  });

  it("allows a report owned by a colleague in the same organisation", async () => {
    callerIsFirmAAdmin();
    p.report.findUnique.mockResolvedValue({
      id: "rep_colleague",
      userId: "u_tech_a",
      user: { organizationId: "org_a" },
    });

    const r = await assertReportTenancy(ATTACKER, "rep_colleague");

    expect(r.ok).toBe(true);
  });
});

describe("platform support access is allowlisted and fails closed", () => {
  it("grants cross-tenant read to an allowlisted operator", async () => {
    vi.stubEnv("PLATFORM_SUPPORT_USER_IDS", "u_firm_a,u_someone_else");
    callerIsFirmAAdmin();
    p.inspection.findUnique.mockResolvedValue({
      id: "insp_firm_b",
      userId: "u_firm_b",
      workspaceId: null,
    });

    const r = await assertInspectionTenancy(ATTACKER, "insp_firm_b");

    expect(r.ok).toBe(true);
  });

  it("grants nothing when the allowlist is unset", async () => {
    vi.stubEnv("PLATFORM_SUPPORT_USER_IDS", "");
    callerIsFirmAAdmin();
    p.inspection.findUnique.mockResolvedValue({
      id: "insp_firm_b",
      userId: "u_firm_b",
      workspaceId: null,
    });
    p.inspection.findFirst.mockResolvedValue(null);

    const r = await assertInspectionTenancy(ATTACKER, "insp_firm_b");

    expect(r.ok).toBe(false);
  });

  it("does not grant support access to a non-ADMIN whose id is listed", async () => {
    // The allowlist raises an admin to platform scope; it is not a role of
    // its own and must not promote an ordinary account.
    vi.stubEnv("PLATFORM_SUPPORT_USER_IDS", "u_tech");
    p.user.findUnique.mockResolvedValue({
      role: "USER",
      organizationId: "org_a",
    });
    p.inspection.findUnique.mockResolvedValue({
      id: "insp_firm_b",
      userId: "u_firm_b",
      workspaceId: null,
    });
    p.inspection.findFirst.mockResolvedValue(null);

    const r = await assertInspectionTenancy(
      { user: { id: "u_tech", role: "USER" } },
      "insp_firm_b",
    );

    expect(r.ok).toBe(false);
  });
});
