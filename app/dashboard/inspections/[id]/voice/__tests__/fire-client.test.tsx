import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FIRE_CALL_DEADLINE_MS, getFireWalkthrough, newIdempotencyKey, postFireAction, startVoiceSession } from "../_fire/fire-client";
import type { FireAction } from "@/lib/voice/fire-smoke/schema";

const capture = (transcript: string): FireAction =>
  ({ action: "capture", sessionId: "vs-1", transcript, currentSectionId: "services" }) as FireAction;

describe("frozen save (kind K12: a key belongs to the save, never to the payload)", () => {
  const hook = readFileSync(join(__dirname, "..", "_fire", "use-fire-walkthrough.ts"), "utf8");

  it("every fire save is posted from one place, with the frozen action and its own key", () => {
    expect(hook.match(/postFireAction\(/g) ?? []).toHaveLength(1);
    expect(hook).toMatch(/postFireAction\(inspectionId, save\.action, save\.key\)/);
  });

  it("a key is made only when a new save is frozen, and only retry re-sends a held one", () => {
    expect(hook.match(/newIdempotencyKey\(\)/g) ?? []).toHaveLength(1);
    expect(hook).toMatch(/await deliver\(\{ action, words, onDone, key: newIdempotencyKey\(\) \}\)/);
    expect(hook).toMatch(/if \(held\.current\) await deliver\(held\.current\)/);
  });

  it("no key is derived from the payload's contents", () => {
    const client = readFileSync(join(__dirname, "..", "_fire", "fire-client.ts"), "utf8");
    expect(client).not.toMatch(/createKeyRing|keyFor\(/);
    expect(hook).not.toMatch(/keyFor\(/);
    expect(newIdempotencyKey()).not.toBe(newIdempotencyKey());
  });
});

describe("postFireAction (kind K12: only a final refusal releases the key)", () => {
  afterEach(() => vi.unstubAllGlobals());
  const reply = (status: number) =>
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "x" }), { status })));

  it.each([408, 409, 425, 429, 499, 500, 502, 503, 504])("%i is unconfirmed, so the key is kept", async (status) => {
    reply(status);
    expect(await postFireAction("insp-1", capture("Gas meter is off"), "k-1")).toMatchObject({ ok: false, kind: "unconfirmed", status });
  });

  it.each([400, 401, 403, 404, 422])("%i is a final refusal", async (status) => {
    reply(status);
    expect(await postFireAction("insp-1", capture("Gas meter is off"), "k-1")).toMatchObject({ ok: false, kind: "refused", status });
  });

  it("no reply at all is unconfirmed", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    expect(await postFireAction("insp-1", capture("Gas meter is off"), "k-1")).toMatchObject({ ok: false, kind: "unconfirmed" });
  });

  it.each([
    ["an unreadable body", "{not json"],
    ["an empty body", ""],
    ["a null body", "null"],
    ["a body with no status", JSON.stringify({ outcome: { kind: "filed" } })],
    ["a null status", JSON.stringify({ status: null, applicable: true })],
    ["an empty status", JSON.stringify({ status: {}, applicable: true, nextPrompt: "x", nextSectionId: null })],
  ])("a 200 with %s is unconfirmed and never throws (round 15)", async (_label, body) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status: 200 })));
    await expect(postFireAction("insp-1", capture("Gas meter is off"), "k-1")).resolves.toMatchObject({
      ok: false,
      kind: "unconfirmed",
      status: 200,
    });
  });
});

describe("every reply passes a schema before it counts (kind K15, round 16)", () => {
  afterEach(() => vi.unstubAllGlobals());
  const reply200 = (body: string) => vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status: 200 })));

  it.each(["null", "{}", JSON.stringify({ status: null, applicable: true })])(
    "a malformed walkthrough load (%s) is unconfirmed",
    async (body) => {
      reply200(body);
      await expect(getFireWalkthrough("insp-1")).resolves.toMatchObject({ ok: false, kind: "unconfirmed" });
    },
  );

  it.each(["null", "{}", JSON.stringify({ session: null }), JSON.stringify({ session: { sessionId: "" } }), "{bad"])(
    "a malformed voice session reply (%s) gives no session and never throws",
    async (body) => {
      reply200(body);
      await expect(startVoiceSession("insp-1")).resolves.toBeNull();
    },
  );

  it("the schema is a required argument of call(), so no request can skip it", () => {
    const client = readFileSync(join(__dirname, "..", "_fire", "fire-client.ts"), "utf8");
    expect(client).toMatch(/async function call<T>\(input: string, init: RequestInit, schema: z\.ZodType<T>\)/);
    expect(client).not.toMatch(/as T\b/);
  });
});

