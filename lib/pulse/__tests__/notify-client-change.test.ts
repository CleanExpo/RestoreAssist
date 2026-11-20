import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Row = {
  id: string;
  inspectionId: string;
  eventType: string;
  status: string;
  suppressionReason?: string | null;
  templateKey?: string | null;
  idempotencyKey: string;
  createdAt: Date;
};

const h = vi.hoisted(() => ({
  inspectionFindUnique: vi.fn(),
  approvalFindMany: vi.fn(),
  goalFindUnique: vi.fn(),
  clientFindFirst: vi.fn(),
  send: vi.fn(),
  reportError: vi.fn(),
  requireAddon: vi.fn(),
  rows: [] as unknown[],
}));

const rows = h.rows as Row[];

// A fake log that enforces the real unique constraint, so a P2002 here is
// produced by key collision rather than scripted by the test.
vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: { findUnique: h.inspectionFindUnique },
    reportApproval: { findMany: h.approvalFindMany },
    dryingGoalRecord: { findUnique: h.goalFindUnique },
    client: {
      findFirst: h.clientFindFirst,
      findMany: async (args: unknown) => {
        const row = await h.clientFindFirst(args);
        return row ? [row] : [];
      },
    },
    user: { findMany: async () => [] },
    organization: { findUnique: async () => null, findMany: async () => [] },
    pulseOrgAddressOptOut: {
      findUnique: async () => null,
      findFirst: async () => null,
      upsert: async () => ({}),
    },
    clientCommsLog: {
      create: async ({ data }: { data: Row }) => {
        if ((h.rows as Row[]).some((r) => r.idempotencyKey === data.idempotencyKey)) {
          throw Object.assign(new Error("Unique constraint"), { code: "P2002" });
        }
        const row = {
          ...data,
          id: `log_${h.rows.length + 1}`,
          createdAt: new Date(),
        };
        h.rows.push(row);
        return row;
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<Row>;
      }) => {
        const row = (h.rows as Row[]).find((r) => r.id === where.id);
        if (row) Object.assign(row, data);
        return row;
      },
      findFirst: async ({
        where,
      }: {
        where: { inspectionId: string; eventType: string; status?: { in: string[] } };
      }) => {
        const match = (h.rows as Row[])
          .filter(
            (r) =>
              r.inspectionId === where.inspectionId &&
              r.eventType === where.eventType &&
              (!where.status || where.status.in.includes(r.status)),
          )
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return match[0] ?? null;
      },
    },
  },
}));

vi.mock("@/lib/entitlements", () => ({
  requireAddonForResource: h.requireAddon,
}));

vi.mock("@/lib/email", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/email")>()),
  sendPulseUpdateEmail: h.send,
}));

vi.mock("@/lib/observability", () => ({ reportError: h.reportError }));

vi.mock("@/lib/organization-credits", () => ({
  getResourceTenant: vi.fn(async () => ({
    ownerId: "owner_1",
    organizationId: "org_sent",
  })),
}));

import {
  notifyClientDryingChange,
  notifyClientStepChange,
} from "../notify-client-change";

const CLIENT = {
  id: "client_a",
  userId: "owner_1",
  email: "homeowner@example.test",
  pulseOptOut: false,
  portalAccounts: [],
};

function job(over: Record<string, unknown> = {}) {
  return {
    id: "insp_1",
    userId: "owner_1",
    createdAt: new Date("2026-06-01T00:00:00Z"),
    status: "SCOPED",
    pulseEnabled: true,
    report: { id: "rep_1", status: "DRAFT", client: CLIENT },
    client: null,
    affectedAreas: [{ id: "a1", roomZoneId: "Kitchen" }],
    moistureReadings: [
      {
        location: "Kitchen",
        surfaceType: "Drywall",
        moistureLevel: 30,
        recordedAt: new Date("2026-11-01T01:00:00Z"),
      },
    ],
    ...over,
  };
}

const sends = () => h.send.mock.calls.length;
const reserved = () => rows.filter((r) => r.status !== "SUPPRESSED");

