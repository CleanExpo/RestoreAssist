import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const idempotencyDb = vi.hoisted(() => {
  type RecordValue = {
    id: string;
    cacheKey: string;
    scope: string;
    key: string;
    fingerprint: string;
    status: string;
    responseStatus: number | null;
    responseBody: string | null;
    responseContentType: string | null;
    expiresAt: Date;
  };
  type ClientMutationValue = {
    workspaceId: string;
    userId: string | null;
    inspectionId: string | null;
    mutationId: string;
    mutationType: string;
    method: string;
    path: string;
    requestHash: string;
    status: string;
    responseStatus: number | null;
    responseBody: string | null;
    errorCode: string | null;
    completedAt: Date | null;
  };

  const records = new Map<string, RecordValue>();
  const clientMutations = new Map<string, ClientMutationValue>();
  let nextRecordId = 1;

  return {
    records,
    clientMutations,
    idempotencyRecord: {
      async create({ data }: { data: Omit<RecordValue, "id"> }) {
        if (records.has(data.cacheKey)) {
          throw { code: "P2002" };
        }
        records.set(data.cacheKey, {
          ...data,
          id: `reservation-${nextRecordId++}`,
          responseStatus: data.responseStatus ?? null,
          responseBody: data.responseBody ?? null,
          responseContentType: data.responseContentType ?? null,
        });
        return records.get(data.cacheKey);
      },
      async findUnique({
        where,
      }: {
        where: { cacheKey: string };
        select?: Record<string, boolean>;
      }) {
        return records.get(where.cacheKey) ?? null;
      },
      async update({
        where,
        data,
      }: {
        where: { cacheKey: string };
        data: Partial<RecordValue>;
      }) {
        const existing = records.get(where.cacheKey);
        if (!existing) throw new Error("Record not found");
        const updated = { ...existing, ...data };
        records.set(where.cacheKey, updated);
        return updated;
      },
      async updateMany({ where, data }: {
        where: { cacheKey: string; id?: string; scope?: string; key?: string; fingerprint?: string; status?: string; expiresAt?: { gt: Date } };
        data: Partial<RecordValue>;
      }) {
        const existing = records.get(where.cacheKey);
        if (!existing || (where.id && existing.id !== where.id) ||
            (where.scope && existing.scope !== where.scope) || (where.key && existing.key !== where.key) ||
            (where.fingerprint && existing.fingerprint !== where.fingerprint) ||
            (where.status && existing.status !== where.status) ||
            (where.expiresAt?.gt && existing.expiresAt <= where.expiresAt.gt)) return { count: 0 };
        records.set(where.cacheKey, { ...existing, ...data });
        return { count: 1 };
      },
      async deleteMany(args?: {
        where?: { cacheKey?: string; id?: string; status?: string; expiresAt?: { lt: Date } };
      }) {
        if (!args?.where) {
          const count = records.size;
          records.clear();
          return { count };
        }

        if (args.where.cacheKey) {
          const record = records.get(args.where.cacheKey);
          if (!record ||
              (args.where.id && record.id !== args.where.id) ||
              (args.where.status && record.status !== args.where.status) ||
              (args.where.expiresAt?.lt && record.expiresAt >= args.where.expiresAt.lt)) {
            return { count: 0 };
          }
          const deleted = records.delete(args.where.cacheKey);
          return { count: deleted ? 1 : 0 };
        }

        if (args.where.expiresAt?.lt) {
          let count = 0;
          for (const [cacheKey, record] of records) {
            if (record.expiresAt < args.where.expiresAt.lt) {
              records.delete(cacheKey);
              count++;
            }
          }
          return { count };
        }

        return { count: 0 };
      },
    },
    clientMutation: {
      async create({ data }: { data: ClientMutationValue }) {
        const key = `${data.workspaceId}:${data.mutationId}`;
        if (clientMutations.has(key)) throw { code: "P2002" };
        clientMutations.set(key, {
          ...data,
          userId: data.userId ?? null,
          inspectionId: data.inspectionId ?? null,
          responseStatus: data.responseStatus ?? null,
          responseBody: data.responseBody ?? null,
          errorCode: data.errorCode ?? null,
          completedAt: data.completedAt ?? null,
        });
        return clientMutations.get(key);
      },
      async updateMany({
        where,
        data,
      }: {
        where: { workspaceId: string; mutationId: string };
        data: Partial<ClientMutationValue>;
      }) {
        const key = `${where.workspaceId}:${where.mutationId}`;
        const existing = clientMutations.get(key);
        if (!existing) return { count: 0 };
        clientMutations.set(key, { ...existing, ...data });
        return { count: 1 };
      },
    },
  };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    idempotencyRecord: idempotencyDb.idempotencyRecord,
    clientMutation: idempotencyDb.clientMutation,
  },
}));

