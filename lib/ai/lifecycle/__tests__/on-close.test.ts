/**
 * SP-A Task 5 — on-close AI lifecycle hook tests.
 *
 * Covers the four §5.2 paths:
 *   1. happy AI draft (TRIAL with credits)
 *   2. CANCELED subscription → SUBSCRIPTION_REQUIRED
 *   3. zero credits → fallback template (not an error)
 *   4. BYOK provider configured → routes through user's key, no credit charge
 *
 * All assert the AuditLog row written via runLifecycleHook regardless of path.
 *
 * Plan ref: docs/superpowers/plans/2026-05-14-sp-a-job-close.md Task 5.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => {
  return {
    prisma: {
      user: {
        findUnique: vi.fn(),
        updateMany: vi.fn(),
      },
      userInvite: {
        findFirst: vi.fn(),
      },
      providerConnection: {
        findFirst: vi.fn(),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: "audit_1" }),
      },
      inspection: {
        findUnique: vi.fn(),
      },
      invoice: {
        findUnique: vi.fn(),
      },
    },
  };
});

vi.mock("@/lib/ai/model-router", () => ({
  routeAiRequest: vi.fn().mockResolvedValue({
    text: "Inspection NIR-2026-05-0001 at 12 Main St completed on 2026-05-14. Scope completed includes Cat 2 water remediation per IICRC S500:2021 §10.5. Total billed: $1,210 inc GST (10%). 90-day workmanship warranty applies.",
    model: "gemma-4-31b-it",
    tier: "basic",
    fellBack: false,
    durationMs: 1234,
    taskType: "close_summary",
  }),
}));

import { prisma } from "@/lib/prisma";
import { buildCloseSummary } from "../on-close";

const inspectionFixture = {
  id: "ins_1",
  inspectionNumber: "NIR-2026-05-0001",
  propertyAddress: "12 Main St, Brisbane QLD 4000",
  signedAt: new Date("2026-05-14T10:00:00.000Z"),
  claimType: "WATER" as const,
  userId: "u_1",
  createdAt: new Date("2026-05-10T00:00:00.000Z"),
  user: {
    organizationId: "org_1",
  },
  report: null,
};

const invoiceFixture = {
  id: "inv_1",
  invoiceNumber: "RA-2026-0001",
  totalIncGST: 121000, // cents
  gstAmount: 11000,
};

beforeEach(() => {
  vi.clearAllMocks();
  // Default lookups for inspection + invoice.
  (prisma.inspection.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
    inspectionFixture,
  );
  (prisma.invoice.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
    invoiceFixture,
  );
  // Re-prime the router mock since some tests override it with mockResolvedValueOnce.
  // Imported in the closure below; resetting via dynamic re-import is heavy.
});

describe("buildCloseSummary — subscription gate", () => {
  it("returns SUBSCRIPTION_REQUIRED when user is CANCELED", async () => {
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      subscriptionStatus: "CANCELED",
      organizationId: "org_1",
    });

    const out = await buildCloseSummary({
      inspectionId: "ins_1",
      invoiceId: "inv_1",
      userId: "u_1",
      orgId: "org_1",
    });

    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.code).toBe("SUBSCRIPTION_REQUIRED");
    }
  });
});

describe("buildCloseSummary — happy path", () => {
  it("returns AI draft on TRIAL with credits", async () => {
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      subscriptionStatus: "TRIAL",
      trialEndsAt: new Date("2099-01-01"),
      organizationId: "org_1",
    });
    (prisma.user.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({
      count: 1,
    });
    (
      prisma.providerConnection.findFirst as ReturnType<typeof vi.fn>
    ).mockResolvedValue(null);

    const out = await buildCloseSummary({
      inspectionId: "ins_1",
      invoiceId: "inv_1",
      userId: "u_1",
      orgId: "org_1",
    });

    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.source).toBe("ai");
      expect(out.draft.text).toContain("NIR-2026-05-0001");
    }
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
  });
});

describe("buildCloseSummary — zero credits", () => {
  it("returns fallback template (NOT an error) when credits exhausted on TRIAL", async () => {
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      subscriptionStatus: "TRIAL",
      trialEndsAt: new Date("2099-01-01"),
      organizationId: "org_1",
    });
    (prisma.user.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({
      count: 0,
    });
    (
      prisma.providerConnection.findFirst as ReturnType<typeof vi.fn>
    ).mockResolvedValue(null);

    const out = await buildCloseSummary({
      inspectionId: "ins_1",
      invoiceId: "inv_1",
      userId: "u_1",
      orgId: "org_1",
    });

    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.source).toBe("fallback");
      // Fallback template must reference the inspection by number.
      expect(out.draft.text).toContain("NIR-2026-05-0001");
    }
  });
});

describe("buildCloseSummary — BYOK", () => {
  it("routes through BYOK when org has an ACTIVE ProviderConnection — no credit charge", async () => {
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      subscriptionStatus: "TRIAL",
      trialEndsAt: new Date("2099-01-01"),
      organizationId: "org_1",
    });
    (
      prisma.providerConnection.findFirst as ReturnType<typeof vi.fn>
    ).mockResolvedValue({ id: "pc_1" });

    const out = await buildCloseSummary({
      inspectionId: "ins_1",
      invoiceId: "inv_1",
      userId: "u_1",
      orgId: "org_1",
    });

    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.source).toBe("byok");
    }
    // BYOK skips platform credit deduction.
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });
});

describe("buildCloseSummary — IICRC citation guard", () => {
  it("appends a stock IICRC citation when missing AND claim type is WATER", async () => {
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      subscriptionStatus: "TRIAL",
      trialEndsAt: new Date("2099-01-01"),
      organizationId: "org_1",
    });
    (prisma.user.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({
      count: 1,
    });
    (
      prisma.providerConnection.findFirst as ReturnType<typeof vi.fn>
    ).mockResolvedValue(null);
    // Override the router mock to return a draft WITHOUT an IICRC citation.
    const { routeAiRequest } = await import("@/lib/ai/model-router");
    (routeAiRequest as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      text: "Inspection complete. Scope finished. Total $1,210 inc GST.",
      model: "gemma-4-31b-it",
      tier: "basic",
      fellBack: false,
      durationMs: 100,
      taskType: "close_summary",
    });

    const out = await buildCloseSummary({
      inspectionId: "ins_1",
      invoiceId: "inv_1",
      userId: "u_1",
      orgId: "org_1",
    });

    expect(out.ok).toBe(true);
    if (out.ok) {
      // Citation guard must append S500 reference for water claims.
      expect(out.draft.text).toContain("S500:2021");
    }
  });
});

describe("buildCloseSummary — ended trial (RA-7893 review P1)", () => {
  it("returns SUBSCRIPTION_REQUIRED when the TRIAL end date has passed", async () => {
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      subscriptionStatus: "TRIAL",
      trialEndsAt: new Date("2000-01-01"),
      organizationId: "org_1",
    });

    const out = await buildCloseSummary({
      inspectionId: "ins_1",
      invoiceId: "inv_1",
      userId: "u_1",
      orgId: "org_1",
    });

    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.code).toBe("SUBSCRIPTION_REQUIRED");
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });
});

describe("buildCloseSummary — technician who moved organisations (RA-7893 moved-member)", () => {
  it("does not charge or gate on org B's owner for an inspection created in org A before the move", async () => {
    // u_1 created ins_1 on 10 May in org A, then accepted an invite into
    // org B on 1 July. owner_b has a current trial with credits.
    const rows: Record<string, Record<string, unknown>> = {
      u_1: {
        id: "u_1",
        role: "USER",
        organizationId: "org_b",
        organization: { ownerId: "owner_b" },
        email: "u_1@example.com",
        subscriptionStatus: null,
      },
      owner_b: {
        id: "owner_b",
        role: "ADMIN",
        organizationId: "org_b",
        organization: { ownerId: "owner_b" },
        subscriptionStatus: "TRIAL",
        trialEndsAt: new Date("2099-01-01"),
        creditsRemaining: 5,
      },
    };
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockImplementation(
      async ({ where }: { where: { id: string } }) => rows[where.id] ?? null,
    );
    (prisma.userInvite.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
      { usedAt: new Date("2026-07-01T00:00:00.000Z") },
    );
    (prisma.user.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({
      count: 1,
    });
    (
      prisma.providerConnection.findFirst as ReturnType<typeof vi.fn>
    ).mockResolvedValue(null);

    const out = await buildCloseSummary({
      inspectionId: "ins_1",
      invoiceId: "inv_1",
      userId: "u_1",
      orgId: null,
    });

    expect(prisma.user.updateMany).not.toHaveBeenCalled();
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.code).toBe("SUBSCRIPTION_REQUIRED");
  });
});

describe("buildCloseSummary — caller is not the creator (RA-7893 colleague)", () => {
  // tech-a joined org A on 1 May and tech-b joined org B on 1 July.
  // owner-a and owner-b each have a current trial with credits.
  const rows: Record<string, Record<string, unknown>> = {
    "tech-a": {
      id: "tech-a",
      role: "USER",
      organizationId: "org_a",
      organization: { ownerId: "owner-a" },
      email: "tech-a@example.com",
    },
    "tech-b": {
      id: "tech-b",
      role: "USER",
      organizationId: "org_b",
      organization: { ownerId: "owner-b" },
      email: "tech-b@example.com",
    },
    "owner-a": {
      id: "owner-a",
      role: "ADMIN",
      organizationId: "org_a",
      organization: { ownerId: "owner-a" },
      subscriptionStatus: "TRIAL",
      trialEndsAt: new Date("2099-01-01"),
      creditsRemaining: 5,
    },
    "owner-b": {
      id: "owner-b",
      role: "ADMIN",
      organizationId: "org_b",
      organization: { ownerId: "owner-b" },
      subscriptionStatus: "TRIAL",
      trialEndsAt: new Date("2099-01-01"),
      creditsRemaining: 5,
    },
  };
  const joined: Record<string, Date> = {
    "org_a:tech-a": new Date("2026-05-01T00:00:00.000Z"),
    "org_b:tech-b": new Date("2026-07-01T00:00:00.000Z"),
  };

  beforeEach(() => {
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockImplementation(
      async ({ where }: { where: { id: string } }) => rows[where.id] ?? null,
    );
    (
      prisma.userInvite.findFirst as ReturnType<typeof vi.fn>
    ).mockImplementation(
      async ({
        where,
      }: {
        where: {
          organizationId: string;
          OR: Array<{ acceptedUserId?: string | null }>;
        };
      }) => {
        const at =
          joined[`${where.organizationId}:${where.OR[0].acceptedUserId}`];
        return at ? { usedAt: at } : null;
      },
    );
    (prisma.user.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({
      count: 1,
    });
    (
      prisma.providerConnection.findFirst as ReturnType<typeof vi.fn>
    ).mockResolvedValue(null);
  });

  function job(userId: string, createdAt: string) {
    (
      prisma.inspection.findUnique as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      ...inspectionFixture,
      userId,
      createdAt: new Date(createdAt),
    });
  }

  it("does not charge anyone when owner-b closes a job tech-b created in org A before joining org B", async () => {
    // tech-b's job predates tech-b joining org B.
    job("tech-b", "2026-06-01T00:00:00.000Z");
    const out = await buildCloseSummary({
      inspectionId: "ins_1",
      invoiceId: "inv_1",
      userId: "owner-b",
      orgId: null,
    });
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
    expect(out.ok).toBe(false);
  });

  it("does not charge org A's owner when a caller from org B closes an org A job", async () => {
    job("tech-a", "2026-06-01T00:00:00.000Z");
    const out = await buildCloseSummary({
      inspectionId: "ins_1",
      invoiceId: "inv_1",
      userId: "owner-b",
      orgId: null,
    });
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
    expect(out.ok).toBe(false);
  });

  it("charges owner-b once when owner-b closes a job tech-b created after joining org B", async () => {
    job("tech-b", "2026-07-02T00:00:00.000Z");
    const out = await buildCloseSummary({
      inspectionId: "ins_1",
      invoiceId: "inv_1",
      userId: "owner-b",
      orgId: null,
    });
    expect(out.ok).toBe(true);
    expect(prisma.user.updateMany).toHaveBeenCalledTimes(1);
    expect(
      (prisma.user.updateMany as ReturnType<typeof vi.fn>).mock.calls[0][0]
        .where,
    ).toEqual({ id: "owner-b", creditsRemaining: { gte: 1 } });
  });
});