beforeEach(() => {
  vi.clearAllMocks();
  rows.length = 0;
  h.inspectionFindUnique.mockResolvedValue(job());
  h.approvalFindMany.mockResolvedValue([]);
  h.goalFindUnique.mockResolvedValue(null);
  h.clientFindFirst.mockResolvedValue(null);
  h.send.mockResolvedValue("msg_1");
  h.requireAddon.mockResolvedValue({ allowed: true });
  process.env.MAILTRAP_API_KEY = "mt_test";
  process.env.SENDER_EMAIL = "updates@example.test";
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.test";
  process.env.PORTAL_SECRET = "test-secret";
  delete process.env.CLIENT_PORTAL_JWT_SECRET;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("notifyClientStepChange", () => {
  it("sends one email when the client step moves forward", async () => {
    await notifyClientStepChange({ inspectionId: "insp_1", fromStatus: "DRAFT" });

    expect(sends()).toBe(1);
    expect(h.send.mock.calls[0][0].to).toBe("homeowner@example.test");
    expect(h.send.mock.calls[0][0].subject).toContain("Scope prepared");
    expect(rows[0].status).toBe("SENT");
  });

  it("sends nothing the second time the same change is reported", async () => {
    await notifyClientStepChange({ inspectionId: "insp_1", fromStatus: "DRAFT" });
    await notifyClientStepChange({ inspectionId: "insp_1", fromStatus: "DRAFT" });

    expect(sends()).toBe(1);
    expect(reserved()).toHaveLength(1);
  });

  it("sends one when two reports of the change race", async () => {
    await Promise.all([
      notifyClientStepChange({ inspectionId: "insp_1", fromStatus: "DRAFT" }),
      notifyClientStepChange({ inspectionId: "insp_1", fromStatus: "DRAFT" }),
    ]);

    expect(sends()).toBe(1);
  });

  it("sends nothing for a status move inside the same client step", async () => {
    h.inspectionFindUnique.mockResolvedValue(job({ status: "ESTIMATED" }));

    await notifyClientStepChange({ inspectionId: "insp_1", fromStatus: "SCOPED" });

    expect(sends()).toBe(0);
    expect(rows).toHaveLength(0);
  });

  it("sends nothing for a backward move", async () => {
    h.inspectionFindUnique.mockResolvedValue(job({ status: "SUBMITTED" }));

    await notifyClientStepChange({ inspectionId: "insp_1", fromStatus: "ESTIMATED" });

    expect(sends()).toBe(0);
  });

  it("keeps the step key stable when the percentage would differ", async () => {
    await notifyClientStepChange({ inspectionId: "insp_1", fromStatus: "DRAFT" });

    expect(rows[0].idempotencyKey).toBe(
      "insp_1:STEP_TRANSITION:step:Scope prepared",
    );
  });

  it("states the stage percentage, not the internal submission score", async () => {
    await notifyClientStepChange({ inspectionId: "insp_1", fromStatus: "DRAFT" });

    expect(h.send.mock.calls[0][0].text).toContain("75%");
  });

  it("suppresses on the linked client's opt-out and writes a row", async () => {
    h.inspectionFindUnique.mockResolvedValue(
      job({
        report: {
          id: "rep_1",
          status: "DRAFT",
          client: { ...CLIENT, pulseOptOut: true },
        },
      }),
    );

    await notifyClientStepChange({ inspectionId: "insp_1", fromStatus: "DRAFT" });

    expect(sends()).toBe(0);
    expect(rows[0].status).toBe("SUPPRESSED");
    expect(rows[0].suppressionReason).toBe("OPT_OUT");
  });

  it("suppresses when the other linked client record opted out", async () => {
    h.inspectionFindUnique.mockResolvedValue(
      job({
        client: {
          ...CLIENT,
          id: "client_b",
          email: "other@example.test",
          pulseOptOut: true,
        },
      }),
    );

    await notifyClientStepChange({ inspectionId: "insp_1", fromStatus: "DRAFT" });

    expect(sends()).toBe(0);
    expect(rows[0].suppressionReason).toBe("OPT_OUT");
  });

  it("suppresses when another record with the same address opted out", async () => {
    h.clientFindFirst.mockResolvedValue({ id: "client_dup" });

    await notifyClientStepChange({ inspectionId: "insp_1", fromStatus: "DRAFT" });

    expect(sends()).toBe(0);
    expect(rows[0].suppressionReason).toBe("OPT_OUT");
    const where = h.clientFindFirst.mock.calls[0][0].where;
    expect(where.userId).toEqual({ in: ["owner_1"] });
    expect(where.pulseOptOut).toBe(true);
    expect(where.email).toEqual({
      equals: "homeowner@example.test",
      mode: "insensitive",
    });
  });

  it("suppresses with the job toggle off and writes a row", async () => {
    h.inspectionFindUnique.mockResolvedValue(job({ pulseEnabled: false }));

    await notifyClientStepChange({ inspectionId: "insp_1", fromStatus: "DRAFT" });

    expect(sends()).toBe(0);
    expect(rows[0].suppressionReason).toBe("TOGGLE_OFF");
  });

  it("emails the job's client when the job has no report yet", async () => {
    h.inspectionFindUnique.mockResolvedValue(
      job({ report: null, client: CLIENT }),
    );

    await notifyClientStepChange({ inspectionId: "insp_1", fromStatus: "DRAFT" });

    expect(sends()).toBe(1);
  });

  it("resolves when the send fails, and a retry does not resend", async () => {
    h.send.mockRejectedValueOnce(new Error("mailtrap down"));

    await expect(
      notifyClientStepChange({ inspectionId: "insp_1", fromStatus: "DRAFT" }),
    ).resolves.toBeUndefined();
    expect(rows[0].suppressionReason).toBe("SEND_FAILED");

    await notifyClientStepChange({ inspectionId: "insp_1", fromStatus: "DRAFT" });
    expect(sends()).toBe(1);
  });

  it("resolves when the read itself throws, and reports it", async () => {
    h.inspectionFindUnique.mockRejectedValue(new Error("db down"));

    await expect(
      notifyClientStepChange({ inspectionId: "insp_1", fromStatus: "DRAFT" }),
    ).resolves.toBeUndefined();
    expect(h.reportError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ stage: "pulse:notify-step", inspectionId: "insp_1" }),
    );
  });

  it("emits one outcome line per exit", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    h.inspectionFindUnique.mockResolvedValue(job({ status: "ESTIMATED" }));

    await notifyClientStepChange({ inspectionId: "insp_1", fromStatus: "SCOPED" });

    expect(info).toHaveBeenCalledWith(
      "[pulse:hook]",
      expect.objectContaining({
        inspectionId: "insp_1",
        kind: "step",
        outcome: "skipped:not_forward",
      }),
    );
    info.mockRestore();
  });
});

