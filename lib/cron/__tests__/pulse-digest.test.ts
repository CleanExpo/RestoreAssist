import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const inspectionFindMany = vi.fn();
const dryingGoalFindMany = vi.fn();
const workflowFindMany = vi.fn();
const reportApprovalFindMany = vi.fn();
const clientCommsLogGroupBy = vi.fn();
const dispatchPulseNotification = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: { findMany: (...a: unknown[]) => inspectionFindMany(...a) },
    dryingGoalRecord: {
      findMany: (...a: unknown[]) => dryingGoalFindMany(...a),
    },
    inspectionWorkflow: {
      findMany: (...a: unknown[]) => workflowFindMany(...a),
    },
    reportApproval: {
      findMany: (...a: unknown[]) => reportApprovalFindMany(...a),
    },
    clientCommsLog: {
      groupBy: (...a: unknown[]) => clientCommsLogGroupBy(...a),
    },
  },
}));

vi.mock("@/lib/pulse/dispatcher", () => ({
  dispatchPulseNotification: (...a: unknown[]) =>
    dispatchPulseNotification(...a),
}));

import { runPulseDigest } from "../pulse-digest";

// 2026-07-06 is a Monday; 2026-08-03 is exactly 4 weeks (20 business days)
// later, also a Monday (see lib/pulse/__tests__/business-days.test.ts).
const JOB_CREATED_AT = new Date("2026-07-06T00:00:00Z");
const TWENTY_BUSINESS_DAYS_LATER = new Date("2026-08-03T00:00:00Z");

function trackedJob(overrides: Partial<{ readings: unknown[] }> = {}) {
  return {
    id: "insp_1",
    status: "SCOPED",
    createdAt: JOB_CREATED_AT,
    report: { id: "report_1", status: null },
    affectedAreas: [{ id: "a1", roomZoneId: "Master Bedroom" }],
    moistureReadings:
      overrides.readings ??
      [
        {
          location: "Master Bedroom",
          surfaceType: "plasterboard",
          moistureLevel: 40,
          recordedAt: new Date("2026-07-01T00:00:00Z"),
        },
        {
          location: "Master Bedroom",
          surfaceType: "plasterboard",
          moistureLevel: 1.0,
          recordedAt: TWENTY_BUSINESS_DAYS_LATER,
        },
      ],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(TWENTY_BUSINESS_DAYS_LATER);

  dryingGoalFindMany.mockResolvedValue([]);
  workflowFindMany.mockResolvedValue([]);
  reportApprovalFindMany.mockResolvedValue([]);
  clientCommsLogGroupBy.mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("runPulseDigest — job selection", () => {
  it("queries only pulseEnabled, active-status jobs with a bounded take", async () => {
    inspectionFindMany.mockResolvedValueOnce([]);

    await runPulseDigest();

    expect(inspectionFindMany).toHaveBeenCalledTimes(1);
    const arg = inspectionFindMany.mock.calls[0][0];
    expect(arg.where.pulseEnabled).toBe(true);
    expect(arg.where.status.in).toEqual(
      expect.arrayContaining([
        "DRAFT",
        "SUBMITTED",
        "PROCESSING",
        "CLASSIFIED",
        "SCOPED",
        "ESTIMATED",
      ]),
    );
    expect(arg.where.status.in).not.toEqual(
      expect.arrayContaining(["CLOSED", "ARCHIVED", "COMPLETED"]),
    );
    expect(typeof arg.take).toBe("number");
    expect(arg.take).toBeGreaterThan(0);
  });
});

describe("runPulseDigest — daily digest vs CoP backstop", () => {
  it("dispatches only the digest when it has content, and skips the CoP check", async () => {
    inspectionFindMany.mockResolvedValueOnce([trackedJob()]);
    dispatchPulseNotification.mockResolvedValueOnce({
      status: "SENT",
      logId: "log_1",
      templateKey: "pulse-daily-digest",
    });

    const result = await runPulseDigest();

    expect(dispatchPulseNotification).toHaveBeenCalledTimes(1);
    expect(dispatchPulseNotification.mock.calls[0][0]).toMatchObject({
      inspectionId: "insp_1",
      event: { type: "DAILY_DIGEST" },
    });
    expect(result.metadata).toMatchObject({ digestsSent: 1, copUpdatesSent: 0 });
  });

  it("fires the CoP update when there is no digest content and 20+ business days have elapsed since the last SENT update", async () => {
    inspectionFindMany.mockResolvedValueOnce([trackedJob({ readings: [] })]);
    clientCommsLogGroupBy.mockResolvedValueOnce([]); // no prior SENT row -> falls back to job.createdAt
    dispatchPulseNotification.mockResolvedValueOnce({
      status: "SENT",
      logId: "log_2",
      templateKey: "pulse-cop-update",
    });

    const result = await runPulseDigest();

    expect(dispatchPulseNotification).toHaveBeenCalledTimes(1);
    expect(dispatchPulseNotification.mock.calls[0][0]).toMatchObject({
      inspectionId: "insp_1",
      event: { type: "COP_UPDATE" },
    });
    expect(result.metadata).toMatchObject({ digestsSent: 0, copUpdatesSent: 1 });
  });

  it("does not fire the CoP update when a client-visible update was sent recently (< 20 business days)", async () => {
    inspectionFindMany.mockResolvedValueOnce([trackedJob({ readings: [] })]);
    // Last SENT row 5 business days ago (2026-07-27 is a Monday, well inside
    // the 20-business-day window ending 2026-08-03).
    clientCommsLogGroupBy.mockResolvedValueOnce([
      {
        inspectionId: "insp_1",
        _max: { createdAt: new Date("2026-07-27T00:00:00Z") },
      },
    ]);

    const result = await runPulseDigest();

    expect(dispatchPulseNotification).not.toHaveBeenCalled();
    expect(result.metadata).toMatchObject({ digestsSent: 0, copUpdatesSent: 0 });
  });
});
