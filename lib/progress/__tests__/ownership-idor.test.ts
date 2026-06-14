/**
 * RA-1828 — multi-tenant IDOR regression suite for the claim-progress
 * service layer.
 *
 * The bug: getState / transition / getHistory looked up
 * `claimProgress.findUnique({ where: { reportId } })` keyed only on the
 * URL-supplied reportId, with no ownership/tenancy filter. Any authenticated
 * user (resolved to TECHNICIAN by default) could read or transition ANOTHER
 * tenant's claim by supplying that tenant's reportId.
 *
 * The fix: `assertReportOwnership` binds the caller to the Report behind the
 * reportId (Report.userId === actorUserId, ADMIN bypass) before any read or
 * write, returning NOT_FOUND (HTTP 404, no existence leak) on a tenant
 * mismatch.
 *
 * These tests prove cross-tenant denial AND that the legitimate owner path
 * still works. They mock @/lib/prisma so no DB is touched.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock prisma BEFORE the SUT imports it (vitest hoists vi.mock).
vi.mock("@/lib/prisma", () => {
  return {
    prisma: {
      report: { findUnique: vi.fn() },
      claimProgress: { findUnique: vi.fn(), updateMany: vi.fn() },
      progressTransition: { findMany: vi.fn(), create: vi.fn() },
      user: { findUnique: vi.fn() },
      $transaction: vi.fn(),
    },
  };
});

// Telemetry is fire-and-forget; stub it so tests don't depend on it.
vi.mock("@/lib/telemetry/progress", () => ({
  recordEvidenceMissing: vi.fn(),
  recordTransitionAttempt: vi.fn(),
  recordTransitionBlocked: vi.fn(),
  recordTransitionSuccess: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import {
  assertReportOwnership,
  getState,
  getHistory,
  transition,
} from "../service";
import type { ProgressRole } from "../permissions";

type Mock = ReturnType<typeof vi.fn>;
const reportFindUnique = (prisma as unknown as { report: { findUnique: Mock } })
  .report.findUnique;
const cpFindUnique = (
  prisma as unknown as { claimProgress: { findUnique: Mock } }
).claimProgress.findUnique;
const txFindMany = (
  prisma as unknown as { progressTransition: { findMany: Mock } }
).progressTransition.findMany;

const OWNER = "user_owner_A";
const ATTACKER = "user_attacker_B";
const REPORT_ID = "report_owned_by_A";
const TECH: ProgressRole = "TECHNICIAN";
const ADMIN: ProgressRole = "ADMIN";

/** Report belongs to OWNER. */
function reportOwnedByA() {
  return { id: REPORT_ID, userId: OWNER };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("assertReportOwnership (RA-1828 tenancy gate)", () => {
  it("allows the report owner", async () => {
    reportFindUnique.mockResolvedValue(reportOwnedByA());
    const res = await assertReportOwnership(REPORT_ID, OWNER, TECH);
    expect(res.ok).toBe(true);
  });

  it("denies a different tenant with NOT_FOUND (no existence leak)", async () => {
    reportFindUnique.mockResolvedValue(reportOwnedByA());
    const res = await assertReportOwnership(REPORT_ID, ATTACKER, TECH);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("NOT_FOUND");
  });

  it("denies with NOT_FOUND when the report does not exist", async () => {
    reportFindUnique.mockResolvedValue(null);
    const res = await assertReportOwnership("nope", ATTACKER, TECH);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("NOT_FOUND");
  });

  it("allows ADMIN to bypass ownership (cross-claim oversight)", async () => {
    reportFindUnique.mockResolvedValue(reportOwnedByA());
    const res = await assertReportOwnership(REPORT_ID, ATTACKER, ADMIN);
    expect(res.ok).toBe(true);
  });
});

describe("getState — cross-tenant read denial", () => {
  it("user B CANNOT read user A's progress (NOT_FOUND)", async () => {
    reportFindUnique.mockResolvedValue(reportOwnedByA());
    const res = await getState(REPORT_ID, ATTACKER, TECH);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("NOT_FOUND");
    // Ownership gate must short-circuit BEFORE the claimProgress lookup.
    expect(cpFindUnique).not.toHaveBeenCalled();
  });

  it("owner CAN read their own progress", async () => {
    reportFindUnique.mockResolvedValue(reportOwnedByA());
    cpFindUnique.mockResolvedValue({
      id: "cp_1",
      reportId: REPORT_ID,
      currentState: "INTAKE",
      version: 0,
    });
    txFindMany.mockResolvedValue([]);
    const res = await getState(REPORT_ID, OWNER, TECH);
    expect(res.ok).toBe(true);
    expect(cpFindUnique).toHaveBeenCalledTimes(1);
  });
});

describe("getHistory — cross-tenant read denial", () => {
  it("user B CANNOT read user A's history (NOT_FOUND)", async () => {
    reportFindUnique.mockResolvedValue(reportOwnedByA());
    const res = await getHistory(REPORT_ID, ATTACKER, TECH);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("NOT_FOUND");
    expect(cpFindUnique).not.toHaveBeenCalled();
  });
});

describe("transition — cross-tenant write denial", () => {
  it("user B CANNOT transition user A's claim (NOT_FOUND)", async () => {
    reportFindUnique.mockResolvedValue(reportOwnedByA());
    const res = await transition({
      reportId: REPORT_ID,
      key: "start_stabilisation",
      actorUserId: ATTACKER,
      actorRole: TECH,
      actorName: "Attacker B",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("NOT_FOUND");
    // Must deny BEFORE touching ClaimProgress / running guards / writing.
    expect(cpFindUnique).not.toHaveBeenCalled();
  });
});
