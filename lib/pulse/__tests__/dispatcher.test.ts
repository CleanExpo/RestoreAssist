import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildClientStatusFeed } from "@/lib/portal/client-status-feed";
import type { AreaDryingState } from "@/lib/portal/drying-timeline";

const inspectionFindUnique = vi.fn();
const commsCreate = vi.fn();
const commsUpdate = vi.fn();
const sendPulseUpdateEmail = vi.fn();
const reportError = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: {
      findUnique: (...args: unknown[]) => inspectionFindUnique(...args),
    },
    clientCommsLog: {
      create: (...args: unknown[]) => commsCreate(...args),
      update: (...args: unknown[]) => commsUpdate(...args),
    },
  },
}));

// Keep the real templates (and escapeHtml) — only stub the network sender.
vi.mock("@/lib/email", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/email")>();
  return {
    ...actual,
    sendPulseUpdateEmail: (...args: unknown[]) => sendPulseUpdateEmail(...args),
  };
});

vi.mock("@/lib/observability", () => ({
  reportError: (...args: unknown[]) => reportError(...args),
}));

import { dispatchPulseNotification, type PulseEvent } from "../dispatcher";

const STEP_EVENT: PulseEvent = {
  type: "STEP_TRANSITION",
  feed: buildClientStatusFeed({
    status: "SCOPED",
    workflow: null,
    reportStatus: null,
    pendingApprovals: [],
  }),
};

const DRYING_EVENT: PulseEvent = {
  type: "DRYING_GOAL_CHANGE",
  areas: [
    {
      areaId: "a1",
      areaLabel: "Kitchen",
      status: "on-track",
      estimateLabel: "Estimate: on track — expected dry by 10 July 2026.",
    },
  ] satisfies AreaDryingState[],
};

const DIGEST_EVENT: PulseEvent = {
  type: "DAILY_DIGEST",
  digest: { areasAtGoal: 1, totalAreas: 2, nextVisitLabel: null },
  date: "2026-07-05",
};

const COP_EVENT: PulseEvent = {
  type: "COP_UPDATE",
  feed: buildClientStatusFeed({
    status: "SCOPED",
    workflow: null,
    reportStatus: null,
    pendingApprovals: [],
  }),
  date: "2026-07-05",
};

interface ClientOverrides {
  email?: string;
  pulseOptOut?: boolean;
  token?: string | null;
}

function jobFixture(
  opts: { pulseEnabled?: boolean; client?: ClientOverrides } = {},
) {
  const c = opts.client ?? {};
  return {
    id: "insp_1",
    pulseEnabled: opts.pulseEnabled ?? true,
    report: {
      client: {
        email: c.email ?? "home@owner.test",
        pulseOptOut: c.pulseOptOut ?? false,
        portalAccounts:
          c.token === null ? [] : [{ token: c.token ?? "tok_abc" }],
      },
    },
  };
}

let commsSeq = 0;
let seenKeys: Set<string>;

beforeEach(() => {
  vi.clearAllMocks();
  commsSeq = 0;
  seenKeys = new Set();
  // Simulate the DB unique constraint on idempotencyKey.
  commsCreate.mockImplementation(async ({ data }: { data: any }) => {
    if (seenKeys.has(data.idempotencyKey)) {
      const e: Error & { code?: string } = new Error("Unique constraint");
      e.code = "P2002";
      throw e;
    }
    seenKeys.add(data.idempotencyKey);
    commsSeq += 1;
    return { id: `log_${commsSeq}`, ...data };
  });
  commsUpdate.mockResolvedValue({});
  sendPulseUpdateEmail.mockResolvedValue("resend_msg_1");
  process.env.RESEND_API_KEY = "re_test";
  process.env.RESEND_FROM_EMAIL = "updates@restoreassist.app";
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";
});

function sentCreateCall() {
  return commsCreate.mock.calls
    .map((c) => c[0].data)
    .find((d: any) => d.status === "SENT");
}

