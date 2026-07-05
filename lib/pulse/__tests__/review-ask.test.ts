import { beforeEach, describe, expect, it, vi } from "vitest";

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

import { dispatchReviewAskNotification } from "../review-ask";

interface JobOverrides {
  pulseEnabled?: boolean;
  clientEmail?: string;
  pulseOptOut?: boolean;
  googleReviewUrl?: string | null;
  orgName?: string | null;
  tradingName?: string | null;
}

function jobFixture(opts: JobOverrides = {}) {
  return {
    id: "insp_1",
    inspectionNumber: "NIR-2026-07-0001",
    pulseEnabled: opts.pulseEnabled ?? true,
    report: {
      client: {
        email: opts.clientEmail ?? "home@owner.test",
        pulseOptOut: opts.pulseOptOut ?? false,
      },
    },
    workspace: {
      name: "Acme Restoration",
      owner: {
        organization: {
          name: opts.orgName ?? "Acme Restoration Pty Ltd",
          tradingName: opts.tradingName ?? null,
          googleReviewUrl:
            opts.googleReviewUrl === undefined
              ? "https://g.page/r/acme-restoration/review"
              : opts.googleReviewUrl,
        },
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
});

function sentCreateCall() {
  return commsCreate.mock.calls
    .map((c) => c[0].data)
    .find((d: any) => d.status === "SENT");
}

describe("dispatchReviewAskNotification — sends", () => {
  it("sends the review-ask on job close and logs a SENT row", async () => {
    inspectionFindUnique.mockResolvedValue(jobFixture());

    const result = await dispatchReviewAskNotification("insp_1");

    expect(result.status).toBe("SENT");
    expect(sendPulseUpdateEmail).toHaveBeenCalledTimes(1);
    const sent = sentCreateCall();
    expect(sent.templateKey).toBe("pulse-review-ask");
    expect(sent.eventType).toBe("REVIEW_ASK");
    expect(sent.recipient).toBe("home@owner.test");
    expect(sent.idempotencyKey).toBe("reviewask:insp_1");
    expect(commsUpdate).toHaveBeenCalledWith({
      where: { id: "log_1" },
      data: { providerMessageId: "resend_msg_1" },
    });
    const arg = sendPulseUpdateEmail.mock.calls[0][0];
    expect(arg.html).toContain("https://g.page/r/acme-restoration/review");
  });
});

describe("dispatchReviewAskNotification — suppressions", () => {
  it("suppresses with TOGGLE_OFF when the per-job toggle is off (no send)", async () => {
    inspectionFindUnique.mockResolvedValue(
      jobFixture({ pulseEnabled: false }),
    );

    const result = await dispatchReviewAskNotification("insp_1");

    expect(result).toMatchObject({ status: "SUPPRESSED", reason: "TOGGLE_OFF" });
    expect(sendPulseUpdateEmail).not.toHaveBeenCalled();
  });

  it("suppresses with OPT_OUT when the homeowner opted out (no send)", async () => {
    inspectionFindUnique.mockResolvedValue(jobFixture({ pulseOptOut: true }));

    const result = await dispatchReviewAskNotification("insp_1");

    expect(result).toMatchObject({ status: "SUPPRESSED", reason: "OPT_OUT" });
    expect(sendPulseUpdateEmail).not.toHaveBeenCalled();
  });

  it("suppresses with NO_RECIPIENT when the client has no email", async () => {
    inspectionFindUnique.mockResolvedValue(jobFixture({ clientEmail: "" }));

    const result = await dispatchReviewAskNotification("insp_1");

    expect(result).toMatchObject({
      status: "SUPPRESSED",
      reason: "NO_RECIPIENT",
    });
    expect(sendPulseUpdateEmail).not.toHaveBeenCalled();
  });

  it("suppresses with NO_URL when no Google review link is configured", async () => {
    inspectionFindUnique.mockResolvedValue(
      jobFixture({ googleReviewUrl: null }),
    );

    const result = await dispatchReviewAskNotification("insp_1");

    expect(result).toMatchObject({ status: "SUPPRESSED", reason: "NO_URL" });
    expect(sendPulseUpdateEmail).not.toHaveBeenCalled();
  });

  it("fails closed with MISSING_ENV and reports connector health when Resend env is unset", async () => {
    delete process.env.RESEND_FROM_EMAIL;
    inspectionFindUnique.mockResolvedValue(jobFixture());

    const result = await dispatchReviewAskNotification("insp_1");

    expect(result).toMatchObject({ status: "SUPPRESSED", reason: "MISSING_ENV" });
    expect(sendPulseUpdateEmail).not.toHaveBeenCalled();
    expect(reportError).toHaveBeenCalledTimes(1);
    expect(reportError.mock.calls[0][1]).toMatchObject({ connector: "resend" });
  });

  it("suppresses the second close / re-close of the same job as a duplicate (idempotent)", async () => {
    inspectionFindUnique.mockResolvedValue(jobFixture());

    const first = await dispatchReviewAskNotification("insp_1");
    const second = await dispatchReviewAskNotification("insp_1");

    expect(first.status).toBe("SENT");
    expect(second).toMatchObject({ status: "SUPPRESSED", reason: "DUPLICATE" });
    // Exactly one email despite two close/dispatch attempts.
    expect(sendPulseUpdateEmail).toHaveBeenCalledTimes(1);
  });

  it("records SEND_FAILED and reports when the provider send throws", async () => {
    inspectionFindUnique.mockResolvedValue(jobFixture());
    sendPulseUpdateEmail.mockRejectedValueOnce(new Error("resend down"));

    const result = await dispatchReviewAskNotification("insp_1");

    expect(result).toMatchObject({ status: "SUPPRESSED", reason: "SEND_FAILED" });
    expect(reportError).toHaveBeenCalled();
    expect(commsUpdate).toHaveBeenCalledWith({
      where: { id: "log_1" },
      data: { status: "SUPPRESSED", suppressionReason: "SEND_FAILED" },
    });
  });
});
