import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { newIdempotencyKey, postFireAction } from "../_fire/fire-client";
import type { FireAction } from "@/lib/voice/fire-smoke/schema";

const capture = (transcript: string): FireAction =>
  ({ action: "capture", sessionId: "vs-1", transcript, currentSectionId: "services" }) as FireAction;

describe("frozen save (kind K12: a key belongs to the save, never to the payload)", () => {
  const hook = readFileSync(join(__dirname, "..", "_fire", "use-fire-walkthrough.ts"), "utf8");

  it("every fire save is posted from one place, with the frozen action and its own key", () => {
    expect(hook.match(/postFireAction\(/g) ?? []).toHaveLength(1);
    expect(hook).toMatch(/postFireAction\(inspectionId, save\.action, save\.key\)/);
  });

  it("a key is made only when a new save is frozen, and the held save is re-sent first", () => {
    expect(hook.match(/newIdempotencyKey\(\)/g) ?? []).toHaveLength(1);
    expect(hook).toMatch(/const save: HeldSave = earlier \?\? \{ action, words, onDone, key: newIdempotencyKey\(\) \}/);
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
  ])("a 200 with %s is unconfirmed and never throws (round 15)", async (_label, body) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status: 200 })));
    await expect(postFireAction("insp-1", capture("Gas meter is off"), "k-1")).resolves.toMatchObject({
      ok: false,
      kind: "unconfirmed",
      status: 200,
    });
  });
});
