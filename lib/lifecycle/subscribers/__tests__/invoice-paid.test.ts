/**
 * Punch-list P1 #21 — invoice-paid subscriber.
 *
 * Observes Stripe's "Invoice.status = PAID" write and notifies the tradie.
 * Does NOT advance Inspection.status — SP-A §5.3 editability invariant:
 * every output lands in a confirmation surface; the user always confirms
 * before commit. The user (not the webhook) presses "Close Job".
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { onInvoicePaid } from "../invoice-paid";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    invoice: {
      findUnique: vi.fn(),
    },
    auditLog: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    notification: {
      create: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";

const mockInvoiceFindUnique = vi.mocked(prisma.invoice.findUnique);
const mockAuditFindFirst = vi.mocked(prisma.auditLog.findFirst);
const mockAuditCreate = vi.mocked(prisma.auditLog.create);
const mockNotificationCreate = vi.mocked(prisma.notification.create);

beforeEach(() => {
  vi.clearAllMocks();
  mockAuditFindFirst.mockResolvedValue(null);
  mockAuditCreate.mockResolvedValue({} as never);
  mockNotificationCreate.mockResolvedValue({} as never);
});

describe("onInvoicePaid", () => {
  it("writes a notification and audit row when the invoice links to an inspection", async () => {
    mockInvoiceFindUnique.mockResolvedValue({
      id: "inv-1",
      userId: "user-1",
      invoiceNumber: "RA-2026-0001",
      report: {
        inspection: {
          id: "insp-1",
          userId: "user-1",
        },
      },
    } as never);

    const result = await onInvoicePaid("inv-1");

    expect(result).toEqual({ ok: true, notified: true });
    expect(mockNotificationCreate).toHaveBeenCalledTimes(1);
    const notifArg = mockNotificationCreate.mock.calls[0]![0].data;
    expect(notifArg.userId).toBe("user-1");
    expect(notifArg.link).toBe("/dashboard/inspections/insp-1");
    expect(notifArg.type).toBe("SUCCESS");

    expect(mockAuditCreate).toHaveBeenCalledTimes(1);
    const auditArg = mockAuditCreate.mock.calls[0]![0].data;
    expect(auditArg.action).toBe("INVOICE_PAID_OBSERVED");
    expect(auditArg.entityType).toBe("Invoice");
    expect(auditArg.entityId).toBe("inv-1");
    expect(auditArg.inspectionId).toBe("insp-1");
  });

  it("is idempotent — second call with prior audit row writes nothing", async () => {
    mockInvoiceFindUnique.mockResolvedValue({
      id: "inv-1",
      userId: "user-1",
      invoiceNumber: "RA-2026-0001",
      report: {
        inspection: {
          id: "insp-1",
          userId: "user-1",
        },
      },
    } as never);
    mockAuditFindFirst.mockResolvedValue({ id: "audit-existing" } as never);

    const result = await onInvoicePaid("inv-1");

    expect(result).toEqual({
      ok: true,
      notified: false,
      reason: "already_observed",
    });
    expect(mockNotificationCreate).not.toHaveBeenCalled();
    expect(mockAuditCreate).not.toHaveBeenCalled();
  });

  it("logs and exits cleanly when invoice has no linked inspection (orphan)", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockInvoiceFindUnique.mockResolvedValue({
      id: "inv-orphan",
      userId: "user-1",
      invoiceNumber: "RA-2026-0002",
      report: null,
    } as never);

    const result = await onInvoicePaid("inv-orphan");

    expect(result).toEqual({
      ok: true,
      notified: false,
      reason: "no_inspection_linked",
    });
    expect(mockNotificationCreate).not.toHaveBeenCalled();
    expect(mockAuditCreate).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("returns gracefully when the invoice row is missing", async () => {
    mockInvoiceFindUnique.mockResolvedValue(null);
    const result = await onInvoicePaid("inv-ghost");
    expect(result).toEqual({ ok: false, reason: "invoice_not_found" });
    expect(mockNotificationCreate).not.toHaveBeenCalled();
    expect(mockAuditCreate).not.toHaveBeenCalled();
  });
});
