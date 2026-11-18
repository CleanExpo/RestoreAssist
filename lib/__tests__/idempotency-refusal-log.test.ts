import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

/**
 * RA-8388: every refusal the idempotency layer answers in its plain
 * `{ error }` shape also leaves one `[api-refusal]` line. The in-memory store
 * below is the smallest one the layer's reserve, replay and complete steps
 * need; it follows the mocking approach of idempotency.test.ts.
 */
const store = vi.hoisted(() => {
  type Rec = Record<string, unknown> & { id: string; cacheKey: string };
  const records = new Map<string, Rec>();
  let next = 1;
  return {
    records,
    reset() {
      records.clear();
    },
    api: {
      async create({ data }: { data: Record<string, unknown> }) {
        const cacheKey = data.cacheKey as string;
        if (records.has(cacheKey)) throw { code: "P2002" };
        const rec = { ...data, cacheKey, id: `res-${next++}` } as Rec;
        records.set(cacheKey, rec);
        return rec;
      },
      async findUnique({ where }: { where: { cacheKey: string } }) {
        return records.get(where.cacheKey) ?? null;
      },
      async updateMany({
        where,
        data,
      }: {
        where: { cacheKey: string; id?: string };
        data: Record<string, unknown>;
      }) {
        const existing = records.get(where.cacheKey);
        if (!existing || (where.id && existing.id !== where.id)) {
          return { count: 0 };
        }
        records.set(where.cacheKey, { ...existing, ...data });
        return { count: 1 };
      },
      async deleteMany({ where }: { where?: { cacheKey?: string } } = {}) {
        if (where?.cacheKey) {
          return { count: records.delete(where.cacheKey) ? 1 : 0 };
        }
        return { count: 0 };
      },
    },
  };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    idempotencyRecord: store.api,
    clientMutation: {
      create: async () => ({}),
      updateMany: async () => ({ count: 1 }),
    },
  },
}));

import { withIdempotency, withIdempotencyFingerprint } from "../idempotency";

function makeReq(
  body: unknown,
  headers: Record<string, string> = {},
): NextRequest {
  return new NextRequest("http://localhost/api/refusal-log-test?secret=never", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("idempotency refusals leave an [api-refusal] line", () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    store.reset();
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
  });

  function refusalLines(): Record<string, unknown>[] {
    return warn.mock.calls
      .filter((call) => call[0] === "[api-refusal]")
      .map((call) => JSON.parse(String(call[1])));
  }

  const run = (
    key: string,
    fingerprint: string,
    handler: () => Promise<NextResponse>,
  ) =>
    withIdempotencyFingerprint({
      scope: "refusal-log",
      key,
      method: "POST",
      path: "/api/refusal-log-test",
      fingerprint,
      handler,
    });

  it("IDEMPOTENCY_KEY_REUSED: same key, different body", async () => {
    await run("reuse-key-1", "body-a", async () => NextResponse.json({ ok: 1 }));
    warn.mockClear();

    const response = await run("reuse-key-1", "body-b", async () =>
      NextResponse.json({ ok: 2 }),
    );

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(Object.keys(body)).toEqual(["error"]);
    const lines = refusalLines();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      code: "IDEMPOTENCY_KEY_REUSED",
      status: 409,
      stage: "idempotency",
      route: "/api/refusal-log-test",
    });
  });

  it("IDEMPOTENCY_IN_PROGRESS: same key and body while the first is running", async () => {
    let release!: () => void;
    let entered!: () => void;
    const inside = new Promise<void>((r) => (entered = r));
    const gate = new Promise<void>((r) => (release = r));
    const first = run("pending-key-1", "body-a", async () => {
      entered();
      await gate;
      return NextResponse.json({ ok: 1 });
    });
    await inside;

    const response = await run("pending-key-1", "body-a", async () =>
      NextResponse.json({ ok: 2 }),
    );

    expect(response.status).toBe(409);
    expect(Object.keys(await response.json())).toEqual(["error"]);
    const lines = refusalLines();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      code: "IDEMPOTENCY_IN_PROGRESS",
      status: 409,
      stage: "idempotency",
      route: "/api/refusal-log-test",
    });
    release();
    await first;
  });

  it("IDEMPOTENCY_COMPLETION_UNVERIFIED: the reservation vanished before completion", async () => {
    const response = await run("lost-key-1", "body-a", async () => {
      store.reset();
      return NextResponse.json({ ok: 1 });
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Request completion could not be verified; check its status before retrying",
    });
    expect(response.headers.get("X-RestoreAssist-Idempotency-Uncertain")).toBe(
      "true",
    );
    const lines = refusalLines();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      code: "IDEMPOTENCY_COMPLETION_UNVERIFIED",
      status: 409,
      stage: "idempotency",
      route: "/api/refusal-log-test",
    });
  });

  it("IDEMPOTENCY_KEY_INVALID: a malformed key is refused before the handler", async () => {
    const handler = vi.fn(async () => NextResponse.json({ ok: 1 }));

    const response = await withIdempotency(
      makeReq({ a: 1 }, { "idempotency-key": "short" }),
      "user-1",
      handler,
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(Object.keys(body)).toEqual(["error"]);
    expect(handler).not.toHaveBeenCalled();
    const lines = refusalLines();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      code: "IDEMPOTENCY_KEY_INVALID",
      status: 400,
      stage: "idempotency",
      route: "/api/refusal-log-test",
    });
  });

  it("CLIENT_MUTATION_ID_INVALID: a malformed mutation id is refused before the handler", async () => {
    const handler = vi.fn(async () => NextResponse.json({ ok: 1 }));

    const response = await withIdempotency(
      makeReq(
        { a: 1 },
        {
          "idempotency-key": "valid-key-12345",
          "x-restoreassist-mutation-id": "bad id 123",
        },
      ),
      "user-1",
      handler,
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(Object.keys(body)).toEqual(["error"]);
    expect(handler).not.toHaveBeenCalled();
    const lines = refusalLines();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      code: "CLIENT_MUTATION_ID_INVALID",
      status: 400,
      stage: "idempotency",
      route: "/api/refusal-log-test",
    });
  });
});
