import { afterEach, describe, expect, it, vi } from "vitest";
import { createKeyRing, postFireAction } from "../_fire/fire-client";
import type { FireAction } from "@/lib/voice/fire-smoke/schema";

const capture = (transcript: string): FireAction =>
  ({ action: "capture", sessionId: "vs-1", transcript, currentSectionId: "services" }) as FireAction;

describe("createKeyRing (kind K12: each unconfirmed save keeps its own key)", () => {
  it("retrying an unconfirmed save reuses its key after another answer was sent in between", () => {
    const keys = createKeyRing();
    const first = keys.keyFor(capture("Gas meter is off"));
    const other = keys.keyFor(capture("Power isolated at the board"));
    expect(other).not.toBe(first);
    expect(keys.keyFor(capture("Gas meter is off"))).toBe(first);
  });

  it("settling one save releases only that save's key", () => {
    const keys = createKeyRing();
    const a = keys.keyFor(capture("Gas meter is off"));
    const b = keys.keyFor(capture("Power isolated at the board"));
    keys.settle(capture("Gas meter is off"));
    expect(keys.keyFor(capture("Gas meter is off"))).not.toBe(a);
    expect(keys.keyFor(capture("Power isolated at the board"))).toBe(b);
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
});