import {
  withIdempotency,
  completeIdempotentSuccessInTransaction,
  getIdempotencyKey,
  getClientMutationId,
  __resetIdempotencyStore,
} from "../idempotency";
import { isRecentlyIssuedCreationKey } from "../creation-attempt-key";

describe("creation key retry age", () => {
  const uuid = "123e4567-e89b-42d3-a456-426614174000";
  it("permits overnight timestamped keys only well inside the 24-hour cache lifetime", () => {
    const now = Date.now();
    expect(isRecentlyIssuedCreationKey(`report-initial-${now - 30_000}-${uuid}`, "report-initial", now)).toBe(true);
    expect(isRecentlyIssuedCreationKey(`report-initial-${now - 12 * 60 * 60 * 1000}-${uuid}`, "report-initial", now)).toBe(true);
    expect(isRecentlyIssuedCreationKey(`report-initial-${now - 21 * 60 * 60 * 1000}-${uuid}`, "report-initial", now)).toBe(false);
    expect(isRecentlyIssuedCreationKey(`report-initial-${now - 24 * 60 * 60 * 1000}-${uuid}`, "report-initial", now)).toBe(false);
    expect(isRecentlyIssuedCreationKey(`report-initial-${now + 1000}-${uuid}`, "report-initial", now)).toBe(false);
    expect(isRecentlyIssuedCreationKey(`report-initial-${uuid}`, "report-initial", now)).toBe(false);
    expect(isRecentlyIssuedCreationKey(`nir-inspection-${now}-${uuid}`, "report-initial", now)).toBe(false);
  });
});

function makeReq(
  body: unknown,
  headers: Record<string, string> = {},
  path = "/api/test",
): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("getIdempotencyKey", () => {
  it("returns ok:true key:null when header absent", () => {
    const r = getIdempotencyKey(makeReq({ a: 1 }));
    expect(r).toEqual({ ok: true, key: null });
  });

  it("accepts a valid key", () => {
    const r = getIdempotencyKey(
      makeReq({ a: 1 }, { "idempotency-key": "abc12345" }),
    );
    expect(r).toEqual({ ok: true, key: "abc12345" });
  });

  it("rejects too-short key", () => {
    const r = getIdempotencyKey(
      makeReq({ a: 1 }, { "idempotency-key": "short" }),
    );
    expect(r.ok).toBe(false);
  });

  it("rejects key with whitespace", () => {
    const r = getIdempotencyKey(
      makeReq({ a: 1 }, { "idempotency-key": "has space123" }),
    );
    expect(r.ok).toBe(false);
  });

  it("rejects non-ASCII key", () => {
    const r = getIdempotencyKey(
      makeReq({ a: 1 }, { "idempotency-key": "café12345" }),
    );
    expect(r.ok).toBe(false);
  });
});

describe("getClientMutationId", () => {
  it("returns ok:true mutationId:null when header absent", () => {
    const r = getClientMutationId(makeReq({ a: 1 }));
    expect(r).toEqual({ ok: true, mutationId: null });
  });

  it("accepts a valid mobile mutation id", () => {
    const r = getClientMutationId(
      makeReq(
        { a: 1 },
        { "x-restoreassist-mutation-id": "ra-mobile-12345" },
      ),
    );
    expect(r).toEqual({ ok: true, mutationId: "ra-mobile-12345" });
  });

  it("rejects mutation ids with whitespace", () => {
    const r = getClientMutationId(
      makeReq({ a: 1 }, { "x-restoreassist-mutation-id": "bad id 123" }),
    );
    expect(r.ok).toBe(false);
  });
});

