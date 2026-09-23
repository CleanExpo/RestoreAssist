/**
 * RA-7632 — the delivery record the send route writes is the record Close Job
 * reads.
 *
 * The send route and Close Job meet only through AuditLog rows: the route
 * writes one through `recordReportSent`, and Close Job finds it through
 * `loadTransitionContext` (inspectionId + action + entityType + entityId).
 * If the two ever disagree on any of those four keys, every email "succeeds"
 * and no job can close. So this test feeds the rows produced by the SAME
 * writer the route uses into the SAME reader Close Job uses, over an in-memory
 * table whose `findFirst` honours every key of the reader's `where`.
 */

import { describe, expect, it } from "vitest";
import { InspectionStatus } from "@prisma/client";
import { recordReportSent } from "../report-delivery";
import { loadTransitionContext } from "../load-context";
import { canTransition } from "../inspection-state-machine";

const INSPECTION_ID = "inspection-1";
const REPORT_ID = "report-1";

type Row = Record<string, unknown>;

/**
 * Equality on every scalar key, `{ in: [...] }` on list keys. Any other
 * operator throws, so the fake can never silently match a filter it does not
 * understand.
 */
function matchesWhere(row: Row, where: Row): boolean {
  return Object.entries(where).every(([field, condition]) => {
    if (condition !== null && typeof condition === "object") {
      const operators = Object.keys(condition);
      if (operators.length !== 1 || operators[0] !== "in") {
        throw new Error(
          `fake db: unsupported filter on ${field}: ${JSON.stringify(condition)}`,
        );
      }
      return (condition as { in: unknown[] }).in.includes(row[field]);
    }
    return row[field] === condition;
  });
}

function memoryDatabase() {
  const auditLogs: Row[] = [];
  const emailAudits: Row[] = [];
  let sequence = 0;
  let clock = Date.parse("2026-09-21T00:00:00.000Z");

  const tx = {
    auditLog: {
      create: async ({ data }: { data: Row }) => {
        clock += 1_000;
        const row = { id: `audit-${++sequence}`, timestamp: new Date(clock), ...data };
        auditLogs.push(row);
        return row;
      },
    },
    emailAudit: {
      create: async ({ data }: { data: Row }) => {
        clock += 1_000;
        const row = { id: `email-audit-${++sequence}`, sentAt: new Date(clock), ...data };
        emailAudits.push(row);
        return row;
      },
    },
  };

  // Everything else Close Job needs is already satisfied: invoice PAID with no
  // unreconciled payment, report COMPLETED. Only the delivery record varies.
  const db = {
    inspection: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        where.id === INSPECTION_ID
          ? {
              reportId: REPORT_ID,
              report: { status: "COMPLETED" },
              handoverCompletedAt: null,
            }
          : null,
    },
    invoice: {
      findFirst: async () => ({ id: "invoice-1", status: "PAID" }),
    },
    invoicePayment: {
      findFirst: async () => null,
    },
    auditLog: {
      findFirst: async ({ where }: { where: Row }) =>
        auditLogs
          .filter((row) => matchesWhere(row, where))
          .sort(
            (a, b) =>
              (b.timestamp as Date).getTime() - (a.timestamp as Date).getTime(),
          )[0] ?? null,
    },
  };

  return { tx, db, auditLogs, emailAudits };
}

async function closeJob(db: ReturnType<typeof memoryDatabase>["db"]) {
  const context = await loadTransitionContext(db as never, INSPECTION_ID);
  return {
    context,
    result: canTransition(
      InspectionStatus.IN_BILLING,
      InspectionStatus.CLOSED,
      context,
    ),
  };
}

describe("RA-7632 — the report-sent record unlocks Close Job", () => {
  it("rows written by recordReportSent satisfy close_job's report_sent requirement", async () => {
    const { tx, db, emailAudits } = memoryDatabase();

    await recordReportSent(tx as never, {
      reportId: REPORT_ID,
      inspectionId: INSPECTION_ID,
      userId: "user-1",
      recipient: "bob@client.example",
      providerMessageId: "provider-msg-1",
    });
    const { context, result } = await closeJob(db);

    expect(context.reportDeliveredAt).toBeInstanceOf(Date);
    expect(result).toEqual({ ok: true, softGaps: ["handover_pending"] });
    expect(emailAudits).toHaveLength(1);
    expect(emailAudits[0]).toMatchObject({
      userId: "user-1",
      reportId: REPORT_ID,
      recipient: "bob@client.example",
      success: true,
    });
  });

  it("without that record, Close Job is still refused", async () => {
    const { db } = memoryDatabase();

    const { context, result } = await closeJob(db);

    expect(context.reportDeliveredAt).toBeNull();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.missing).toContain("report_sent");
  });

  it("a record for a different report does not unlock this job", async () => {
    const { tx, db, auditLogs } = memoryDatabase();

    await recordReportSent(tx as never, {
      reportId: "report-other",
      inspectionId: INSPECTION_ID,
      userId: "user-1",
      recipient: "bob@client.example",
      providerMessageId: "provider-msg-2",
    });
    const { result } = await closeJob(db);

    // The writer did write a row; the reader correctly ignored it.
    expect(auditLogs).toHaveLength(1);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.missing).toContain("report_sent");
  });
});