describe("dispatchPulseNotification — sends", () => {
  it("sends the step-transition template and logs a SENT row", async () => {
    inspectionFindUnique.mockResolvedValue(jobFixture());

    const result = await dispatchPulseNotification({
      inspectionId: "insp_1",
      event: STEP_EVENT,
    });

    expect(result.status).toBe("SENT");
    expect(sendPulseUpdateEmail).toHaveBeenCalledTimes(1);
    const sent = sentCreateCall();
    expect(sent.templateKey).toBe("pulse-step-transition");
    expect(sent.eventType).toBe("STEP_TRANSITION");
    expect(sent.recipient).toBe("home@owner.test");
    // provider message id stamped after the send.
    expect(commsUpdate).toHaveBeenCalledWith({
      where: { id: "log_1" },
      data: { providerMessageId: "resend_msg_1" },
    });
    // Deep-links to the client's portal token page.
    const arg = sendPulseUpdateEmail.mock.calls[0][0];
    expect(arg.html).toContain("https://app.example.com/portal/tok_abc");
  });

  it("sends the drying-update template for a drying-goal change", async () => {
    inspectionFindUnique.mockResolvedValue(jobFixture());

    const result = await dispatchPulseNotification({
      inspectionId: "insp_1",
      event: DRYING_EVENT,
    });

    expect(result.status).toBe("SENT");
    expect(sentCreateCall().templateKey).toBe("pulse-drying-update");
  });

  it("sends the daily-digest template for a DAILY_DIGEST event", async () => {
    inspectionFindUnique.mockResolvedValue(jobFixture());

    const result = await dispatchPulseNotification({
      inspectionId: "insp_1",
      event: DIGEST_EVENT,
    });

    expect(result.status).toBe("SENT");
    expect(sentCreateCall().templateKey).toBe("pulse-daily-digest");
    expect(sentCreateCall().eventType).toBe("DAILY_DIGEST");
  });

  it("sends the CoP-update template for a COP_UPDATE event", async () => {
    inspectionFindUnique.mockResolvedValue(jobFixture());

    const result = await dispatchPulseNotification({
      inspectionId: "insp_1",
      event: COP_EVENT,
    });

    expect(result.status).toBe("SENT");
    expect(sentCreateCall().templateKey).toBe("pulse-cop-update");
    expect(sentCreateCall().eventType).toBe("COP_UPDATE");
  });
});

describe("dispatchPulseNotification — daily digest once-per-day idempotency", () => {
  it("suppresses a second digest dispatch for the same job on the same date", async () => {
    inspectionFindUnique.mockResolvedValue(jobFixture());

    const first = await dispatchPulseNotification({
      inspectionId: "insp_1",
      event: DIGEST_EVENT,
    });
    const second = await dispatchPulseNotification({
      inspectionId: "insp_1",
      event: DIGEST_EVENT,
    });

    expect(first.status).toBe("SENT");
    expect(second).toMatchObject({ status: "SUPPRESSED", reason: "DUPLICATE" });
    expect(sendPulseUpdateEmail).toHaveBeenCalledTimes(1);
  });

  it("sends a new digest for the same job on a different date", async () => {
    inspectionFindUnique.mockResolvedValue(jobFixture());

    const day1 = await dispatchPulseNotification({
      inspectionId: "insp_1",
      event: DIGEST_EVENT,
    });
    const day2 = await dispatchPulseNotification({
      inspectionId: "insp_1",
      event: { ...DIGEST_EVENT, date: "2026-07-06" },
    });

    expect(day1.status).toBe("SENT");
    expect(day2.status).toBe("SENT");
    expect(sendPulseUpdateEmail).toHaveBeenCalledTimes(2);
  });

  it("still suppresses a digest with TOGGLE_OFF when the per-job toggle is off", async () => {
    inspectionFindUnique.mockResolvedValue(jobFixture({ pulseEnabled: false }));

    const result = await dispatchPulseNotification({
      inspectionId: "insp_1",
      event: DIGEST_EVENT,
    });

    expect(result).toMatchObject({ status: "SUPPRESSED", reason: "TOGGLE_OFF" });
    expect(sendPulseUpdateEmail).not.toHaveBeenCalled();
  });
});

