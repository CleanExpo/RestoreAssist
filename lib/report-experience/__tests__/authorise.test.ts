import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * RA-8105 W1.2: the server gate in front of the report experience.
 *
 * Prisma is replaced by a small in-memory fake. The fake honours the tenancy
 * filter only when the gate puts it inside `where.AND` next to the report id,
 * and it refuses any clause it does not recognise, so a gate that drops or ORs
 * the filter fails the wrong-firm cases instead of passing them.
 */

type FakeReport = {
  id: string;
  firm: string;
  userId: string;
  createdAt: Date;
};
type FakeShare = {
  id: string;
  reportId: string;
  token: string;
  scope: "OWNER_VIEW" | "INSURER";
  revokedAt: Date | null;
  expiresAt: Date;
};

const db = vi.hoisted(() => ({
  reports: [] as FakeReport[],
  shares: [] as FakeShare[],
  tenants: {} as Record<string, { ownerId: string; organizationId: string | null } | null>,
  leftAt: {} as Record<string, Date>,
}));

function matches(report: FakeReport, clause: Record<string, unknown>): boolean {
  const keys = Object.keys(clause);
  if (keys.length === 1 && keys[0] === "id") return report.id === clause.id;
  if (keys.length === 1 && keys[0] === "__firm") return report.firm === clause.__firm;
  return false;
}

vi.mock("@/lib/prisma", () => {
  const pick = (r: FakeReport) => ({
    id: r.id, userId: r.userId, createdAt: r.createdAt,
  });
  return {
    prisma: {
      report: {
        findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
          const r = db.reports.find((x) => x.id === where.id);
          return r ? pick(r) : null;
        }),
        findFirst: vi.fn(async ({ where }: { where: { AND?: Record<string, unknown>[] } }) => {
          if (!Array.isArray(where.AND) || Object.keys(where).length !== 1) return null;
          const r = db.reports.find((x) => where.AND!.every((c) => matches(x, c)));
          return r ? pick(r) : null;
        }),
        count: vi.fn(async ({ where }: { where: { AND?: Record<string, unknown>[] } }) => {
          if (!Array.isArray(where.AND) || Object.keys(where).length !== 1) return 0;
          return db.reports.filter((x) => where.AND!.every((c) => matches(x, c))).length;
        }),
      },
      reportShareAccess: {
        findUnique: vi.fn(async ({ where }: { where: { token: string } }) => {
          const s = db.shares.find((x) => x.token === where.token);
          return s ? { ...s } : null;
        }),
        update: vi.fn(async () => ({})),
      },
    },
  };
});

const reach = vi.hoisted(() => ({
  read: null as null | { ok: true; data: Record<string, unknown> } | { ok: false; status: 401 | 403 | 404; reason: string },
  financial: null as null | { ok: true; data: Record<string, unknown> } | { ok: false; status: 401 | 403 | 404; reason: string },
}));

vi.mock("@/lib/organization-credits", () => ({
  // Same shape as the real rule: work created after the author left belongs to the author.
  getResourceTenant: vi.fn(async (userId: string, createdAt: Date) => {
    const left = db.leftAt[userId];
    if (left && createdAt.getTime() >= left.getTime()) return { ownerId: userId, organizationId: null };
    return db.tenants[userId] ?? null;
  }),
}));

vi.mock("@/lib/auth/assert-tenancy", () => ({
  resolveReportReach: vi.fn(async () => reach.read),
  resolveReportFinancialReach: vi.fn(async () => reach.financial),
}));

import * as gate from "../authorise";
import { authoriseReportExperienceRead } from "../authorise";
import { getResourceTenant } from "@/lib/organization-credits";
import { buildReportExperienceSnapshot, type VerifiedReportProjection } from "../snapshot";
import { verifyReportReaderToken } from "@/lib/report-share/access";
import { generateInsurerToken } from "@/lib/portal-token";

const NOW = new Date("2026-10-27T12:00:00Z");
const FUTURE = new Date("2026-11-20T00:00:00Z");
const PAST = new Date("2026-10-01T00:00:00Z");
const CREATED = new Date("2026-09-15T00:00:00Z");

const sessionA = { user: { id: "user_a", role: "MANAGER" } };
const firmA = { ok: true as const, data: { __firm: "business_a" } };
const firmB = { ok: true as const, data: { __firm: "business_b" } };

