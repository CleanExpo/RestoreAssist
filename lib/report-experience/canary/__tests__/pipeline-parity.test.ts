import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * RA-8110: the canary's browser fixtures are only honest if they equal what
 * the real server pipeline produces. This builds a snapshot for every audience
 * through the REAL `authoriseReportExperienceRead` and
 * `buildReportExperienceSnapshot` (and the real RA-8494 `canSeeMoney` rule),
 * with only the database replaced, and requires `canarySnapshot` to match it
 * exactly, digest included. It does not edit or restate the money rule.
 */

const FUTURE = new Date("2099-01-01T00:00:00Z");

const db = vi.hoisted(() => ({
  users: {} as Record<string, { role: string; organizationId: string | null; organizationLeftAt: Date | null; organizationLeftId: string | null }>,
  shares: [] as Array<{ id: string; reportId: string; token: string; scope: "OWNER_VIEW" | "INSURER"; revokedAt: Date | null; expiresAt: Date }>,
}));

vi.mock("@/lib/prisma", () => {
  const report = { id: "report_canary_001", userId: "user_author", createdAt: new Date("2026-02-01T00:00:00Z") };
  return {
    prisma: {
      report: {
        findUnique: vi.fn(async () => report),
        findFirst: vi.fn(async () => report),
        count: vi.fn(async () => 1),
      },
      user: {
        findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
          const u = db.users[where.id];
          return u ? { id: where.id, ...u } : null;
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

vi.mock("@/lib/organization-credits", () => ({
  getResourceTenant: vi.fn(async () => ({ ownerId: "owner_x", organizationId: "canary_business" })),
}));

vi.mock("@/lib/auth/assert-tenancy", () => ({
  resolveReportReach: vi.fn(async () => ({ ok: true, data: {} })),
  resolveReportFinancialReach: vi.fn(async () => ({ ok: true, data: {} })),
}));

import { authoriseReportExperienceRead } from "../../authorise";
import { buildReportExperienceSnapshot } from "../../snapshot";
import { CANARY_AUDIENCES, CANARY_EVIDENCE, CANARY_SEES_MONEY, canarySnapshot, type CanaryAudience } from "../scenario";

const member = (role: string) => ({ role, organizationId: "canary_business", organizationLeftAt: null, organizationLeftId: null });

beforeEach(() => {
  db.users = {
    user_owner: member("ADMIN"),
    user_manager: member("MANAGER"),
    user_tech: member("USER"),
  };
  db.shares = [
    { id: "s1", reportId: "report_canary_001", token: "tok_owner", scope: "OWNER_VIEW", revokedAt: null, expiresAt: FUTURE },
    { id: "s2", reportId: "report_canary_001", token: "tok_insurer", scope: "INSURER", revokedAt: null, expiresAt: FUTURE },
  ];
});

async function viaRealPipeline(audience: CanaryAudience) {
  const request =
    audience === "owner" ? { session: { user: { id: "user_owner", role: "ADMIN" } } }
    : audience === "manager" ? { session: { user: { id: "user_manager", role: "MANAGER" } } }
    : audience === "technician" ? { session: { user: { id: "user_tech", role: "USER" } } }
    : audience === "property-owner" ? { session: null, shareToken: "tok_owner" }
    : { session: null, shareToken: "tok_insurer" };
  const decision = await authoriseReportExperienceRead({ reportId: "report_canary_001", ...request });
  if (!decision.ok) throw new Error("gate refused " + audience);
  expect(decision.grant.audience).toBe(audience);
  return buildReportExperienceSnapshot(CANARY_EVIDENCE, decision.grant, "2026-03-10T00:00:00.000Z");
}

describe("canary fixtures equal the real pipeline output", () => {
  for (const audience of CANARY_AUDIENCES) {
    it(`${audience}: identical snapshot, digest included`, async () => {
      const real = await viaRealPipeline(audience);
      expect(JSON.parse(JSON.stringify(canarySnapshot(audience)))).toEqual(JSON.parse(JSON.stringify(real)));
    });

    it(`${audience}: price visibility matches the stated rule`, async () => {
      const real = await viaRealPipeline(audience);
      expect("financials" in real).toBe(CANARY_SEES_MONEY[audience]);
    });
  }

  it("a technician snapshot from the real pipeline has no financials key at all (RA-8494)", async () => {
    const real = await viaRealPipeline("technician");
    expect(Object.keys(real)).not.toContain("financials");
    expect(JSON.stringify(real)).not.toContain(String(CANARY_EVIDENCE.financials!.estimatedTotalCents));
  });

  it("control: the parity check can fail, because a fixture that shows a technician the price differs", async () => {
    const real = await viaRealPipeline("technician");
    const planted = { ...canarySnapshot("owner"), audience: "technician" as const };
    expect(JSON.parse(JSON.stringify(planted))).not.toEqual(JSON.parse(JSON.stringify(real)));
  });
});
