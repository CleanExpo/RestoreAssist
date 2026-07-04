/**
 * RA-6968 — POST /api/webhooks/dr-nrpg tenant-scoping + replay protection.
 *
 * Covers the fix:
 *   - The DrNrpgJobSync upsert keys on the tenant-scoped compound
 *     (integrationId, drNrpgJobId), not the global jobId — so one tenant's
 *     event can no longer overwrite another tenant's job.
 *   - A replayed event (timestamp not newer than the last recorded event for
 *     that job) is an idempotent no-op — not double-processed.
 *   - A stale event (timestamp outside the ±5-minute window) is rejected.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createHmac } from "crypto";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const drNrpgIntegrationFindMany = vi.fn();
const drNrpgIntegrationFindUnique = vi.fn();
const drNrpgIntegrationUpdate = vi.fn();
const drNrpgJobSyncFindUnique = vi.fn();
const drNrpgJobSyncUpsert = vi.fn();
const drNrpgJobSyncUpdate = vi.fn();
const drNrpgWebhookLogCreate = vi.fn();
const inspectionCreate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    drNrpgIntegration: {
      findMany: (...a: unknown[]) => drNrpgIntegrationFindMany(...a),
      findUnique: (...a: unknown[]) => drNrpgIntegrationFindUnique(...a),
      update: (...a: unknown[]) => drNrpgIntegrationUpdate(...a),
    },
    drNrpgJobSync: {
      findUnique: (...a: unknown[]) => drNrpgJobSyncFindUnique(...a),
      upsert: (...a: unknown[]) => drNrpgJobSyncUpsert(...a),
      update: (...a: unknown[]) => drNrpgJobSyncUpdate(...a),
    },
    drNrpgWebhookLog: {
      create: (...a: unknown[]) => drNrpgWebhookLogCreate(...a),
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
vi.mock("@/lib/credential-vault", () => ({
  decrypt: vi.fn((v: string) => v),
}));
vi.mock("@/lib/auth/account-tokens", () => ({
  isEncryptedToken: vi.fn().mockReturnValue(false), // treat secret as plaintext
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

const SECRET = "test-drnrpg-secret";
const INTEGRATION_ID = "integ-1";

function makeRequest(payload: Record<string, unknown>) {
  const body = JSON.stringify(payload);
  const digest = createHmac("sha256", SECRET).update(body, "utf8").digest("hex");
  return new NextRequest("http://localhost/api/webhooks/dr-nrpg", {
    method: "POST",
    body,
    headers: {
      "Content-Type": "application/json",
      "x-drnrpg-signature": `sha256=${digest}`,
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  drNrpgIntegrationFindMany.mockResolvedValue([
    { id: INTEGRATION_ID, webhookSecret: SECRET },
  ]);
  drNrpgIntegrationUpdate.mockResolvedValue({});
  drNrpgWebhookLogCreate.mockResolvedValue({});
});

describe("POST /api/webhooks/dr-nrpg — tenant scoping", () => {
  it("upserts on the compound (integrationId, drNrpgJobId) key", async () => {
    drNrpgJobSyncFindUnique.mockResolvedValue(null); // no prior job
    drNrpgJobSyncUpsert.mockResolvedValue({ id: "sync-1" });

    const payload = {
      event: "job.updated",
      jobId: "job-abc",
      claimNumber: "CLM-1",
      timestamp: new Date().toISOString(),
    };
    const res = await POST(makeRequest(payload));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.received).toBe(true);
    expect(json.jobSyncId).toBe("sync-1");

    expect(drNrpgJobSyncUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          integrationId_drNrpgJobId: {
            integrationId: INTEGRATION_ID,
            drNrpgJobId: "job-abc",
          },
        },
      }),
    );
  });
});

describe("POST /api/webhooks/dr-nrpg — replay protection", () => {
  it("rejects an event older than the ±5-minute freshness window", async () => {
    const stale = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const res = await POST(
      makeRequest({
        event: "job.updated",
        jobId: "job-stale",
        claimNumber: "CLM-2",
        timestamp: stale,
      }),
    );

    expect(res.status).toBe(401);
    expect(drNrpgJobSyncUpsert).not.toHaveBeenCalled();
  });

  it("does not double-process a replayed event (idempotency)", async () => {
    const ts = new Date().toISOString();
    // A prior row already recorded THIS event's timestamp.
    drNrpgJobSyncFindUnique.mockResolvedValue({
      id: "sync-existing",
      lastEventAt: new Date(ts),
    });

    const res = await POST(
      makeRequest({
        event: "job.updated",
        jobId: "job-replay",
        claimNumber: "CLM-3",
        timestamp: ts,
      }),
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.deduplicated).toBe(true);
    // The replay was NOT applied.
    expect(drNrpgJobSyncUpsert).not.toHaveBeenCalled();
  });

  it("processes an event strictly newer than the last recorded one", async () => {
    const last = new Date(Date.now() - 60 * 1000); // 1 min ago
    drNrpgJobSyncFindUnique.mockResolvedValue({
      id: "sync-existing",
      lastEventAt: last,
    });
    drNrpgJobSyncUpsert.mockResolvedValue({ id: "sync-existing" });

    const res = await POST(
      makeRequest({
        event: "job.updated",
        jobId: "job-fresh",
        claimNumber: "CLM-4",
        timestamp: new Date().toISOString(), // newer than `last`
      }),
    );

    expect(res.status).toBe(200);
    expect(drNrpgJobSyncUpsert).toHaveBeenCalled();
  });

  it("does not drop a distinct event landing in the same second as the last (job.updated then job.completed)", async () => {
    const ts = new Date().toISOString();
    // Prior event recorded at the SAME instant but a DIFFERENT event type —
    // e.g. job.updated and job.completed dispatched in the same second.
    drNrpgJobSyncFindUnique.mockResolvedValue({
      id: "sync-existing",
      lastEventAt: new Date(ts),
      lastEventType: "job.updated",
    });
    drNrpgJobSyncUpsert.mockResolvedValue({ id: "sync-existing" });

    const res = await POST(
      makeRequest({
        event: "job.completed",
        jobId: "job-same-second",
        claimNumber: "CLM-5",
        timestamp: ts,
      }),
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.deduplicated).toBeFalsy();
    expect(drNrpgJobSyncUpsert).toHaveBeenCalled();
  });

  it("writes a DrNrpgWebhookLog entry for a deduplicated replay before returning", async () => {
    const ts = new Date().toISOString();
    drNrpgJobSyncFindUnique.mockResolvedValue({
      id: "sync-existing",
      lastEventAt: new Date(ts),
      lastEventType: "job.updated",
    });

    const res = await POST(
      makeRequest({
        event: "job.updated",
        jobId: "job-replay-logged",
        claimNumber: "CLM-6",
        timestamp: ts,
      }),
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.deduplicated).toBe(true);
    expect(drNrpgWebhookLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          jobSyncId: "sync-existing",
          eventType: "job.updated",
        }),
      }),
    );
  });
});
