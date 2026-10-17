import { describe, expect, it, vi } from "vitest";
import { loadReportDeliveryFacts } from "../six-fact-delivery";

// AuditLog's time column is `timestamp`; it has no `createdAt`. Ordering by a
// column that does not exist is a Prisma validation error at runtime, so every
// delivery-state read threw before it could return a fact.
function fakePrisma(actions: string[]) {
  return {
    report: {
      findUnique: vi.fn().mockResolvedValue({
        status: "DRAFT",
        createdAt: new Date("2026-10-01T00:00:00Z"),
        updatedAt: new Date("2026-10-01T00:00:00Z"),
      }),
    },
    auditLog: {
      findMany: vi.fn().mockResolvedValue(actions.map((action) => ({ action }))),
    },
    reportApproval: { findFirst: vi.fn().mockResolvedValue(null) },
  };
}

describe("loadReportDeliveryFacts", () => {
  it("orders the report's audit trail by AuditLog.timestamp", async () => {
    const prisma = fakePrisma([]);
    await loadReportDeliveryFacts(prisma as never, "rep_1");

    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { timestamp: "desc" } }),
    );
  });

  it("derives sent and acknowledged from the audit actions it reads", async () => {
    const prisma = fakePrisma(["REPORT_SENT", "REPORT_ACKNOWLEDGED"]);
    const facts = await loadReportDeliveryFacts(prisma as never, "rep_1");

    expect(facts).toMatchObject({ sent: true, acknowledged: true });
  });
});