describe("a refusal counts only when its body passes the refusal schema (kind K15, round 17)", () => {
  afterEach(() => vi.unstubAllGlobals());
  const reply = (status: number, body: string) =>
    vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status })));

  it.each([
    ["an object error with no message", JSON.stringify({ error: { code: "X" } })],
    ["a number error", JSON.stringify({ error: 42 })],
    ["an empty error", JSON.stringify({ error: "" })],
    ["a blocker with an unknown code", JSON.stringify({ error: "x", code: "NOPE", openSectionIds: [] })],
    ["null", "null"],
    ["unreadable", "{bad"],
  ])("a 422 with %s is unconfirmed, so the save keeps its key", async (_label, body) => {
    reply(422, body);
    await expect(postFireAction("insp-1", capture("Gas meter is off"), "k-1")).resolves.toMatchObject({
      ok: false,
      kind: "unconfirmed",
      status: 422,
    });
  });

  it("the shared apiError shape gives its message as a plain string", async () => {
    reply(401, JSON.stringify({ error: { code: "UNAUTHORIZED", message: "Please sign in again.", eventId: "e-1" } }));
    const result = await postFireAction("insp-1", capture("Gas meter is off"), "k-1");
    expect(result).toEqual({ ok: false, kind: "refused", status: 401, message: "Please sign in again." });
  });

  it("a fire blocker keeps its code for the screen", async () => {
    const blocker = { error: "Your view is out of date.", code: "REVIEW_STALE", openSectionIds: [] };
    reply(422, JSON.stringify(blocker));
    const result = await postFireAction("insp-1", capture("Gas meter is off"), "k-1");
    expect(result).toEqual({ ok: false, kind: "refused", status: 422, message: blocker.error, body: blocker });
  });

  it("every body is read in one place, through a schema", () => {
    const client = readFileSync(join(__dirname, "..", "_fire", "fire-client.ts"), "utf8");
    expect(client.match(/\.json\(\)/g) ?? []).toHaveLength(1);
    expect(client).toMatch(/schema\.safeParse\(await res\.json\(\)\)/);
    expect(client).toMatch(/readChecked\(res, fireRefusalSchema\)/);
  });
});

describe("a call is bounded by one deadline over the request and the body read", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("a connection that never answers is unconfirmed once the deadline passes", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));
    const result = postFireAction("insp-1", capture("Gas meter is off"), "k-1");
    await vi.advanceTimersByTimeAsync(FIRE_CALL_DEADLINE_MS + 1);
    await expect(result).resolves.toMatchObject({ ok: false, kind: "unconfirmed" });
  });

  it("a reply whose body never finishes is unconfirmed once the deadline passes", async () => {
    vi.useFakeTimers();
    const stalled = { ok: true, status: 200, json: () => new Promise(() => {}) } as unknown as Response;
    vi.stubGlobal("fetch", vi.fn(async () => stalled));
    const result = postFireAction("insp-1", capture("Gas meter is off"), "k-1");
    await vi.advanceTimersByTimeAsync(FIRE_CALL_DEADLINE_MS + 1);
    await expect(result).resolves.toMatchObject({ ok: false, kind: "unconfirmed" });
  });

  it("an answer inside the deadline is returned and leaves no timer behind", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "x" }), { status: 404 })));
    await expect(postFireAction("insp-1", capture("Gas meter is off"), "k-1")).resolves.toMatchObject({ kind: "refused", status: 404 });
    expect(vi.getTimerCount()).toBe(0);
  });
});