describe("notifyClientDryingChange", () => {
  // 02/11/2026 11:00 Sydney (AEDT).
  const DAY_ONE = new Date("2026-11-02T00:00:00Z");
  const DAY_TWO = new Date("2026-11-03T00:00:00Z");

  // A reading high enough, on day one of a run, to be flagged against the curve.
  const wet = {
    location: "Kitchen",
    surfaceType: "Drywall",
    moistureLevel: 90,
    recordedAt: new Date("2026-10-01T01:00:00Z"),
  };

  it("sends once for the first state, and not again with no change", async () => {
    vi.useFakeTimers({ now: DAY_ONE, toFake: ["Date"] });
    await notifyClientDryingChange("insp_1");
    expect(sends()).toBe(1);

    vi.setSystemTime(DAY_TWO);
    await notifyClientDryingChange("insp_1");
    expect(sends()).toBe(1);
  });

  it("sends again on a later day when an area's state changed", async () => {
    vi.useFakeTimers({ now: DAY_ONE, toFake: ["Date"] });
    await notifyClientDryingChange("insp_1");

    vi.setSystemTime(DAY_TWO);
    h.inspectionFindUnique.mockResolvedValue(job({ moistureReadings: [wet] }));
    await notifyClientDryingChange("insp_1");

    expect(sends()).toBe(2);
  });

  it("is not silenced by an older row with no recorded state", async () => {
    vi.useFakeTimers({ now: DAY_TWO, toFake: ["Date"] });
    rows.push({
      id: "old",
      inspectionId: "insp_1",
      eventType: "DRYING_GOAL_CHANGE",
      status: "SENT",
      templateKey: "pulse-drying-update",
      idempotencyKey: "old-key",
      createdAt: DAY_ONE,
    });

    await notifyClientDryingChange("insp_1");

    expect(sends()).toBe(1);
  });

  it("does not send for a new area alone", async () => {
    vi.useFakeTimers({ now: DAY_ONE, toFake: ["Date"] });
    await notifyClientDryingChange("insp_1");

    vi.setSystemTime(DAY_TWO);
    h.inspectionFindUnique.mockResolvedValue(
      job({
        affectedAreas: [
          { id: "a1", roomZoneId: "Kitchen" },
          { id: "a2", roomZoneId: "Lounge" },
        ],
        moistureReadings: [
          ...job().moistureReadings,
          { ...job().moistureReadings[0], location: "Lounge" },
        ],
      }),
    );
    await notifyClientDryingChange("insp_1");

    expect(sends()).toBe(1);
  });

  it("sends again when an area the client was told about has dropped out", async () => {
    const twoAreas = {
      affectedAreas: [
        { id: "a1", roomZoneId: "Kitchen" },
        { id: "a2", roomZoneId: "Lounge" },
      ],
    };
    const kitchen = job().moistureReadings[0];
    vi.useFakeTimers({ now: DAY_ONE, toFake: ["Date"] });
    h.inspectionFindUnique.mockResolvedValue(
      job({
        ...twoAreas,
        moistureReadings: [kitchen, { ...kitchen, location: "Lounge" }],
      }),
    );
    await notifyClientDryingChange("insp_1");
    expect(sends()).toBe(1);

    vi.setSystemTime(DAY_TWO);
    h.inspectionFindUnique.mockResolvedValue(
      job({ ...twoAreas, moistureReadings: [kitchen] }),
    );
    await notifyClientDryingChange("insp_1");

    expect(sends()).toBe(2);
  });

  it("holds two changes on one AU day to one email, even when they race", async () => {
    vi.useFakeTimers({ now: DAY_ONE, toFake: ["Date"] });
    h.inspectionFindUnique
      .mockResolvedValueOnce(job())
      .mockResolvedValueOnce(job({ moistureReadings: [wet] }));

    // A direct race on the key: both pass the read filter with different state.
    const { dispatchPulseNotification } = await import("../dispatcher");
    const areas = (status: "on-track" | "needs-attention") => [
      { areaId: "a1", areaLabel: "Kitchen", status, estimateLabel: "x" },
    ];
    await Promise.all([
      dispatchPulseNotification({
        inspectionId: "insp_1",
        event: { type: "DRYING_GOAL_CHANGE", areas: areas("on-track"), date: "2026-11-02" },
      }),
      dispatchPulseNotification({
        inspectionId: "insp_1",
        event: { type: "DRYING_GOAL_CHANGE", areas: areas("needs-attention"), date: "2026-11-02" },
      }),
    ]);

    expect(sends()).toBe(1);
  });

  it.each([
    ["AEDT", "2026-11-02T12:59:00Z", "2026-11-02T13:01:00Z"],
    ["AEST", "2026-07-02T13:59:00Z", "2026-07-02T14:01:00Z"],
  ])("rolls the day over at Sydney midnight in %s", async (_zone, before, after) => {
    const start = new Date(before).getTime();
    const dry = {
      ...job().moistureReadings[0],
      recordedAt: new Date(start - 86_400_000),
    };
    const late = { ...wet, recordedAt: new Date(start - 30 * 86_400_000) };
    vi.useFakeTimers({ now: new Date(before), toFake: ["Date"] });
    h.inspectionFindUnique.mockResolvedValue(job({ moistureReadings: [dry] }));
    await notifyClientDryingChange("insp_1");
    expect(sends()).toBe(1);

    // One minute before midnight is still the same AU day.
    h.inspectionFindUnique.mockResolvedValue(job({ moistureReadings: [late] }));
    await notifyClientDryingChange("insp_1");
    expect(sends()).toBe(1);

    // After midnight the changed state goes out.
    vi.setSystemTime(new Date(after));
    await notifyClientDryingChange("insp_1");
    expect(sends()).toBe(2);
  });

  it("sends nothing when no area has a reading", async () => {
    h.inspectionFindUnique.mockResolvedValue(job({ moistureReadings: [] }));

    await notifyClientDryingChange("insp_1");

    expect(sends()).toBe(0);
    expect(rows).toHaveLength(0);
  });

  it("writes no row per reading with the toggle off", async () => {
    h.inspectionFindUnique.mockResolvedValue(job({ pulseEnabled: false }));

    await notifyClientDryingChange("insp_1");

    expect(sends()).toBe(0);
    expect(rows).toHaveLength(0);
  });

  it("writes one opt-out row per day, not one per reading", async () => {
    vi.useFakeTimers({ now: DAY_ONE, toFake: ["Date"] });
    h.clientFindFirst.mockResolvedValue({ id: "client_dup" });

    await notifyClientDryingChange("insp_1");
    await notifyClientDryingChange("insp_1");
    await notifyClientDryingChange("insp_1");

    expect(sends()).toBe(0);
    expect(rows).toHaveLength(1);
    expect(rows[0].suppressionReason).toBe("OPT_OUT");
  });

  it("folds calls during a check into one fresh check afterwards", async () => {
    await Promise.all([
      notifyClientDryingChange("insp_1"),
      notifyClientDryingChange("insp_1"),
      notifyClientDryingChange("insp_1"),
    ]);

    // Toggle, readings and dispatcher, then the toggle of one fresh pass, which
    // stops at today's row: two passes, not three, and one email.
    expect(h.inspectionFindUnique).toHaveBeenCalledTimes(4);
    expect(sends()).toBe(1);
  });

  it("does not lose a change that arrives while a check reads old state", async () => {
    vi.useFakeTimers({ now: DAY_ONE, toFake: ["Date"] });
    await notifyClientDryingChange("insp_1");
    expect(sends()).toBe(1);

    vi.setSystemTime(DAY_TWO);
    let release!: (value: null) => void;
    h.goalFindUnique.mockReturnValueOnce(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    const first = notifyClientDryingChange("insp_1");
    // Let the first check read the unchanged readings and pause at the goal.
    await vi.waitFor(() => expect(h.goalFindUnique).toHaveBeenCalledTimes(2));

    h.inspectionFindUnique.mockResolvedValue(job({ moistureReadings: [wet] }));
    await notifyClientDryingChange("insp_1");
    release(null);
    await first;

    expect(sends()).toBe(2);
  });

  it("resolves when the send fails, and tries again on a later day", async () => {
    vi.useFakeTimers({ now: DAY_ONE, toFake: ["Date"] });
    h.send.mockRejectedValueOnce(new Error("mailtrap down"));

    await expect(notifyClientDryingChange("insp_1")).resolves.toBeUndefined();
    expect(sends()).toBe(1);

    vi.setSystemTime(DAY_TWO);
    await notifyClientDryingChange("insp_1");
    expect(sends()).toBe(2);
  });

  it("still runs a queued recheck when the first check throws", async () => {
    let first = true;
    h.inspectionFindUnique.mockImplementation(async () => {
      if (first) {
        first = false;
        await new Promise((resolve) => setTimeout(resolve, 20));
        throw new Error("db blip");
      }
      return job();
    });

    const pending = notifyClientDryingChange("insp_1");
    await new Promise((resolve) => setTimeout(resolve, 5));
    const queued = notifyClientDryingChange("insp_1");
    await Promise.all([pending, queued]);

    expect(sends()).toBe(1);
  });
});