describe("withIdempotency", () => {
  beforeEach(() => {
    idempotencyDb.clientMutations.clear();
    return __resetIdempotencyStore();
  });

  it("passes through when no key supplied", async () => {
    let calls = 0;
    const handler = async () => {
      calls++;
      return NextResponse.json({ id: 1 });
    };
    const r1 = await withIdempotency(makeReq({ a: 1 }), "user1", handler);
    const r2 = await withIdempotency(makeReq({ a: 1 }), "user1", handler);
    expect(calls).toBe(2);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
  });

  it("replays cached response on duplicate key+body", async () => {
    let calls = 0;
    const handler = async () => {
      calls++;
      return NextResponse.json({ id: calls });
    };
    const headers = { "idempotency-key": "key-abc123" };
    const r1 = await withIdempotency(makeReq({ a: 1 }, headers), "u", handler);
    const r2 = await withIdempotency(makeReq({ a: 1 }, headers), "u", handler);
    expect(calls).toBe(1);
    expect(await r1.json()).toEqual({ id: 1 });
    expect(await r2.json()).toEqual({ id: 1 });
    expect(r2.headers.get("idempotent-replayed")).toBe("true");
  });
  it("replays an atomically completed charge and report after the response is lost", async () => {
    let chargedCredits = 0;
    let reportRows = 0;
    const headers = { "idempotency-key": "report-initial-atomic-test" };
    const make = (body: unknown) => makeReq(body, headers, "/api/reports/initial-entry");
    const handler = async (rawBody: string) => {
      const payload = JSON.stringify({ report: { id: "single-report" } });
      const completed = await completeIdempotentSuccessInTransaction({
        tx: { idempotencyRecord: idempotencyDb.idempotencyRecord } as never,
        scope: "owner-a", key: headers["idempotency-key"], method: "POST",
        path: "/api/reports/initial-entry", rawBody, responseBody: payload,
      });
      if (!completed) throw new Error("reservation lost");
      chargedCredits++;
      reportRows++;
      return NextResponse.json({ report: { id: "single-report" } });
    };
    const first = await withIdempotency(make({ client: "A" }), "owner-a", handler, { successCompletedInHandler: true });
    expect(first.status).toBe(200); // client loses this committed response
    const replay = await withIdempotency(make({ client: "A" }), "owner-a", handler, { successCompletedInHandler: true });
    expect(replay.status).toBe(200);
    expect(replay.headers.get("Idempotent-Replayed")).toBe("true");
    expect((await replay.json()).report.id).toBe("single-report");
    expect(chargedCredits).toBe(1);
    expect(reportRows).toBe(1);
    expect((await withIdempotency(make({ client: "B" }), "owner-a", handler, { successCompletedInHandler: true })).status).toBe(409);
    expect(chargedCredits).toBe(1);
    expect(reportRows).toBe(1);
  });
  it.each(["throws", "returns 500"] as const)("preserves an atomic completion when its handler %s afterwards", async (failure) => {
    const key = `report-postcommit-${failure.replace(" ", "-")}`;
    const path = "/api/reports/initial-entry";
    const make = () => makeReq({ client: "A" }, { "idempotency-key": key }, path);
    let committed = 0;
    const handler = async (rawBody: string) => {
      const completed = await completeIdempotentSuccessInTransaction({
        tx: { idempotencyRecord: idempotencyDb.idempotencyRecord } as never,
        scope: "owner-a", key, method: "POST", path, rawBody,
        responseBody: JSON.stringify({ report: { id: "committed-report" } }),
      });
      expect(completed).toBe(true);
      committed++;
      if (failure === "throws") throw new Error("synthetic postcommit response failure");
      return NextResponse.json({ error: "synthetic postcommit response failure" }, { status: 500 });
    };
    if (failure === "throws") {
      await expect(withIdempotency(make(), "owner-a", handler, { successCompletedInHandler: true }))
        .rejects.toThrow("synthetic postcommit response failure");
    } else {
      expect((await withIdempotency(make(), "owner-a", handler, { successCompletedInHandler: true })).status).toBe(500);
    }
    const replay = await withIdempotency(make(), "owner-a", handler, { successCompletedInHandler: true });
    expect(replay.status).toBe(200);
    expect(replay.headers.get("Idempotent-Replayed")).toBe("true");
    expect((await replay.json()).report.id).toBe("committed-report");
    expect(committed).toBe(1);
  });
  it("does not let an expired first handler delete a replacement reservation", async () => {
    const key = "reservation-owner-race";
    const make = () => makeReq({ client: "A" }, { "idempotency-key": key });
    let firstStarted!: () => void;
    let finishFirst!: () => void;
    let secondStarted!: () => void;
    let finishSecond!: () => void;
    const enteredFirst = new Promise<void>((resolve) => { firstStarted = resolve; });
    const firstGate = new Promise<void>((resolve) => { finishFirst = resolve; });
    const enteredSecond = new Promise<void>((resolve) => { secondStarted = resolve; });
    const secondGate = new Promise<void>((resolve) => { finishSecond = resolve; });
    const first = withIdempotency(make(), "owner-a", async () => {
      firstStarted();
      await firstGate;
      throw new Error("first handler timed out");
    });
    await enteredFirst;
    const oldRecord = [...idempotencyDb.records.values()][0];
    oldRecord.expiresAt = new Date(Date.now() - 1000);
    const second = withIdempotency(make(), "owner-a", async () => {
      secondStarted();
      await secondGate;
      return NextResponse.json({ id: "replacement" });
    });
    await enteredSecond;
    finishFirst();
    await expect(first).rejects.toThrow("first handler timed out");
    expect(idempotencyDb.records.get(oldRecord.cacheKey)?.id).not.toBe(oldRecord.id);
    expect((await withIdempotency(make(), "owner-a", async () => NextResponse.json({ id: "unexpected" }))).status).toBe(409);
    finishSecond();
    expect((await second).status).toBe(200);
    expect((await (await withIdempotency(make(), "owner-a", async () => NextResponse.json({ id: "unexpected" }))).json()).id)
      .toBe("replacement");
  });
  it("does not let a late generic success overwrite a replacement reservation with a different fingerprint", async () => {
    const key = "reservation-success-race";
    const make = (body: string) => makeReq({ client: body }, { "idempotency-key": key });
    let firstStarted!: () => void;
    let finishFirst!: () => void;
    let secondStarted!: () => void;
    let finishSecond!: () => void;
    const enteredFirst = new Promise<void>((resolve) => { firstStarted = resolve; });
    const firstGate = new Promise<void>((resolve) => { finishFirst = resolve; });
    const enteredSecond = new Promise<void>((resolve) => { secondStarted = resolve; });
    const secondGate = new Promise<void>((resolve) => { finishSecond = resolve; });
    const first = withIdempotency(make("A"), "owner-a", async () => {
      firstStarted();
      await firstGate;
      return NextResponse.json({ id: "stale-A" });
    });
    await enteredFirst;
    const oldRecord = [...idempotencyDb.records.values()][0];
    oldRecord.expiresAt = new Date(Date.now() - 1000);
    const second = withIdempotency(make("B"), "owner-a", async () => {
      secondStarted();
      await secondGate;
      return NextResponse.json({ id: "current-B" });
    });
    await enteredSecond;
    finishFirst();
    const staleResult = await first;
    expect(staleResult.status).toBe(409);
    expect(staleResult.headers.get("X-RestoreAssist-Idempotency-Uncertain")).toBe("true");
    expect(idempotencyDb.records.get(oldRecord.cacheKey)?.status).toBe("PENDING");
    finishSecond();
    expect((await second).status).toBe(200);
    const replay = await withIdempotency(make("B"), "owner-a", async () => NextResponse.json({ id: "unexpected" }));
    expect((await replay.json()).id).toBe("current-B");
    expect((await withIdempotency(make("A"), "owner-a", async () => NextResponse.json({ id: "unexpected" }))).status).toBe(409);
  });
  it("replays an atomically completed 201 while still caching unmarked successes", async () => {
    let created = 0;
    const key = "inspection-atomic-test";
    const path = "/api/inspections";
    const make = () => makeReq({ clientId: "c1" }, { "idempotency-key": key }, path);
    const first = await withIdempotency(make(), "owner-a", async (rawBody) => {
      const payload = JSON.stringify({ inspection: { id: "job-1" } });
      expect(await completeIdempotentSuccessInTransaction({
        tx: { idempotencyRecord: idempotencyDb.idempotencyRecord } as never,
        scope: "owner-a", key, method: "POST", path, rawBody,
        responseBody: payload, responseStatus: 201,
      })).toBe(true);
      created++;
      return NextResponse.json({ inspection: { id: "job-1" } }, {
        status: 201,
        headers: { "X-RestoreAssist-Idempotency-Completed-In-Transaction": "true" },
      });
    }, { successCompletedInHandler: "when-marked" });
    expect(first.status).toBe(201);
    const replay = await withIdempotency(make(), "owner-a", async () => {
      throw new Error("must replay the committed inspection");
    }, { successCompletedInHandler: "when-marked" });
    expect(replay.status).toBe(201);
    expect((await replay.json()).inspection.id).toBe("job-1");
    expect(created).toBe(1);

    let existingCalls = 0;
    const existing = () => makeReq({ reportId: "r1" }, { "idempotency-key": "inspection-existing-test" }, path);
    await withIdempotency(existing(), "owner-a", async () => {
      existingCalls++;
      return NextResponse.json({ inspection: { id: "old-job" } });
    }, { successCompletedInHandler: "when-marked" });
    const existingReplay = await withIdempotency(existing(), "owner-a", async () => {
      existingCalls++;
      return NextResponse.json({ inspection: { id: "wrong-job" } });
    }, { successCompletedInHandler: "when-marked" });
    expect((await existingReplay.json()).inspection.id).toBe("old-job");
    expect(existingCalls).toBe(1);
  });
  it("does not overwrite another completed result with a stale reservation conflict", async () => {
    const headers = { "idempotency-key": "report-initial-race-test" };
    const make = () => makeReq({ client: "A" }, headers, "/api/reports/initial-entry");
    const first = await withIdempotency(make(), "owner-a", async (rawBody) => {
      expect(await completeIdempotentSuccessInTransaction({
        tx: { idempotencyRecord: idempotencyDb.idempotencyRecord } as never,
        scope: "owner-a", key: headers["idempotency-key"], method: "POST",
        path: "/api/reports/initial-entry", rawBody,
        responseBody: JSON.stringify({ report: { id: "winner" } }),
      })).toBe(true);
      return NextResponse.json({ error: "reservation lost" }, {
        status: 409,
        headers: { "X-RestoreAssist-Idempotency-Uncertain": "true" },
      });
    }, { successCompletedInHandler: true });
    expect(first.status).toBe(409);
    const replay = await withIdempotency(make(), "owner-a", async () => {
      throw new Error("should replay winner");
    }, { successCompletedInHandler: true });
    expect(replay.status).toBe(200);
    expect((await replay.json()).report.id).toBe("winner");
  });

  it("returns 409 when same key has different body", async () => {
    const handler = async () => NextResponse.json({ ok: true });
    const headers = { "idempotency-key": "key-abc123" };
    await withIdempotency(makeReq({ a: 1 }, headers), "u", handler);
    const r2 = await withIdempotency(makeReq({ a: 2 }, headers), "u", handler);
    expect(r2.status).toBe(409);
  });

  it("scopes keys per user — same key, different users don't collide", async () => {
    let calls = 0;
    const handler = async () => {
      calls++;
      return NextResponse.json({ user: calls });
    };
    const headers = { "idempotency-key": "shared-key-xyz" };
    await withIdempotency(makeReq({ a: 1 }, headers), "userA", handler);
    await withIdempotency(makeReq({ a: 1 }, headers), "userB", handler);
    expect(calls).toBe(2);
  });

  it("does not cache 5xx responses — retries run the handler again", async () => {
    let calls = 0;
    const handler = async () => {
      calls++;
      if (calls === 1) return NextResponse.json({ err: true }, { status: 500 });
      return NextResponse.json({ ok: true });
    };
    const headers = { "idempotency-key": "key-retry1" };
    const r1 = await withIdempotency(makeReq({ a: 1 }, headers), "u", handler);
    const r2 = await withIdempotency(makeReq({ a: 1 }, headers), "u", handler);
    expect(r1.status).toBe(500);
    expect(r2.status).toBe(200);
    expect(calls).toBe(2);
  });

  it("caches 4xx client errors (they're deterministic for same input)", async () => {
    let calls = 0;
    const handler = async () => {
      calls++;
      return NextResponse.json({ err: "bad" }, { status: 400 });
    };
    const headers = { "idempotency-key": "key-4xx0000" };
    await withIdempotency(makeReq({ a: 1 }, headers), "u", handler);
    await withIdempotency(makeReq({ a: 1 }, headers), "u", handler);
    expect(calls).toBe(1);
  });

  it("releases pending slot if handler throws", async () => {
    let calls = 0;
    const handler = async () => {
      calls++;
      if (calls === 1) throw new Error("boom");
      return NextResponse.json({ ok: true });
    };
    const headers = { "idempotency-key": "key-throw01" };
    await expect(
      withIdempotency(makeReq({ a: 1 }, headers), "u", handler),
    ).rejects.toThrow("boom");
    const r2 = await withIdempotency(makeReq({ a: 1 }, headers), "u", handler);
    expect(r2.status).toBe(200);
    expect(calls).toBe(2);
  });

  it("returns 409 while a matching request is still pending", async () => {
    let release!: () => void;
    const handler = async () => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return NextResponse.json({ ok: true });
    };

    const headers = { "idempotency-key": "key-pending1" };
    const first = withIdempotency(makeReq({ a: 1 }, headers), "u", handler);
    const second = await withIdempotency(
      makeReq({ a: 1 }, headers),
      "u",
      handler,
    );

    expect(second.status).toBe(409);

    release();
    expect((await first).status).toBe(200);
  });

  it("records ClientMutation ledger rows for mobile mutation ids", async () => {
    const headers = {
      "idempotency-key": "key-ledger1",
      "x-restoreassist-mutation-id": "ra-ledger-1",
    };

    const response = await withIdempotency(
      makeReq({ a: 1 }, headers, "/api/inspections/i_1/evidence"),
      "u",
      async () => NextResponse.json({ ok: true }, { status: 201 }),
      {
        clientMutation: {
          workspaceId: "ws_1",
          userId: "u",
          inspectionId: "i_1",
          mutationType: "evidence-item",
        },
      },
    );

    const mutation = idempotencyDb.clientMutations.get("ws_1:ra-ledger-1");
    expect(response.status).toBe(201);
    expect(mutation).toMatchObject({
      workspaceId: "ws_1",
      userId: "u",
      inspectionId: "i_1",
      mutationId: "ra-ledger-1",
      mutationType: "evidence-item",
      method: "POST",
      path: "/api/inspections/i_1/evidence",
      status: "COMPLETE",
      responseStatus: 201,
    });
  });

  it("rejects malformed keys with 400", async () => {
    const handler = async () => NextResponse.json({ ok: true });
    const r = await withIdempotency(
      makeReq({ a: 1 }, { "idempotency-key": "bad" }),
      "u",
      handler,
    );
    expect(r.status).toBe(400);
  });

  it("passes parsed body to handler", async () => {
    let received: string | undefined;
    const handler = async (body: string) => {
      received = body;
      return NextResponse.json({ ok: true });
    };
    await withIdempotency(makeReq({ hello: "world" }), "u", handler);
    expect(received).toBe(JSON.stringify({ hello: "world" }));
  });
});
