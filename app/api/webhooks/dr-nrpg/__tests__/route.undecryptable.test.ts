/**
 * RA-8075 — one undecryptable DrNrpgIntegration.webhookSecret must not stop
 * signature matching for every integration after it.
 *
 * Before the fix, decrypt() threw inside the find() over all active
 * integrations, so an event signed by a later (good) integration got a 500
 * and DR-NRPG's retries failed the same way.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { createHmac } from "crypto";

const drNrpgIntegrationFindMany = vi.fn();
const drNrpgJobSyncFindUnique = vi.fn();
const drNrpgJobSyncUpsert = vi.fn();
const drNrpgWebhookLogCreate = vi.fn();
const drNrpgWebhookEventCreate = vi.fn();
const inspectionCreate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    drNrpgIntegration: {
      findMany: (...a: unknown[]) => drNrpgIntegrationFindMany(...a),
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
    drNrpgJobSync: {
      findUnique: (...a: unknown[]) => drNrpgJobSyncFindUnique(...a),
      upsert: (...a: unknown[]) => drNrpgJobSyncUpsert(...a),
      update: vi.fn(),
    },
    drNrpgWebhookLog: {
      create: (...a: unknown[]) => drNrpgWebhookLogCreate(...a),
    },
    drNrpgWebhookEvent: {
      create: (...a: unknown[]) => drNrpgWebhookEventCreate(...a),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    inspection: {
      create: (...a: unknown[]) => inspectionCreate(...a),
    },
  },
}));

vi.mock("@/lib/webhook-audit", () => ({
  recordWebhookFailure: vi.fn(),
}));
vi.mock("@/lib/dr-nrpg/inbound-mapper", () => ({
  mapPayloadToInspection: vi.fn().mockReturnValue(null),
}));

// Cipher-shaped values: BAD_CIPHER cannot be decrypted under the current key
// (as after a key change); GOOD_CIPHER decrypts to GOOD_SECRET.
const BAD_CIPHER = "aa:bb:undecryptable";
const GOOD_CIPHER = "cc:dd:decryptable";
const GOOD_SECRET = "good-row-plain-secret";

vi.mock("@/lib/credential-vault", () => ({
  decrypt: vi.fn((v: string) => {
    if (v === BAD_CIPHER) {
      throw new Error("Unsupported state or unable to authenticate data");
    }
    if (v === GOOD_CIPHER) return GOOD_SECRET;
    throw new Error(`unexpected decrypt input in test`);
  }),
}));
vi.mock("@/lib/auth/account-tokens", () => ({
  isEncryptedToken: vi.fn((v: string) => v.split(":").length === 3),
}));
vi.mock("@/lib/api-errors", () => ({
  apiError: (
    _req: unknown,
    input: { code: string; message: string; status: number },
  ) =>
    new Response(
      JSON.stringify({ error: { code: input.code, message: input.message } }),
      { status: input.status, headers: { "Content-Type": "application/json" } },
    ),
}));

import { POST } from "../route";

function makeRequest(payload: Record<string, unknown>, signingSecret: string) {
  const body = JSON.stringify(payload);
  const digest = createHmac("sha256", signingSecret)
    .update(body, "utf8")
    .digest("hex");
  return new NextRequest("http://localhost/api/webhooks/dr-nrpg", {
    method: "POST",
    body,
    headers: {
      "Content-Type": "application/json",
      "x-drnrpg-signature": `sha256=${digest}`,
    },
  });
}

const payload = () => ({
  event: "job.updated",
  jobId: "job-8075",
  claimNumber: "CLM-8075",
  timestamp: new Date().toISOString(),
});

let logSpies: Array<ReturnType<typeof vi.spyOn>>;

beforeEach(() => {
  vi.clearAllMocks();
  drNrpgIntegrationFindMany.mockResolvedValue([
    { id: "integ-bad", webhookSecret: BAD_CIPHER },
    { id: "integ-good", webhookSecret: GOOD_CIPHER },
  ]);
  drNrpgWebhookLogCreate.mockResolvedValue({});
  drNrpgWebhookEventCreate.mockResolvedValue({});
  drNrpgJobSyncFindUnique.mockResolvedValue(null);
  drNrpgJobSyncUpsert.mockResolvedValue({ id: "sync-8075" });
  logSpies = (["log", "info", "warn", "error"] as const).map((m) =>
    vi.spyOn(console, m).mockImplementation(() => {}),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

function loggedText(): string {
  return logSpies
    .flatMap((s) => s.mock.calls)
    .map((args) =>
      args
        .map((a: unknown) =>
          a instanceof Error ? `${a.message} ${a.stack}` : JSON.stringify(a),
        )
        .join(" "),
    )
    .join("\n");
}

describe("POST /api/webhooks/dr-nrpg — RA-8075 undecryptable secret", () => {
  it("matches the good integration after an undecryptable one and upserts under its id", async () => {
    const res = await POST(makeRequest(payload(), GOOD_SECRET));

    expect(res.status).toBe(200);
    expect(drNrpgJobSyncUpsert).toHaveBeenCalledTimes(1);
    expect(drNrpgJobSyncUpsert.mock.calls[0][0].where).toEqual({
      integrationId_drNrpgJobId: {
        integrationId: "integ-good",
        drNrpgJobId: "job-8075",
      },
    });

    // The bad row is reported by id so an operator can find it.
    expect(loggedText()).toContain("integ-bad");
  });

  it("still returns 401 and writes nothing when no row's secret signed the event", async () => {
    const res = await POST(makeRequest(payload(), "nobody-has-this-secret"));

    expect(res.status).toBe(401);
    expect(drNrpgJobSyncUpsert).not.toHaveBeenCalled();
    expect(inspectionCreate).not.toHaveBeenCalled();
  });

  it("never logs a stored cipher or a decrypted secret", async () => {
    await POST(makeRequest(payload(), GOOD_SECRET));
    await POST(makeRequest(payload(), "nobody-has-this-secret"));

    const text = loggedText();
    for (const value of [BAD_CIPHER, GOOD_CIPHER, GOOD_SECRET]) {
      expect(text).not.toContain(value);
    }
  });
});
