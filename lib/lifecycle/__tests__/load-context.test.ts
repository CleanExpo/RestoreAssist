import { describe, expect, it, vi } from "vitest";
import { InspectionStatus } from "@prisma/client";
import { loadTransitionContext } from "../load-context";
import { canTransition } from "../inspection-state-machine";

function dbFixture(input: {
  auditEvents?: Array<{ action: string; timestamp: Date }>;
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
      findFirst: vi
        .fn()
        .mockImplementation(
          ({ where }: { where: { action: { in: string[] } } }) =>
            [...(input.auditEvents ?? [])]
              .filter((event) => where.action.in.includes(event.action))
              .sort(
                (a, b) => b.timestamp.getTime() - a.timestamp.getTime(),
              )[0] ?? null,
        ),
    },
  };
}

describe("loadTransitionContext — report delivery evidence", () => {
  it("hydrates the latest genuine report-delivery audit", async () => {
    const sentAt = new Date("2026-08-09T03:00:00.000Z");
    const db = dbFixture({
      auditEvents: [{ action: "REPORT_SENT", timestamp: sentAt }],
    });

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
        action: { in: ["REPORT_SENT", "REPORT_DELIVERED"] },
        entityType: "Report",
        entityId: "report-1",
      },
      orderBy: { timestamp: "desc" },
      select: { timestamp: true },
    });
  });

  it("does not let link generation alone satisfy close eligibility", async () => {
    const db = dbFixture({
      auditEvents: [
        {
          action: "REPORT_SHARED_WITH_INSURER",
          timestamp: new Date("2026-08-09T02:00:00.000Z"),
        },
        {
          action: "REPORT_INSURER_LINK_GENERATED",
          timestamp: new Date("2026-08-09T03:00:00.000Z"),
        },
      ],
    });

    const context = await loadTransitionContext(db as never, "inspection-1");
    const closure = canTransition(
      InspectionStatus.IN_BILLING,
      InspectionStatus.CLOSED,
      context,
    );

    expect(context.reportStatus).toBe("COMPLETED");
    expect(context.reportDeliveredAt).toBeNull();
    expect(closure.ok).toBe(false);
    if (!closure.ok) expect(closure.missing).toContain("report_sent");
  });

  it("preserves genuine delivery evidence when a link was also generated", async () => {
    const sentAt = new Date("2026-08-09T03:00:00.000Z");
    const db = dbFixture({
      auditEvents: [
        { action: "REPORT_SENT", timestamp: sentAt },
        {
          action: "REPORT_INSURER_LINK_GENERATED",
          timestamp: new Date("2026-08-09T04:00:00.000Z"),
        },
      ],
    });

    const context = await loadTransitionContext(db as never, "inspection-1");

    expect(context.reportDeliveredAt).toEqual(sentAt);
  });

  it("flags a PAID invoice backed by an unreconciled payment", async () => {
    const db = dbFixture({
      auditEvents: [
        {
          action: "REPORT_DELIVERED",
          timestamp: new Date("2026-08-09T03:00:00.000Z"),
        },
      ],
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
