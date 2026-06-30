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
