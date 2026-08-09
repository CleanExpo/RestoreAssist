import { describe, expect, it, vi } from "vitest";
import { loadTransitionContext } from "../load-context";

function dbFixture(input: {
  delivery?: { timestamp: Date } | null;
  invoice?: { id: string; status: string } | null;
  unreconciledPayment?: { id: string } | null;
}) {
  return {
    inspection: {
      findUnique: vi.fn().mockResolvedValue({
        reportId: "report-1",
        report: { status: "COMPLETED" },
        handoverCompletedAt: null,
      }),
    },
    invoice: {
      findFirst: vi
        .fn()
        .mockResolvedValue(
          input.invoice === undefined
            ? { id: "invoice-1", status: "PAID" }
            : input.invoice,
        ),
    },
    invoicePayment: {
      findFirst: vi.fn().mockResolvedValue(input.unreconciledPayment ?? null),
    },
    auditLog: {
      findFirst: vi.fn().mockResolvedValue(input.delivery ?? null),
    },
  };
}

describe("loadTransitionContext — report delivery evidence", () => {
  it("hydrates the latest explicit insurer-share audit", async () => {
    const sentAt = new Date("2026-08-09T03:00:00.000Z");
    const db = dbFixture({ delivery: { timestamp: sentAt } });

    const context = await loadTransitionContext(db as never, "inspection-1");

    expect(context.reportDeliveredAt).toEqual(sentAt);
    expect(db.invoice.findFirst).toHaveBeenCalledWith({
      where: {
        reportId: "report-1",
        source: "inspection:inspection-1",
      },
      orderBy: { invoiceDate: "desc" },
      select: { id: true, status: true },
    });
    expect(db.auditLog.findFirst).toHaveBeenCalledWith({
      where: {
        inspectionId: "inspection-1",
        action: "REPORT_SHARED_WITH_INSURER",
        entityType: "Report",
        entityId: "report-1",
      },
      orderBy: { timestamp: "desc" },
      select: { timestamp: true },
    });
  });

  it("returns no delivery evidence when only report status is complete", async () => {
    const db = dbFixture({ delivery: null });

    const context = await loadTransitionContext(db as never, "inspection-1");

    expect(context.reportStatus).toBe("COMPLETED");
    expect(context.reportDeliveredAt).toBeNull();
  });

  it("flags a PAID invoice backed by an unreconciled payment", async () => {
    const db = dbFixture({
      delivery: { timestamp: new Date("2026-08-09T03:00:00.000Z") },
      unreconciledPayment: { id: "payment-1" },
    });

    const context = await loadTransitionContext(db as never, "inspection-1");

    expect(context.invoiceStatus).toBe("PAID");
    expect(context.invoiceHasUnreconciledPayment).toBe(true);
    expect(db.invoicePayment.findFirst).toHaveBeenCalledWith({
      where: { invoiceId: "invoice-1", reconciled: false },
      select: { id: true },
    });
  });

  it("does not accept a non-canonical report invoice as payment evidence", async () => {
    const db = dbFixture({ invoice: null });

    const context = await loadTransitionContext(db as never, "inspection-1");

    expect(context.invoiceStatus).toBeNull();
    expect(db.invoicePayment.findFirst).not.toHaveBeenCalled();
  });
});