describe("dispatchPulseNotification — suppressions", () => {
  it("suppresses with TOGGLE_OFF when the per-job toggle is off (no send)", async () => {
    inspectionFindUnique.mockResolvedValue(jobFixture({ pulseEnabled: false }));

    const result = await dispatchPulseNotification({
      inspectionId: "insp_1",
      event: STEP_EVENT,
    });

    expect(result).toMatchObject({ status: "SUPPRESSED", reason: "TOGGLE_OFF" });
    expect(sendPulseUpdateEmail).not.toHaveBeenCalled();
    expect(commsCreate.mock.calls[0][0].data).toMatchObject({
      status: "SUPPRESSED",
      suppressionReason: "TOGGLE_OFF",
    });
  });

  it("suppresses with OPT_OUT when the homeowner opted out (no send)", async () => {
    inspectionFindUnique.mockResolvedValue(
      jobFixture({ client: { pulseOptOut: true } }),
    );

    const result = await dispatchPulseNotification({
      inspectionId: "insp_1",
      event: STEP_EVENT,
    });

    expect(result).toMatchObject({ status: "SUPPRESSED", reason: "OPT_OUT" });
    expect(sendPulseUpdateEmail).not.toHaveBeenCalled();
  });

  it("suppresses with NO_RECIPIENT when the client has no email", async () => {
    inspectionFindUnique.mockResolvedValue(
      jobFixture({ client: { email: "" } }),
    );

    const result = await dispatchPulseNotification({
      inspectionId: "insp_1",
      event: STEP_EVENT,
    });

    expect(result).toMatchObject({
      status: "SUPPRESSED",
      reason: "NO_RECIPIENT",
    });
    expect(sendPulseUpdateEmail).not.toHaveBeenCalled();
  });

  it("fails closed with MISSING_ENV and reports connector health when env is unset", async () => {
    delete process.env.RESEND_FROM_EMAIL;
    inspectionFindUnique.mockResolvedValue(jobFixture());

    const result = await dispatchPulseNotification({
      inspectionId: "insp_1",
      event: STEP_EVENT,
    });

    expect(result).toMatchObject({
      status: "SUPPRESSED",
      reason: "MISSING_ENV",
    });
    expect(sendPulseUpdateEmail).not.toHaveBeenCalled();
    expect(reportError).toHaveBeenCalledTimes(1);
    expect(reportError.mock.calls[0][1]).toMatchObject({ connector: "resend" });
  });

  it("suppresses the second send of a duplicate logical event", async () => {
    inspectionFindUnique.mockResolvedValue(jobFixture());

    const first = await dispatchPulseNotification({
      inspectionId: "insp_1",
      event: STEP_EVENT,
    });
    const second = await dispatchPulseNotification({
      inspectionId: "insp_1",
      event: STEP_EVENT,
    });

    expect(first.status).toBe("SENT");
    expect(second).toMatchObject({ status: "SUPPRESSED", reason: "DUPLICATE" });
    // Exactly one email despite two dispatches.
    expect(sendPulseUpdateEmail).toHaveBeenCalledTimes(1);
  });

  it("records SEND_FAILED and reports when the provider send throws", async () => {
    inspectionFindUnique.mockResolvedValue(jobFixture());
    sendPulseUpdateEmail.mockRejectedValueOnce(new Error("resend down"));

    const result = await dispatchPulseNotification({
      inspectionId: "insp_1",
      event: STEP_EVENT,
    });

    expect(result).toMatchObject({
      status: "SUPPRESSED",
      reason: "SEND_FAILED",
    });
    expect(reportError).toHaveBeenCalled();
    // The reserved SENT row is flipped to SUPPRESSED with the reason.
    expect(commsUpdate).toHaveBeenCalledWith({
      where: { id: "log_1" },
      data: { status: "SUPPRESSED", suppressionReason: "SEND_FAILED" },
    });
  });
});
