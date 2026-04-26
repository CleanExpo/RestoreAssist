import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock prisma BEFORE the SUT imports it. Vitest hoists vi.mock calls so this
// is safe at module-top.
vi.mock("@/lib/prisma", () => {
  const fns = {
    create: vi.fn(),
    count: vi.fn(),
    findMany: vi.fn(),
  };
  const claimFns = { findMany: vi.fn() };
  return {
    prisma: {
      progressTelemetryEvent: fns,
      claimProgress: claimFns,
    },
  };
});

import { prisma } from "@/lib/prisma";
import {
  PROGRESS_TELEMETRY_EVENTS,
  emit,
  recordTransitionAttempt,
  recordTransitionSuccess,
  recordTransitionBlocked,
  recordEvidenceMissing,
} from "../progress";
import {
  FUNNEL_TRANSITION_KEY,
  computeFunnel,
  computeAllFunnels,
} from "../funnels";
import { computeOverrideRate, computeTimeToInvoice } from "../kpis";

const create = (prisma as unknown as {
  progressTelemetryEvent: { create: ReturnType<typeof vi.fn> };
}).progressTelemetryEvent.create;

const count = (prisma as unknown as {
  progressTelemetryEvent: { count: ReturnType<typeof vi.fn> };
}).progressTelemetryEvent.count;

const findMany = (prisma as unknown as {
  progressTelemetryEvent: { findMany: ReturnType<typeof vi.fn> };
}).progressTelemetryEvent.findMany;

const claimFindMany = (prisma as unknown as {
  claimProgress: { findMany: ReturnType<typeof vi.fn> };
}).claimProgress.findMany;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("progress telemetry — event catalogue", () => {
  it("declares exactly 8 event names", () => {
    expect(PROGRESS_TELEMETRY_EVENTS).toHaveLength(8);
  });

  it("includes every event from UX paper §8", () => {
    expect(PROGRESS_TELEMETRY_EVENTS).toContain("progress.transition.attempt");
    expect(PROGRESS_TELEMETRY_EVENTS).toContain("progress.transition.success");
    expect(PROGRESS_TELEMETRY_EVENTS).toContain("progress.transition.blocked");
    expect(PROGRESS_TELEMETRY_EVENTS).toContain("progress.transition.override");
    expect(PROGRESS_TELEMETRY_EVENTS).toContain(
      "progress.attestation.captured",
    );
    expect(PROGRESS_TELEMETRY_EVENTS).toContain("progress.evidence.missing");
    expect(PROGRESS_TELEMETRY_EVENTS).toContain("progress.offline.queued");
    expect(PROGRESS_TELEMETRY_EVENTS).toContain("progress.offline.synced");
  });
});

