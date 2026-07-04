/**
 * RA-6968 — POST /api/webhooks/dr-nrpg tenant-scoping + replay protection.
 *
 * Covers the fix:
 *   - The DrNrpgJobSync upsert keys on the tenant-scoped compound
 *     (integrationId, drNrpgJobId), not the global jobId — so one tenant's
 *     event can no longer overwrite another tenant's job.
 *   - A replayed event (timestamp not newer than the last recorded event for
 *     that job) is an idempotent no-op — not double-processed.
 *   - A stale event (timestamp outside the ±24h freshness window) is rejected.
 *
 * RA-6985: the freshness window was previously ±5 minutes, which rejected
 * DR-NRPG's own late retries (a retry redelivers the identical signed body —
 * same timestamp), permanently dropping the event after a transient failure
 * on our end. Widened to the provider retry horizon (24h), mirroring the
 * merged MYOB/Xero fixes (RA-6973/RA-6968); the lastEventAt/lastEventType
 * dedup + DrNrpgWebhookLog audit remain the actual replay guards.
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
const drNrpgWebhookEventCreate = vi.fn();
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
    drNrpgWebhookEvent: {
      create: (...a: unknown[]) => drNrpgWebhookEventCreate(...a),
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
import { mapPayloadToInspection } from "@/lib/dr-nrpg/inbound-mapper";

const SECRET = "test-drnrpg-secret";
const INTEGRATION_ID = "integ-1";

// A Prisma unique-constraint (P2002) rejection, as the DB emits under a
// concurrent duplicate insert into DrNrpgWebhookEvent.
const P2002 = Object.assign(new Error("Unique constraint failed"), {
  code: "P2002",
});

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
  drNrpgWebhookEventCreate.mockResolvedValue({});
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
  it("accepts the provider's own retry hours after the event (previously rejected at the 5-minute gate)", async () => {
    drNrpgJobSyncFindUnique.mockResolvedValue(null); // transient failure meant we never recorded it
    drNrpgJobSyncUpsert.mockResolvedValue({ id: "sync-retry" });

    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const res = await POST(
      makeRequest({
        event: "job.updated",
        jobId: "job-late-retry",
        claimNumber: "CLM-2",
        timestamp: twoHoursAgo,
      }),
    );

    expect(res.status).toBe(200);
    expect(drNrpgJobSyncUpsert).toHaveBeenCalled();
  });

  it("still rejects an event older than the 24h retry window", async () => {
    const twoDaysAgo = new Date(
      Date.now() - 48 * 60 * 60 * 1000,
    ).toISOString();
    const res = await POST(
      makeRequest({
        event: "job.updated",
        jobId: "job-stale",
        claimNumber: "CLM-2",
        timestamp: twoDaysAgo,
      }),
    );

    expect(res.status).toBe(401);
    expect(drNrpgJobSyncUpsert).not.toHaveBeenCalled();
  });

  it("rejects an event dated more than 5 minutes in the future (RA-6987 clock-skew bound — previously accepted up to +24h ahead)", async () => {
    const sixMinutesAhead = new Date(
      Date.now() + 6 * 60 * 1000,
    ).toISOString();
    const res = await POST(
      makeRequest({
        event: "job.updated",
        jobId: "job-future",
        claimNumber: "CLM-8",
        timestamp: sixMinutesAhead,
      }),
    );

    expect(res.status).toBe(401);
    expect(drNrpgJobSyncUpsert).not.toHaveBeenCalled();
  });

  it("accepts an event within the 5 minute future clock-skew allowance", async () => {
    drNrpgJobSyncFindUnique.mockResolvedValue(null);
    drNrpgJobSyncUpsert.mockResolvedValue({ id: "sync-future-ok" });

    const twoMinutesAhead = new Date(
      Date.now() + 2 * 60 * 1000,
    ).toISOString();
    const res = await POST(
      makeRequest({
        event: "job.updated",
        jobId: "job-future-ok",
        claimNumber: "CLM-9",
        timestamp: twoMinutesAhead,
      }),
    );

    expect(res.status).toBe(200);
    expect(drNrpgJobSyncUpsert).toHaveBeenCalled();
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

  it("dedupes an out-of-order redelivery whose timestamp is older than the last recorded event", async () => {
    // The strictly-older branch of the idempotency guard is what stops a
    // replayed old event (e.g. a captured job.completed redelivered after a
    // later job.updated) from regressing status now that the freshness
    // window admits 24h of history — pin it independently of the
    // equal-timestamp tiebreaker.
    const lastEventAt = new Date();
    drNrpgJobSyncFindUnique.mockResolvedValue({
      id: "sync-existing",
      lastEventAt,
      lastEventType: "job.updated",
    });

    const oneHourEarlier = new Date(
      lastEventAt.getTime() - 60 * 60 * 1000,
    ).toISOString();
    const res = await POST(
      makeRequest({
        event: "job.completed",
        jobId: "job-out-of-order",
        claimNumber: "CLM-7",
        timestamp: oneHourEarlier,
      }),
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.deduplicated).toBe(true);
    expect(drNrpgJobSyncUpsert).not.toHaveBeenCalled();
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

describe("POST /api/webhooks/dr-nrpg — RA-6988 unique backstop (TOCTOU)", () => {
  it("closes the read-then-decide race: a concurrent duplicate job.dispatched creates only ONE inspection", async () => {
    // Both deliveries pass the non-atomic findUnique+staleness guard (neither
    // sees a committed prior row — the TOCTOU window). The DB unique backstop
    // is the tiebreaker: the first create wins, the second raises P2002.
    drNrpgJobSyncFindUnique.mockImplementation((args: any) =>
      Promise.resolve(
        // existingSync lookup (by row id) → no inspection linked yet;
        // idempotency lookup (by compound key) → no prior row.
        args?.where?.id ? { inspectionId: null } : null,
      ),
    );
    drNrpgJobSyncUpsert.mockResolvedValue({ id: "sync-1" });
    drNrpgJobSyncUpdate.mockResolvedValue({});
    drNrpgIntegrationFindUnique.mockResolvedValue({ userId: "user-1" });
    inspectionCreate.mockResolvedValue({ id: "insp-1" });
    vi.mocked(mapPayloadToInspection).mockReturnValue({
      inspectionNumber: "INS-1",
      propertyAddress: "1 Test St, Brisbane QLD 4000",
      propertyPostcode: "4000",
      inspectionDate: new Date(),
      status: "scheduled",
      source: "dr-nrpg",
      claimType: "water",
      needsPostcodeReview: false,
    } as any);

    // Winner: create resolves; loser: create raises P2002.
    drNrpgWebhookEventCreate
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(P2002);

    const ts = new Date().toISOString();
    const dispatched = {
      event: "job.dispatched",
      jobId: "job-race",
      claimNumber: "CLM-RACE",
      propertyAddress: "1 Test St, Brisbane QLD 4000",
      timestamp: ts,
    };

    const first = await POST(makeRequest(dispatched));
    const second = await POST(makeRequest(dispatched));

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const secondJson = await second.json();
    expect(secondJson.status).toBe("duplicate_ignored");
    expect(secondJson.deduplicated).toBe(true);

    // The core invariant: exactly one Inspection row for the one job.
    expect(inspectionCreate).toHaveBeenCalledTimes(1);
    expect(drNrpgWebhookEventCreate).toHaveBeenCalledTimes(2);
  });

  it("does not collapse two distinct same-second events — the unique key differs by eventType", async () => {
    // job.updated then job.completed at the same instant: distinct eventType →
    // distinct unique key → both creates succeed → both are processed.
    drNrpgJobSyncFindUnique.mockResolvedValue(null);
    drNrpgJobSyncUpsert.mockResolvedValue({ id: "sync-1" });
    drNrpgWebhookEventCreate.mockResolvedValue({});

    const ts = new Date().toISOString();

    const updated = await POST(
      makeRequest({
        event: "job.updated",
        jobId: "job-two-events",
        claimNumber: "CLM-2E",
        timestamp: ts,
      }),
    );
    const completed = await POST(
      makeRequest({
        event: "job.completed",
        jobId: "job-two-events",
        claimNumber: "CLM-2E",
        timestamp: ts,
      }),
    );

    expect(updated.status).toBe(200);
    expect(completed.status).toBe(200);
    expect((await updated.json()).deduplicated).toBeFalsy();
    expect((await completed.json()).deduplicated).toBeFalsy();
    expect(drNrpgWebhookEventCreate).toHaveBeenCalledTimes(2);
    expect(drNrpgJobSyncUpsert).toHaveBeenCalledTimes(2);
  });

  it("does NOT swallow a non-P2002 backstop error as a duplicate", async () => {
    drNrpgJobSyncFindUnique.mockResolvedValue(null);
    drNrpgJobSyncUpsert.mockResolvedValue({ id: "sync-1" });
    // A transient DB failure (not a unique violation) must propagate so
    // DR-NRPG retries — it must not be misread as an already-seen duplicate.
    drNrpgWebhookEventCreate.mockRejectedValue(
      Object.assign(new Error("connection reset"), { code: "P1001" }),
    );

    await expect(
      POST(
        makeRequest({
          event: "job.dispatched",
          jobId: "job-db-down",
          claimNumber: "CLM-ERR",
          propertyAddress: "1 Test St, Brisbane QLD 4000",
          timestamp: new Date().toISOString(),
        }),
      ),
    ).rejects.toBeTruthy();

    expect(drNrpgJobSyncUpsert).not.toHaveBeenCalled();
    expect(inspectionCreate).not.toHaveBeenCalled();
  });

  it("rejects an out-of-order older redelivery via the retained staleness check — before the backstop create runs", async () => {
    // The unique key alone would ADMIT a captured older event (different
    // eventType → different key). The timestamp-ordering staleness check must
    // still run first and reject it, without ever reaching the backstop.
    const lastEventAt = new Date();
    drNrpgJobSyncFindUnique.mockResolvedValue({
      id: "sync-existing",
      lastEventAt,
      lastEventType: "job.updated",
    });

    const oneHourEarlier = new Date(
      lastEventAt.getTime() - 60 * 60 * 1000,
    ).toISOString();
    const res = await POST(
      makeRequest({
        event: "job.completed",
        jobId: "job-stale-redelivery",
        claimNumber: "CLM-OOO",
        timestamp: oneHourEarlier,
      }),
    );

    expect(res.status).toBe(200);
    expect((await res.json()).deduplicated).toBe(true);
    expect(drNrpgWebhookEventCreate).not.toHaveBeenCalled();
    expect(drNrpgJobSyncUpsert).not.toHaveBeenCalled();
  });
});
