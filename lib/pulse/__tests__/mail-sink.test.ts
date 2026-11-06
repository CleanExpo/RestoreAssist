import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  inspectionFindUnique: vi.fn(),
  reportError: vi.fn(),
  rows: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: { findUnique: h.inspectionFindUnique },
    reportApproval: { findMany: async () => [] },
    client: { findFirst: async () => null, findMany: async () => [] },
    clientCommsLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { ...data, id: `log_${h.rows.length + 1}` };
        h.rows.push(row);
        return row;
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => {
        const row = h.rows.find((r) => r.id === where.id);
        if (row) Object.assign(row, data);
        return row;
      },
    },
  },
}));

vi.mock("@/lib/entitlements", () => ({
  requireAddonForResource: async () => ({ allowed: true }),
}));
vi.mock("@/lib/observability", () => ({ reportError: h.reportError }));
vi.mock("@/lib/email/resolve-platform-config", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/email/resolve-platform-config")>()),
  resolvePlatformEmailConfig: async () => ({
    provider: "mailtrap",
    source: "env",
    apiKey: "sink-not-a-real-key",
    from: "updates@example.test",
  }),
}));

import { notifyClientStepChange } from "../notify-client-change";

const FIXTURE_ADDRESS = "homeowner@example.test";
const MAILTRAP_SEND_URL = "https://send.api.mailtrap.io/api/send";

/** The capture sink. No request leaves this process. */
const posted: Array<{ url: string; body: Record<string, any> }> = [];
let respond: () => Response;

const accepted = () =>
  new Response(JSON.stringify({ success: true, message_ids: ["sink_1"] }), {
    status: 200,
  });

beforeEach(() => {
  vi.clearAllMocks();
  posted.length = 0;
  h.rows.length = 0;
  respond = accepted;
  process.env.MAILTRAP_API_KEY = "sink-not-a-real-key";
  process.env.SENDER_EMAIL = "updates@example.test";
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.test";
  process.env.PORTAL_SECRET = "test-secret";
  h.inspectionFindUnique.mockResolvedValue({
    id: "insp_1",
    userId: "owner_1",
    createdAt: new Date("2026-06-01T00:00:00Z"),
    status: "SCOPED",
    pulseEnabled: true,
    report: {
      id: "rep_1",
      status: "DRAFT",
      client: {
        id: "client_a",
        email: FIXTURE_ADDRESS,
        pulseOptOut: false,
        portalAccounts: [],
      },
    },
    client: null,
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: { body: string }) => {
      posted.push({ url, body: JSON.parse(init.body) });
      return respond();
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("what reaches the mail provider", () => {
  it("carries the fixture address and working unsubscribe headers", async () => {
    await notifyClientStepChange({ inspectionId: "insp_1", fromStatus: "DRAFT" });

    expect(posted).toHaveLength(1);
    expect(posted[0].url).toBe(MAILTRAP_SEND_URL);
    expect(posted[0].body.to).toEqual([{ email: FIXTURE_ADDRESS }]);
    expect(posted[0].body.headers["List-Unsubscribe-Post"]).toBe(
      "List-Unsubscribe=One-Click",
    );
    expect(posted[0].body.headers["List-Unsubscribe"]).toMatch(
      /^<https:\/\/app\.example\.test\/api\/pulse\/unsubscribe\?token=[^>]+>$/,
    );
    expect(h.rows[0].status).toBe("SENT");
    expect(h.rows[0].providerMessageId).toBe("sink_1");
  });

  it("links the body to the confirm page, not the one-click endpoint", async () => {
    await notifyClientStepChange({ inspectionId: "insp_1", fromStatus: "DRAFT" });

    expect(posted[0].body.html).toContain(
      "https://app.example.test/pulse/unsubscribe?token=",
    );
    expect(posted[0].body.html).not.toContain("/api/pulse/unsubscribe");
  });

  it("writes the rendered email for a person to look at", async () => {
    await notifyClientStepChange({ inspectionId: "insp_1", fromStatus: "DRAFT" });

    const dir = process.env.PULSE_RENDER_DIR;
    if (dir) {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "step-transition.html"), posted[0].body.html);
    }
    expect(posted[0].body.html).toContain("Scope prepared");
    expect(posted[0].body.subject).toContain("Scope prepared");
  });

  it("retries once without headers when the provider refuses them", async () => {
    let calls = 0;
    respond = () => {
      calls += 1;
      return calls === 1
        ? new Response(JSON.stringify({ errors: ["bad headers"] }), { status: 422 })
        : accepted();
    };

    await notifyClientStepChange({ inspectionId: "insp_1", fromStatus: "DRAFT" });

    expect(posted).toHaveLength(2);
    expect(posted[1].body.headers).toBeUndefined();
    expect(h.rows[0].status).toBe("SENT");
    expect(h.reportError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ stage: "pulse:headers-rejected" }),
    );
  });

  it("does not retry an ambiguous failure, which could double-send", async () => {
    respond = () => new Response("upstream", { status: 503 });

    await notifyClientStepChange({ inspectionId: "insp_1", fromStatus: "DRAFT" });

    expect(posted).toHaveLength(1);
    expect(h.rows[0].suppressionReason).toBe("SEND_FAILED");
  });
});
