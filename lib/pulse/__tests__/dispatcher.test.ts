import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildClientStatusFeed } from "@/lib/portal/client-status-feed";
import type { AreaDryingState } from "@/lib/portal/drying-timeline";

const inspectionFindUnique = vi.fn();
const commsCreate = vi.fn();
const commsUpdate = vi.fn();
const sendPulseUpdateEmail = vi.fn();
const reportError = vi.fn();
const requireAddon = vi.fn();
const orgFindMany = vi.fn(async () => [] as { id: string }[]);

vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: {
      findUnique: (...args: unknown[]) => inspectionFindUnique(...args),
    },
    client: { findFirst: async () => null, findMany: async () => [] },
    user: { findMany: async () => [] },
    organization: {
      findMany: (...args: unknown[]) => orgFindMany(...args),
      findUnique: async () => null,
    },
    pulseOrgAddressOptOut: {
      findUnique: async () => null,
      findFirst: async () => null,
      upsert: async () => ({}),
    },
    clientCommsLog: {
      create: (...args: unknown[]) => commsCreate(...args),
      update: (...args: unknown[]) => commsUpdate(...args),
    },
  },
}));

vi.mock("@/lib/entitlements", () => ({
  requireAddonForResource: (...args: unknown[]) => requireAddon(...args),
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

vi.mock("@/lib/organization-credits", () => ({
  getResourceTenant: vi.fn(async () => ({
    ownerId: "user_1",
    organizationId: "org_sent",
  })),
}));

import { getResourceTenant } from "@/lib/organization-credits";
import { prisma } from "@/lib/prisma";
import { dispatchPulseNotification, type PulseEvent } from "../dispatcher";
import { readPulseUnsubscribeToken } from "../pulse-unsubscribe-token";

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
  date: "2026-07-01",
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

const JOB_CREATED_AT = new Date("2026-06-01T00:00:00Z");

function jobFixture(
  opts: { pulseEnabled?: boolean; client?: ClientOverrides } = {},
) {
  const c = opts.client ?? {};
  return {
    id: "insp_1",
    userId: "user_1",
    createdAt: JOB_CREATED_AT,
    pulseEnabled: opts.pulseEnabled ?? true,
    report: {
      client: {
        id: "client_1",
        email: c.email ?? "home@owner.test",
        pulseOptOut: c.pulseOptOut ?? false,
        portalAccounts:
          c.token === null ? [] : [{ token: c.token ?? "tok_abc", inspectionId: null, createdAt: new Date() }],
      },
    },
  };
}

let commsSeq = 0;
let seenKeys: Set<string>;

beforeEach(() => {
  process.env.PORTAL_SECRET = "test-secret";
  vi.clearAllMocks();
  orgFindMany.mockResolvedValue([]);
  vi.mocked(getResourceTenant).mockReset();
  vi.mocked(getResourceTenant).mockResolvedValue({
    ownerId: "user_1",
    organizationId: "org_sent",
  });
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
  sendPulseUpdateEmail.mockResolvedValue("mailtrap_msg_1");
  requireAddon.mockResolvedValue({ allowed: true, sku: "CLIENT_COMMS", workspaceId: "ws_1" });
  process.env.MAILTRAP_API_KEY = "mt_test";
  process.env.SENDER_EMAIL = "updates@restoreassist.app";
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";
  process.env.PORTAL_SECRET = "test-portal-secret";
});

function sentCreateCall() {
  return commsCreate.mock.calls
    .map((c) => c[0].data)
    .find((d: any) => d.status === "PENDING");
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
      data: { status: "SENT", providerMessageId: "mailtrap_msg_1" },
    });
    // Deep-links to the client's portal token page.
    const arg = sendPulseUpdateEmail.mock.calls[0][0];
    expect(arg.html).toContain("https://app.example.com/portal/tok_abc");
    expect(arg.html).toContain("/pulse/unsubscribe?token=");
    expect(arg.text).toContain("Stop automated progress emails:");
    const encoded = arg.html.match(
      /\/pulse\/unsubscribe\?token=([^"'&\s]+)/,
    )?.[1];
    expect(encoded).toBeTruthy();
    expect(
      readPulseUnsubscribeToken(decodeURIComponent(encoded!)),
    ).toMatchObject({
      clientId: "client_1",
      organizationId: "org_sent",
    });
  });

  it("sends the drying-update template for a drying-goal change", async () => {
    inspectionFindUnique.mockResolvedValue(jobFixture());

    const result = await dispatchPulseNotification({
      inspectionId: "insp_1",
      event: DRYING_EVENT,
    });

    expect(result.status).toBe("SENT");
    expect(sentCreateCall().templateKey).toBe("pulse-drying-update#a1=on-track");
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

  it("never sends to the legacy signup sample even when that row still exists", async () => {
    inspectionFindUnique.mockResolvedValue(
      jobFixture({ client: { email: "sample.client@example.com.au" } }),
    );

    const result = await dispatchPulseNotification({
      inspectionId: "insp_1",
      event: STEP_EVENT,
    });

    expect(result).toMatchObject({
      status: "SUPPRESSED",
      reason: "DEMO_RECIPIENT",
    });
    expect(sendPulseUpdateEmail).not.toHaveBeenCalled();
    expect(commsCreate.mock.calls[0][0].data).toMatchObject({
      status: "SUPPRESSED",
      suppressionReason: "DEMO_RECIPIENT",
      recipient: "sample.client@example.com.au",
    });
  });

  it("still suppresses OPT_OUT after the opted-out person changes email", async () => {
    inspectionFindUnique.mockResolvedValue(
      jobFixture({
        client: { pulseOptOut: true, email: "new@owner.test" },
      }),
    );

    const result = await dispatchPulseNotification({
      inspectionId: "insp_1",
      event: STEP_EVENT,
    });

    expect(result).toMatchObject({ status: "SUPPRESSED", reason: "OPT_OUT" });
    expect(sendPulseUpdateEmail).not.toHaveBeenCalled();
  });

  it("does not send when a self-tenant owner owns more than one organisation", async () => {
    vi.mocked(getResourceTenant).mockResolvedValue({
      ownerId: "user_1",
      organizationId: null,
    });
    orgFindMany.mockResolvedValue([{ id: "org_old" }, { id: "org_new" }]);
    inspectionFindUnique.mockResolvedValue(jobFixture());

    const result = await dispatchPulseNotification({
      inspectionId: "insp_1",
      event: STEP_EVENT,
    });

    expect(result).toMatchObject({
      status: "SUPPRESSED",
      reason: "UNPROVEN_SCOPE",
    });
    expect(sendPulseUpdateEmail).not.toHaveBeenCalled();
    expect(orgFindMany).toHaveBeenCalled();
  });

  it("does not send when the job tenant is unproven (resolver returns null)", async () => {
    vi.mocked(getResourceTenant).mockResolvedValue(null);
    inspectionFindUnique.mockResolvedValue(jobFixture());

    const result = await dispatchPulseNotification({
      inspectionId: "insp_1",
      event: STEP_EVENT,
    });

    expect(result).toMatchObject({
      status: "SUPPRESSED",
      reason: "UNPROVEN_SCOPE",
    });
    expect(sendPulseUpdateEmail).not.toHaveBeenCalled();
  });

  it("does not send when the address-lock writer is missing", async () => {
    const locks = prisma.pulseOrgAddressOptOut;
    const upsert = locks.upsert;
    // @ts-expect-error — simulate a client missing the lock writer
    locks.upsert = undefined;
    try {
      inspectionFindUnique.mockResolvedValue(jobFixture());
      const result = await dispatchPulseNotification({
        inspectionId: "insp_1",
        event: STEP_EVENT,
      });
      expect(result).toMatchObject({
        status: "SUPPRESSED",
        reason: "UNPROVEN_SCOPE",
      });
      expect(sendPulseUpdateEmail).not.toHaveBeenCalled();
    } finally {
      locks.upsert = upsert;
    }
  });

  it("does not send when the job tenant lookup throws", async () => {
    vi.mocked(getResourceTenant).mockRejectedValueOnce(new Error("tenant lookup failed"));
    inspectionFindUnique.mockResolvedValue(jobFixture());

    const result = await dispatchPulseNotification({
      inspectionId: "insp_1",
      event: STEP_EVENT,
    });

    expect(result).toMatchObject({
      status: "SUPPRESSED",
      reason: "UNPROVEN_SCOPE",
    });
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
    delete process.env.SENDER_EMAIL;
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
    expect(reportError.mock.calls[0][1]).toMatchObject({ connector: "mailtrap" });
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
    sendPulseUpdateEmail.mockRejectedValueOnce(new Error("mailtrap down"));

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

describe("dispatchPulseNotification — CLIENT_COMMS entitlement gate (RA-6954)", () => {
  it("suppresses with NOT_ENTITLED when the workspace lacks the CLIENT_COMMS add-on (no send)", async () => {
    inspectionFindUnique.mockResolvedValue(jobFixture());
    requireAddon.mockResolvedValue({
      allowed: false,
      reason: "NOT_ENTITLED",
      sku: "CLIENT_COMMS",
      response: new Response(null, { status: 402 }),
    });

    const result = await dispatchPulseNotification({
      inspectionId: "insp_1",
      event: STEP_EVENT,
    });

    expect(result).toMatchObject({
      status: "SUPPRESSED",
      reason: "NOT_ENTITLED",
    });
    expect(sendPulseUpdateEmail).not.toHaveBeenCalled();
    expect(requireAddon).toHaveBeenCalledWith(
      "user_1",
      JOB_CREATED_AT,
      "CLIENT_COMMS",
    );
  });

  it("sends once the workspace is entitled to CLIENT_COMMS", async () => {
    inspectionFindUnique.mockResolvedValue(jobFixture());
    requireAddon.mockResolvedValue({
      allowed: true,
      sku: "CLIENT_COMMS",
      workspaceId: "ws_1",
    });

    const result = await dispatchPulseNotification({
      inspectionId: "insp_1",
      event: STEP_EVENT,
    });

    expect(result.status).toBe("SENT");
    expect(sendPulseUpdateEmail).toHaveBeenCalledTimes(1);
  });

  it("checks the entitlement gate before checking the Mailtrap/app env", async () => {
    delete process.env.SENDER_EMAIL;
    inspectionFindUnique.mockResolvedValue(jobFixture());
    requireAddon.mockResolvedValue({
      allowed: false,
      reason: "NOT_ENTITLED",
      sku: "CLIENT_COMMS",
      response: new Response(null, { status: 402 }),
    });

    const result = await dispatchPulseNotification({
      inspectionId: "insp_1",
      event: STEP_EVENT,
    });

    // NOT_ENTITLED wins over MISSING_ENV — the gate is checked first.
    expect(result).toMatchObject({ status: "SUPPRESSED", reason: "NOT_ENTITLED" });
    expect(reportError).not.toHaveBeenCalled();
  });
});
