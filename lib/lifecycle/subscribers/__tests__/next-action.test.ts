/**
 * Punch-list P1 #11.1 — next-action subscriber.
 *
 * Observes an `Inspection.status` transition and writes a Notification to
 * the inspection's owner (and assigned technician, if distinct) telling
 * them what to do next. Rule-driven only — a frozen `STATUS → CTA` map.
 *
 * Idempotency anchor: AuditLog row with
 *   action="NEXT_ACTION_SUGGESTED", entityType="Inspection",
 *   entityId=inspectionId, changes=JSON.stringify({status: newStatus}).
 * Repeat calls for the same (inspectionId, status) are no-ops.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { onNextAction } from "../next-action";
import { InspectionStatus } from "@prisma/client";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: {
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

const mockInspectionFindUnique = vi.mocked(prisma.inspection.findUnique);
const mockAuditFindFirst = vi.mocked(prisma.auditLog.findFirst);
const mockAuditCreate = vi.mocked(prisma.auditLog.create);
const mockNotificationCreate = vi.mocked(prisma.notification.create);

beforeEach(() => {
  vi.clearAllMocks();
  mockAuditFindFirst.mockResolvedValue(null);
  mockAuditCreate.mockResolvedValue({} as never);
  mockNotificationCreate.mockResolvedValue({} as never);
});

const baseInspection = {
  id: "insp-1",
  userId: "user-1",
  technicianId: null as string | null,
};

describe("onNextAction", () => {
  it("writes a notification + audit row for ESTIMATED (happy path)", async () => {
    mockInspectionFindUnique.mockResolvedValue(baseInspection as never);

    const result = await onNextAction("insp-1", InspectionStatus.ESTIMATED);

    expect(result).toEqual({ kind: "notified", notifiedUserIds: ["user-1"] });
    expect(mockNotificationCreate).toHaveBeenCalledTimes(1);
    const notifArg = mockNotificationCreate.mock.calls[0]![0].data;
    expect(notifArg.userId).toBe("user-1");
    expect(notifArg.title).toBe("Estimate ready");
    expect(notifArg.link).toBe("/dashboard/inspections/insp-1");

    expect(mockAuditCreate).toHaveBeenCalledTimes(1);
    const auditArg = mockAuditCreate.mock.calls[0]![0].data;
    expect(auditArg.action).toBe("NEXT_ACTION_SUGGESTED");
    expect(auditArg.entityType).toBe("Inspection");
    expect(auditArg.entityId).toBe("insp-1");
    expect(JSON.parse(auditArg.changes as string)).toEqual({
      status: "ESTIMATED",
    });
  });

  it("uses /scope link for SCOPED transition", async () => {
    mockInspectionFindUnique.mockResolvedValue(baseInspection as never);

    await onNextAction("insp-1", InspectionStatus.SCOPED);

    const notifArg = mockNotificationCreate.mock.calls[0]![0].data;
    expect(notifArg.link).toBe("/dashboard/inspections/insp-1/scope");
  });

  it("uses /handover link for CLOSED transition", async () => {
    mockInspectionFindUnique.mockResolvedValue(baseInspection as never);

    await onNextAction("insp-1", InspectionStatus.CLOSED);

    const notifArg = mockNotificationCreate.mock.calls[0]![0].data;
    expect(notifArg.link).toBe("/dashboard/inspections/insp-1/handover");
  });

  it("notifies both owner and technician when technicianId differs", async () => {
    mockInspectionFindUnique.mockResolvedValue({
      ...baseInspection,
      technicianId: "tech-2",
    } as never);

    const result = await onNextAction("insp-1", InspectionStatus.ESTIMATED);

    expect(result).toEqual({
      kind: "notified",
      notifiedUserIds: ["user-1", "tech-2"],
    });
    expect(mockNotificationCreate).toHaveBeenCalledTimes(2);
    const recipientIds = mockNotificationCreate.mock.calls.map(
      (c) => c[0].data.userId,
    );
    expect(recipientIds).toEqual(["user-1", "tech-2"]);
  });

  it("does not duplicate when technicianId equals userId", async () => {
    mockInspectionFindUnique.mockResolvedValue({
      ...baseInspection,
      technicianId: "user-1",
    } as never);

    const result = await onNextAction("insp-1", InspectionStatus.ESTIMATED);

    expect(result).toEqual({ kind: "notified", notifiedUserIds: ["user-1"] });
    expect(mockNotificationCreate).toHaveBeenCalledTimes(1);
  });

  it("skips DRAFT with no DB writes", async () => {
    const result = await onNextAction("insp-1", InspectionStatus.DRAFT);

    expect(result).toEqual({ kind: "no-op", reason: "DRAFT" });
    expect(mockInspectionFindUnique).not.toHaveBeenCalled();
    expect(mockNotificationCreate).not.toHaveBeenCalled();
    expect(mockAuditCreate).not.toHaveBeenCalled();
  });

  it("skips PROCESSING with no DB writes", async () => {
    const result = await onNextAction("insp-1", InspectionStatus.PROCESSING);

    expect(result).toEqual({ kind: "no-op", reason: "PROCESSING" });
    expect(mockNotificationCreate).not.toHaveBeenCalled();
    expect(mockAuditCreate).not.toHaveBeenCalled();
  });

  it("skips COMPLETED with no DB writes", async () => {
    const result = await onNextAction("insp-1", InspectionStatus.COMPLETED);

    expect(result).toEqual({ kind: "no-op", reason: "COMPLETED" });
    expect(mockNotificationCreate).not.toHaveBeenCalled();
    expect(mockAuditCreate).not.toHaveBeenCalled();
  });

  it("is idempotent — second call with prior audit row writes nothing", async () => {
    mockInspectionFindUnique.mockResolvedValue(baseInspection as never);
    mockAuditFindFirst.mockResolvedValue({ id: "audit-existing" } as never);

    const result = await onNextAction("insp-1", InspectionStatus.ESTIMATED);

    expect(result).toEqual({
      kind: "skipped",
      reason: "already_observed",
    });
    expect(mockNotificationCreate).not.toHaveBeenCalled();
    expect(mockAuditCreate).not.toHaveBeenCalled();
  });

  it("returns skipped when inspection is missing", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockInspectionFindUnique.mockResolvedValue(null);

    const result = await onNextAction("insp-ghost", InspectionStatus.ESTIMATED);

    expect(result).toEqual({
      kind: "skipped",
      reason: "inspection-not-found",
    });
    expect(mockNotificationCreate).not.toHaveBeenCalled();
    expect(mockAuditCreate).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("handles SUBMITTED, CLASSIFIED, REJECTED with INFO type and correct messages", async () => {
    const cases: Array<{ status: InspectionStatus; title: string }> = [
      { status: InspectionStatus.SUBMITTED, title: "AI is processing your inspection" },
      { status: InspectionStatus.CLASSIFIED, title: "Classification ready" },
      { status: InspectionStatus.REJECTED, title: "Inspection rejected" },
    ];

    for (const c of cases) {
      vi.clearAllMocks();
      mockAuditFindFirst.mockResolvedValue(null);
      mockAuditCreate.mockResolvedValue({} as never);
      mockNotificationCreate.mockResolvedValue({} as never);
      mockInspectionFindUnique.mockResolvedValue(baseInspection as never);

      const result = await onNextAction("insp-1", c.status);
      expect(result.kind).toBe("notified");
      const notifArg = mockNotificationCreate.mock.calls[0]![0].data;
      expect(notifArg.title).toBe(c.title);
    }
  });
});