const evidence: VerifiedReportProjection = {
  reportId: "report_001",
  organisationId: "org_business_a",
  revision: "rev-a",
  revisionCreatedAt: "2026-10-27T08:00:00Z",
  reportNumber: "SAMPLE-001",
  status: "DRAFT",
  workspaceBrand: { businessName: "Synthetic Test Organisation" },
  safetyAssessment: "NOT_ASSESSED",
  hazards: [],
  moistureReadings: [],
  scopeItems: [],
  financials: { estimatedTotalCents: 27500, currency: "AUD", estimateStatus: "draft" },
  sourceRefs: [],
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  db.reports = [
    { id: "report_001", firm: "business_a", userId: "user_a", createdAt: CREATED },
    { id: "report_002", firm: "business_b", userId: "user_b", createdAt: CREATED },
  ];
  db.tenants = {
    user_a: { ownerId: "owner_a", organizationId: "business_a" },
    user_b: { ownerId: "owner_b", organizationId: "business_b" },
  };
  db.leftAt = {};
  db.shares = [
    { id: "s1", reportId: "report_001", token: "tok_owner_live", scope: "OWNER_VIEW", revokedAt: null, expiresAt: FUTURE },
    { id: "s2", reportId: "report_001", token: "tok_insurer_live", scope: "INSURER", revokedAt: null, expiresAt: FUTURE },
    { id: "s3", reportId: "report_001", token: "tok_revoked", scope: "INSURER", revokedAt: PAST, expiresAt: FUTURE },
    { id: "s4", reportId: "report_001", token: "tok_expired", scope: "INSURER", revokedAt: null, expiresAt: PAST },
    { id: "s5", reportId: "report_002", token: "tok_other_report", scope: "INSURER", revokedAt: null, expiresAt: FUTURE },
  ];
  reach.read = firmA;
  reach.financial = firmA;
});

const NOT_FOUND = { ok: false, status: 404 };

describe("authoriseReportExperienceRead: session path", () => {
  it("grants a member of the owning firm, bound to that report and firm", async () => {
    const result = await authoriseReportExperienceRead({ reportId: "report_001", session: sessionA });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.grant.reportId).toBe("report_001");
    expect(result.grant.organisationId).toBe("org_business_a");
    expect(result.grant.audience).toBe("manager");
    expect(result.grant.mayViewFinancials).toBe(true);
    expect(Date.parse(result.grant.expiresAt)).toBeGreaterThan(NOW.getTime());
    expect(Date.parse(result.grant.expiresAt)).toBeLessThanOrEqual(NOW.getTime() + 5 * 60 * 1000);
  });

  it("refuses a signed-in user from another firm with the plain not-found answer", async () => {
    reach.read = firmB;
    reach.financial = firmB;
    const result = await authoriseReportExperienceRead({ reportId: "report_001", session: { user: { id: "user_b", role: "ADMIN" } } });
    expect(result).toEqual(NOT_FOUND);
  });

  it("gives the same not-found answer for a report that does not exist", async () => {
    const result = await authoriseReportExperienceRead({ reportId: "report_missing", session: sessionA });
    expect(result).toEqual(NOT_FOUND);
  });

  it("withholds money when the caller can read the report but not its money", async () => {
    reach.financial = firmB;
    const result = await authoriseReportExperienceRead({ reportId: "report_001", session: { user: { id: "user_t", role: "USER" } } });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.grant.mayViewFinancials).toBe(false);
    expect(result.grant.audience).toBe("technician");
  });

  it("answers 401 only when there is neither a session nor a token", async () => {
    reach.read = { ok: false, status: 401, reason: "no session" };
    const result = await authoriseReportExperienceRead({ reportId: "report_001", session: null });
    expect(result).toEqual({ ok: false, status: 401 });
  });
});

