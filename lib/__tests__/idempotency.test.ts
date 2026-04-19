import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import {
  withIdempotency,
  getIdempotencyKey,
  __resetIdempotencyStore,
} from "../idempotency";

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

describe("withIdempotency", () => {
  beforeEach(() => __resetIdempotencyStore());

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