describe("progress telemetry — emit()", () => {
  it("writes the event to ProgressTelemetryEvent", async () => {
    create.mockResolvedValueOnce({ id: "evt_1" });

    await emit({
      eventName: "progress.transition.success",
      claimProgressId: "cp_1",
      transitionKey: "approve_scope",
      userId: "u_1",
      payload: { from: "SCOPE_DRAFT", to: "SCOPE_APPROVED" },
    });

    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventName: "progress.transition.success",
        claimProgressId: "cp_1",
        transitionKey: "approve_scope",
        userId: "u_1",
      }),
    });
  });

  it("never throws when the DB write fails", async () => {
    create.mockRejectedValueOnce(new Error("DB down"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      emit({ eventName: "progress.transition.attempt" }),
    ).resolves.toBeUndefined();

    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it("convenience emitters fill in eventName", async () => {
    create.mockResolvedValue({});

    await recordTransitionAttempt({ transitionKey: "k1" });
    await recordTransitionSuccess({ transitionKey: "k1" });
    await recordTransitionBlocked({ transitionKey: "k1" });
    await recordEvidenceMissing({ gateKey: "g1" });

    expect(create.mock.calls.map((c) => c[0].data.eventName)).toEqual([
      "progress.transition.attempt",
      "progress.transition.success",
      "progress.transition.blocked",
      "progress.evidence.missing",
    ]);
  });
});

describe("progress telemetry — funnels", () => {
  it("declares 4 funnels mapped to the canonical transition keys", () => {
    expect(Object.keys(FUNNEL_TRANSITION_KEY).sort()).toEqual([
      "drying",
      "invoice",
      "scope",
      "stabilisation",
    ]);
    expect(FUNNEL_TRANSITION_KEY.stabilisation).toBe("attest_stabilisation");
    expect(FUNNEL_TRANSITION_KEY.scope).toBe("approve_scope");
    expect(FUNNEL_TRANSITION_KEY.drying).toBe("certify_drying");
    expect(FUNNEL_TRANSITION_KEY.invoice).toBe("issue_invoice");
  });

  it("computes successRate = successes / attempts", async () => {
    count
      .mockResolvedValueOnce(10) // attempts
      .mockResolvedValueOnce(7) // successes
      .mockResolvedValueOnce(2); // blocked

    const stat = await computeFunnel("scope");

    expect(stat.attempts).toBe(10);
    expect(stat.successes).toBe(7);
    expect(stat.blocked).toBe(2);
    expect(stat.successRate).toBeCloseTo(0.7);
  });

  it("returns successRate = 0 when there are no attempts", async () => {
    count.mockResolvedValue(0);

    const stat = await computeFunnel("invoice");

    expect(stat.attempts).toBe(0);
    expect(stat.successRate).toBe(0);
  });

  it("computeAllFunnels returns 4 entries", async () => {
    count.mockResolvedValue(0);

    const all = await computeAllFunnels();

    expect(all).toHaveLength(4);
    expect(all.map((s) => s.funnel).sort()).toEqual([
      "drying",
      "invoice",
      "scope",
      "stabilisation",
    ]);
  });
});

describe("progress telemetry — KPIs", () => {
  it("overrideRate = overrides / (overrides + blocked)", async () => {
    count
      .mockResolvedValueOnce(3) // overrides
      .mockResolvedValueOnce(17); // blocked

    const k = await computeOverrideRate();

    expect(k.overrides).toBe(3);
    expect(k.blocked).toBe(17);
    expect(k.rate).toBeCloseTo(3 / 20);
  });

  it("overrideRate = 0 when no signal at all", async () => {
    count.mockResolvedValue(0);

    const k = await computeOverrideRate();

    expect(k.rate).toBe(0);
  });

  it("timeToInvoice returns medianHours = null with zero samples", async () => {
    findMany.mockResolvedValueOnce([]);

    const k = await computeTimeToInvoice();

    expect(k.medianHours).toBeNull();
    expect(k.sampleCount).toBe(0);
  });

  it("timeToInvoice computes the median across paired claim createdAt and event createdAt", async () => {
    const claimCreated = new Date("2026-04-01T00:00:00Z");
    const ev1 = new Date("2026-04-01T05:00:00Z"); // 5h
    const ev2 = new Date("2026-04-02T05:00:00Z"); // 29h
    const ev3 = new Date("2026-04-01T15:00:00Z"); // 15h
    findMany.mockResolvedValueOnce([
      { claimProgressId: "c1", createdAt: ev1 },
      { claimProgressId: "c2", createdAt: ev2 },
      { claimProgressId: "c3", createdAt: ev3 },
    ]);
    claimFindMany.mockResolvedValueOnce([
      { id: "c1", createdAt: claimCreated },
      { id: "c2", createdAt: claimCreated },
      { id: "c3", createdAt: claimCreated },
    ]);

    const k = await computeTimeToInvoice();

    // sorted: 5, 15, 29 → median = 15
    expect(k.sampleCount).toBe(3);
    expect(k.medianHours).toBeCloseTo(15);
  });

  it("timeToInvoice averages the two middle samples on even counts", async () => {
    const claim = new Date("2026-04-01T00:00:00Z");
    findMany.mockResolvedValueOnce([
      { claimProgressId: "c1", createdAt: new Date("2026-04-01T01:00:00Z") }, // 1h
      { claimProgressId: "c2", createdAt: new Date("2026-04-01T03:00:00Z") }, // 3h
      { claimProgressId: "c3", createdAt: new Date("2026-04-01T05:00:00Z") }, // 5h
      { claimProgressId: "c4", createdAt: new Date("2026-04-01T11:00:00Z") }, // 11h
    ]);
    claimFindMany.mockResolvedValueOnce([
      { id: "c1", createdAt: claim },
      { id: "c2", createdAt: claim },
      { id: "c3", createdAt: claim },
      { id: "c4", createdAt: claim },
    ]);

    const k = await computeTimeToInvoice();

    // sorted: 1, 3, 5, 11 → median = (3+5)/2 = 4
    expect(k.medianHours).toBeCloseTo(4);
  });

  it("timeToInvoice ignores events with negative skew (clock drift)", async () => {
    findMany.mockResolvedValueOnce([
      {
        claimProgressId: "c1",
        createdAt: new Date("2026-03-31T23:00:00Z"),
      }, // before claim
      {
        claimProgressId: "c2",
        createdAt: new Date("2026-04-01T02:00:00Z"),
      }, // 2h after
    ]);
    claimFindMany.mockResolvedValueOnce([
      { id: "c1", createdAt: new Date("2026-04-01T00:00:00Z") },
      { id: "c2", createdAt: new Date("2026-04-01T00:00:00Z") },
    ]);

    const k = await computeTimeToInvoice();

    expect(k.sampleCount).toBe(1);
    expect(k.medianHours).toBeCloseTo(2);
  });
});