describe("authoriseReportExperienceRead: share-token path", () => {
  it("grants a live owner link as property-owner and a live insurer link as insurer", async () => {
    const owner = await authoriseReportExperienceRead({ reportId: "report_001", session: null, shareToken: "tok_owner_live" });
    const insurer = await authoriseReportExperienceRead({ reportId: "report_001", session: null, shareToken: "tok_insurer_live" });
    expect(owner.ok && owner.grant.audience).toBe("property-owner");
    expect(insurer.ok && insurer.grant.audience).toBe("insurer");
    expect(owner.ok && owner.grant.organisationId).toBe("org_business_a");
  });

  it("refuses a revoked link", async () => {
    const result = await authoriseReportExperienceRead({ reportId: "report_001", session: null, shareToken: "tok_revoked" });
    expect(result).toEqual(NOT_FOUND);
  });

  it("refuses an expired link", async () => {
    const result = await authoriseReportExperienceRead({ reportId: "report_001", session: null, shareToken: "tok_expired" });
    expect(result).toEqual(NOT_FOUND);
  });

  it("refuses a live link that belongs to another report", async () => {
    const result = await authoriseReportExperienceRead({ reportId: "report_001", session: null, shareToken: "tok_other_report" });
    expect(result).toEqual(NOT_FOUND);
  });

  it("refuses an unknown token", async () => {
    const result = await authoriseReportExperienceRead({ reportId: "report_001", session: null, shareToken: "tok_never_issued" });
    expect(result).toEqual(NOT_FOUND);
  });

  it("refuses a legacy signed insurer token that the old reader still accepts (D-8)", async () => {
    vi.stubEnv("PORTAL_SECRET", "synthetic-test-secret-not-real");
    try {
      const legacy = generateInsurerToken("report_001");
      // Control: the old reader accepts this exact token, so the refusal below is real.
      await expect(verifyReportReaderToken(legacy)).resolves.toEqual({ reportId: "report_001", scope: "LEGACY_HMAC" });
      const result = await authoriseReportExperienceRead({ reportId: "report_001", session: null, shareToken: legacy });
      expect(result).toEqual(NOT_FOUND);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("gives a signed-in member of the owning firm the plain not-found answer when their link is revoked", async () => {
    const result = await authoriseReportExperienceRead({ reportId: "report_001", session: sessionA, shareToken: "tok_revoked" });
    expect(result).toEqual(NOT_FOUND);
  });

  it("gives a signed-in member the plain not-found answer for a legacy-shaped or unknown token", async () => {
    const result = await authoriseReportExperienceRead({ reportId: "report_001", session: sessionA, shareToken: "tok_never_issued" });
    expect(result).toEqual(NOT_FOUND);
  });

  it("gives a signed-in member the plain not-found answer for an empty or blank token", async () => {
    for (const shareToken of ["", " ", "	"]) {
      const result = await authoriseReportExperienceRead({ reportId: "report_001", session: sessionA, shareToken });
      expect(result).toEqual(NOT_FOUND);
    }
  });

  it("does not let a share link stretch past its own expiry", async () => {
    db.shares[1].expiresAt = new Date(NOW.getTime() + 60 * 1000);
    const result = await authoriseReportExperienceRead({ reportId: "report_001", session: null, shareToken: "tok_insurer_live" });
    expect(result.ok && result.grant.expiresAt).toBe(new Date(NOW.getTime() + 60 * 1000).toISOString());
  });
});

describe("report tenant", () => {
  it("keys a report by the firm that owned it when it was created", async () => {
    const result = await authoriseReportExperienceRead({ reportId: "report_001", session: sessionA });
    expect(vi.mocked(getResourceTenant)).toHaveBeenCalledWith("user_a", CREATED);
    expect(result.ok && result.grant.organisationId).toBe("org_business_a");
  });

  it("keeps a report with the firm after its author has left, and later work with the author", async () => {
    db.leftAt.user_a = PAST;
    db.reports.push({ id: "report_003", firm: "business_a", userId: "user_a", createdAt: new Date("2026-10-20T00:00:00Z") });
    db.shares.push({ id: "s6", reportId: "report_003", token: "tok_after_leaving", scope: "INSURER", revokedAt: null, expiresAt: FUTURE });
    const before = await authoriseReportExperienceRead({ reportId: "report_001", session: null, shareToken: "tok_insurer_live" });
    const after = await authoriseReportExperienceRead({ reportId: "report_003", session: null, shareToken: "tok_after_leaving" });
    expect(before.ok && before.grant.organisationId).toBe("org_business_a");
    expect(after.ok && after.grant.organisationId).toBe("usr_user_a");
  });

  it("keys a sole trader's report by person, so it can never equal a firm key", async () => {
    db.tenants.user_a = { ownerId: "business_a", organizationId: null };
    const result = await authoriseReportExperienceRead({ reportId: "report_001", session: sessionA });
    expect(result.ok && result.grant.organisationId).toBe("usr_business_a");
  });

  it("refuses when the report's firm cannot be resolved", async () => {
    db.tenants.user_a = null;
    const bySession = await authoriseReportExperienceRead({ reportId: "report_001", session: sessionA });
    const byToken = await authoriseReportExperienceRead({ reportId: "report_001", session: null, shareToken: "tok_insurer_live" });
    expect(bySession).toEqual(NOT_FOUND);
    expect(byToken).toEqual(NOT_FOUND);
  });
});

describe("snapshot builder accepts only grants the gate issued", () => {
  it("the gate module exports no way to mint a grant", () => {
    expect(Object.keys(gate).sort()).toEqual(["authoriseReportExperienceRead", "isIssuedReportReadGrant", "reportTenantKey"]);
  });
  it("builds from a gate-issued grant", async () => {
    const result = await authoriseReportExperienceRead({ reportId: "report_001", session: sessionA });
    if (!result.ok) throw new Error("expected a grant");
    const snapshot = buildReportExperienceSnapshot(evidence, result.grant, NOW.toISOString());
    expect(snapshot.reportId).toBe("report_001");
  });

  it("refuses a forged grant written as a plain object", () => {
    const forged = {
      reportId: "report_001",
      organisationId: "business_a",
      audience: "manager" as const,
      mayViewAddress: true,
      mayViewFinancials: true,
      expiresAt: "2026-10-29T08:00:00Z",
    };
    expect(() => buildReportExperienceSnapshot(evidence, forged, NOW.toISOString())).toThrow(/not issued/i);
  });

  it("refuses a copy of a real grant with a permission widened", async () => {
    reach.financial = firmB;
    const result = await authoriseReportExperienceRead({ reportId: "report_001", session: sessionA });
    if (!result.ok) throw new Error("expected a grant");
    expect(result.grant.mayViewFinancials).toBe(false);
    const widened = { ...result.grant, mayViewFinancials: true };
    expect(() => buildReportExperienceSnapshot(evidence, widened, NOW.toISOString())).toThrow(/not issued/i);
  });

  it("issued grants cannot be changed in place", async () => {
    const result = await authoriseReportExperienceRead({ reportId: "report_001", session: sessionA });
    if (!result.ok) throw new Error("expected a grant");
    expect(Object.isFrozen(result.grant)).toBe(true);
  });
});
