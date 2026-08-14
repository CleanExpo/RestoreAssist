import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  buildCatalogue,
  fetchOpenRouterCatalogue,
  __resetOpenRouterCatalogueCache,
  RECOMMENDED_PER_FAMILY,
  MAX_UPSTREAM_ENTRIES,
  MAX_RESPONSE_BYTES,
} from "../openrouter-catalogue";

function model(id: string, created: number, extra: Record<string, unknown> = {}) {
  return { id, name: id, created, context_length: 128000, ...extra };
}

/**
 * A response backed by a REAL ReadableStream, like the one `fetch` returns.
 * Mocks that only expose `text()` cannot exercise the streaming byte cap — an
 * earlier version of this suite did exactly that and proved post-read rejection
 * while the read itself stayed unbounded.
 */
function streamResponse(text: string, contentLength?: string) {
  return {
    ok: true,
    headers: {
      get: (h: string) => (h === "content-length" ? contentLength ?? null : null),
    },
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(text));
        controller.close();
      },
    }),
  };
}

function okResponse(payload: unknown, contentLength?: string) {
  return streamResponse(JSON.stringify(payload), contentLength);
}

describe("buildCatalogue", () => {
  it("promotes the newest models per recommended family", () => {
    const catalogue = buildCatalogue([
      model("deepseek/deepseek-v4", 300),
      model("deepseek/deepseek-chat", 100),
      model("qwen/qwen3-235b", 250),
      model("minimax/minimax-m3", 275),
      model("meta-llama/llama-4", 999),
    ]);

    const ids = catalogue.recommended.map((m) => m.id);
    // Family order is deepseek → qwen → minimax, newest first within a family.
    expect(ids).toEqual([
      "deepseek/deepseek-v4",
      "deepseek/deepseek-chat",
      "qwen/qwen3-235b",
      "minimax/minimax-m3",
    ]);
    // Newest overall but not a recommended family — must not be promoted.
    expect(ids).not.toContain("meta-llama/llama-4");
  });

  it("caps each family at RECOMMENDED_PER_FAMILY", () => {
    const catalogue = buildCatalogue(
      Array.from({ length: 10 }, (_, i) => model(`qwen/qwen-${i}`, i)),
    );
    expect(catalogue.recommended).toHaveLength(RECOMMENDED_PER_FAMILY);
    // Highest `created` wins.
    expect(catalogue.recommended[0].id).toBe("qwen/qwen-9");
  });

  it("returns every model in the full list, sorted by slug", () => {
    const catalogue = buildCatalogue([
      model("zeta/z", 1),
      model("alpha/a", 2),
      model("qwen/q", 3),
    ]);
    expect(catalogue.models.map((m) => m.id)).toEqual([
      "alpha/a",
      "qwen/q",
      "zeta/z",
    ]);
    expect(catalogue.unavailable).toBe(false);
  });

  it("tags family and context length, falling back to the slug for a missing name", () => {
    const catalogue = buildCatalogue([
      { id: "qwen/qwen3", created: 1 },
      model("openai/gpt-x", 2),
    ]);
    const qwen = catalogue.models.find((m) => m.id === "qwen/qwen3");
    expect(qwen).toMatchObject({
      name: "qwen/qwen3",
      family: "qwen",
      contextLength: null,
    });
    expect(catalogue.models.find((m) => m.id === "openai/gpt-x")).toMatchObject({
      family: null,
      contextLength: 128000,
    });
  });

  it("drops entries without a usable slug rather than emitting blank options", () => {
    const catalogue = buildCatalogue([
      model("qwen/ok", 1),
      { name: "no id", created: 2 },
      { id: "", created: 3 },
      null,
    ]);
    expect(catalogue.models.map((m) => m.id)).toEqual(["qwen/ok"]);
  });

  it("reports unavailable when the payload is not an array", () => {
    expect(buildCatalogue(undefined).unavailable).toBe(true);
    expect(buildCatalogue({ data: [] }).unavailable).toBe(true);
  });

  it("degrades rather than sorting and caching a hostile number of entries", () => {
    // Unbounded, this array is mapped, filtered per family, sorted, held in the
    // 10-minute cache and rendered as <option>s for every signed-in operator.
    const hostile = Array.from({ length: MAX_UPSTREAM_ENTRIES + 1 }, (_, i) =>
      model(`qwen/q-${i}`, i),
    );
    expect(buildCatalogue(hostile)).toEqual({
      recommended: [],
      models: [],
      unavailable: true,
    });
  });

  it("still serves a payload exactly at the entry cap", () => {
    const atCap = Array.from({ length: MAX_UPSTREAM_ENTRIES }, (_, i) =>
      model(`qwen/q-${i}`, i),
    );
    const catalogue = buildCatalogue(atCap);
    expect(catalogue.unavailable).toBe(false);
    expect(catalogue.models).toHaveLength(MAX_UPSTREAM_ENTRIES);
  });

  it("drops whitespace-only and absurdly long slugs, and over-long names", () => {
    const catalogue = buildCatalogue([
      model("qwen/ok", 1),
      { id: "   ", created: 2 },
      { id: `qwen/${"x".repeat(200)}`, created: 3 },
      { id: "qwen/long-name", name: "n".repeat(500), created: 4 },
    ]);

    expect(catalogue.models.map((m) => m.id)).toEqual([
      "qwen/long-name",
      "qwen/ok",
    ]);
    // An over-long name is not rendered; the slug stands in for it.
    expect(
      catalogue.models.find((m) => m.id === "qwen/long-name")?.name,
    ).toBe("qwen/long-name");
  });

  it("trims a padded slug rather than emitting an unroutable option", () => {
    expect(buildCatalogue([{ id: "  qwen/ok  ", created: 1 }]).models[0].id).toBe(
      "qwen/ok",
    );
  });
});

describe("fetchOpenRouterCatalogue", () => {
  beforeEach(() => {
    __resetOpenRouterCatalogueCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    __resetOpenRouterCatalogueCache();
  });

  it("reads the public index without sending any credential", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(okResponse({ data: [model("qwen/qwen3", 1)] }));
    vi.stubGlobal("fetch", fetchMock);

    const catalogue = await fetchOpenRouterCatalogue();

    expect(catalogue.models.map((m) => m.id)).toEqual(["qwen/qwen3"]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://openrouter.ai/api/v1/models");
    expect(JSON.stringify(init.headers)).not.toMatch(/authorization/i);
  });

  it("caches within the TTL and refetches after it lapses", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(okResponse({ data: [model("qwen/qwen3", 1)] }));
    vi.stubGlobal("fetch", fetchMock);

    const t0 = 1_000_000;
    await fetchOpenRouterCatalogue(t0);
    await fetchOpenRouterCatalogue(t0 + 60_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await fetchOpenRouterCatalogue(t0 + 11 * 60 * 1000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("degrades to unavailable on a non-OK response, and does not cache it", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    vi.stubGlobal("fetch", fetchMock);

    expect((await fetchOpenRouterCatalogue()).unavailable).toBe(true);
    await fetchOpenRouterCatalogue();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("refuses an oversized body by its declared content-length, without reading it", async () => {
    // The body is REAL, readable, small and valid: if the header guard is
    // removed, this streams fine and the catalogue becomes available, so the
    // assertions below fail. A bodyless mock would take the independent
    // `!reader` path and pass with or without the guard — proving nothing.
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            JSON.stringify({ data: [model("qwen/qwen3", 1)] }),
          ),
        );
        controller.close();
      },
    });
    // Spy on getReader, not on `pull`: a ReadableStream calls `pull` eagerly to
    // fill its own queue, so counting pulls measures the stream's behaviour
    // rather than ours. getReader answers the only question that matters — did
    // our code reach for the body at all?
    const getReader = vi.fn(() => stream.getReader());
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: {
        get: (h: string) =>
          h === "content-length" ? String(MAX_RESPONSE_BYTES + 1) : null,
      },
      body: { getReader },
    });
    vi.stubGlobal("fetch", fetchMock);

    expect((await fetchOpenRouterCatalogue()).unavailable).toBe(true);
    // The point of the header check is to bail before touching the body at all.
    expect(getReader).not.toHaveBeenCalled();
  });

  it("stops pulling a chunked body at the cap instead of buffering it whole", async () => {
    // OpenRouter's real response is chunked with no content-length, so the
    // header check protects nothing here. This uses a genuine ReadableStream
    // and counts the bytes actually pulled: a post-read length check would let
    // the entire body through before rejecting it, which is the allocation the
    // cap exists to prevent.
    const CHUNK = 1_000_000;
    const chunk = new Uint8Array(CHUNK).fill(0x20);
    let pulled = 0;
    let cancelled = false;

    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        // Far more than the cap; a correct reader never drains it.
        if (pulled >= CHUNK * 50) {
          controller.close();
          return;
        }
        pulled += CHUNK;
        controller.enqueue(chunk);
      },
      cancel() {
        cancelled = true;
      },
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => null },
        body,
        text: async () => {
          throw new Error("must not buffer the whole body");
        },
      }),
    );

    expect((await fetchOpenRouterCatalogue()).unavailable).toBe(true);
    expect(cancelled).toBe(true);
    // Bounded by the cap plus the chunk that crossed it plus the one the
    // stream queues ahead of the reader — 7MB here. The body offered 50MB, so
    // this still fails loudly if the read is ever unbounded again.
    expect(pulled).toBeLessThanOrEqual(MAX_RESPONSE_BYTES + 2 * CHUNK);
    expect(pulled).toBeLessThan(CHUNK * 50);
  });

  it("reads a chunked body in full when it stays under the cap", async () => {
    // The split lands INSIDE a multi-byte UTF-8 sequence. A decoder that drops
    // `{ stream: true }` emits U+FFFD for the halves and the name comes back
    // corrupted — splitting on an ASCII boundary would prove nothing.
    const payload = new TextEncoder().encode(
      JSON.stringify({ data: [{ id: "qwen/qwen3", name: "Qwen — 通义", created: 1 }] }),
    );
    const emDash = payload.indexOf(0xe2); // first byte of a 3-byte sequence
    expect(emDash).toBeGreaterThan(0);

    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(payload.slice(0, emDash + 1));
        controller.enqueue(payload.slice(emDash + 1));
        controller.close();
      },
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, headers: { get: () => null }, body }),
    );

    const catalogue = await fetchOpenRouterCatalogue();
    expect(catalogue.unavailable).toBe(false);
    expect(catalogue.models.map((m) => m.id)).toEqual(["qwen/qwen3"]);
    expect(catalogue.models[0].name).toBe("Qwen — 通义");
  });

  it("degrades when the body errors mid-stream", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"data":['));
        controller.error(new Error("connection reset"));
      },
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, headers: { get: () => null }, body }),
    );

    expect((await fetchOpenRouterCatalogue()).unavailable).toBe(true);
  });

  it("does not cache an unavailable catalogue built from a malformed payload", async () => {
    // Distinct path from the byte cap: here the read SUCCEEDS and
    // `buildCatalogue` is what reports unavailable, so the early return that
    // skips the cache write is a different line. Without it, one malformed
    // upstream response blanks the picker for ten minutes for everyone.
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(okResponse({ data: { not: "an array" } }))
      .mockResolvedValue(okResponse({ data: [model("qwen/qwen3", 1)] }));
    vi.stubGlobal("fetch", fetchMock);

    const t0 = 3_000_000;
    expect((await fetchOpenRouterCatalogue(t0)).unavailable).toBe(true);
    const second = await fetchOpenRouterCatalogue(t0 + 1_000);
    expect(second.unavailable).toBe(false);
    expect(second.models.map((m) => m.id)).toEqual(["qwen/qwen3"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not let an over-cap response poison the ten-minute cache", async () => {
    const oversized = JSON.stringify({
      data: [{ id: "qwen/ok", name: "x".repeat(MAX_RESPONSE_BYTES) }],
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(streamResponse(oversized))
      .mockResolvedValue(okResponse({ data: [model("qwen/qwen3", 1)] }));
    vi.stubGlobal("fetch", fetchMock);

    const t0 = 2_000_000;
    expect((await fetchOpenRouterCatalogue(t0)).unavailable).toBe(true);
    // Well inside the TTL: a cached failure would be served instead of retried.
    const second = await fetchOpenRouterCatalogue(t0 + 1_000);
    expect(second.unavailable).toBe(false);
    expect(second.models.map((m) => m.id)).toEqual(["qwen/qwen3"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("refuses an oversized body that declared no content-length", async () => {
    // Deliberately VALID JSON that would parse into a usable catalogue. A
    // garbage string would be rejected by JSON.parse instead, and the test
    // would pass with the size cap removed — proving nothing.
    const padded = JSON.stringify({
      data: [{ id: "qwen/ok", name: "x".repeat(MAX_RESPONSE_BYTES) }],
    });
    expect(padded.length).toBeGreaterThan(MAX_RESPONSE_BYTES);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(streamResponse(padded)));

    expect((await fetchOpenRouterCatalogue()).unavailable).toBe(true);
  });

  it("refuses a response with no readable body rather than buffering it", async () => {
    // The removed `res.text()` fallback would have restored the unbounded read
    // on exactly this shape. `text()` therefore returns a perfectly GOOD payload:
    // if anything still calls it, this resolves to a populated catalogue and the
    // assertion below fails. A throwing `text()` would be caught by the outer
    // handler and yield `unavailable` either way — proving nothing.
    const text = vi.fn(async () =>
      JSON.stringify({ data: [model("qwen/qwen3", 1)] }),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => null },
        body: null,
        text,
      }),
    );

    expect((await fetchOpenRouterCatalogue()).unavailable).toBe(true);
    expect(text).not.toHaveBeenCalled();
  });

  it("degrades to unavailable on a malformed body rather than throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(streamResponse("{not json")),
    );

    expect((await fetchOpenRouterCatalogue()).unavailable).toBe(true);
  });

  it("coalesces concurrent misses onto a single upstream read", async () => {
    // Each response is individually byte-capped, but the cache is written only
    // after fetch + read + parse + build complete. Without coalescing, N
    // simultaneous signed-in callers open N upstream reads, each free to buffer
    // up to the cap — the per-response bound says nothing about the aggregate.
    let release!: (v: unknown) => void;
    const gate = new Promise((r) => {
      release = r;
    });
    const fetchMock = vi.fn(async () => {
      await gate;
      return okResponse({ data: [model("qwen/qwen3", 1)] });
    });
    vi.stubGlobal("fetch", fetchMock);

    const all = Promise.all(
      Array.from({ length: 100 }, () => fetchOpenRouterCatalogue(4_000_000)),
    );
    release(null);
    const results = await all;

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(results).toHaveLength(100);
    for (const r of results) {
      expect(r.models.map((m) => m.id)).toEqual(["qwen/qwen3"]);
    }
  });

  it("clears the in-flight load after a failure so the next caller retries", async () => {
    // A rejected in-flight promise that is never cleared would pin every later
    // caller to the same failure for the life of the process.
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValue(okResponse({ data: [model("qwen/qwen3", 1)] }));
    vi.stubGlobal("fetch", fetchMock);

    expect((await fetchOpenRouterCatalogue(5_000_000)).unavailable).toBe(true);
    const second = await fetchOpenRouterCatalogue(5_000_001);
    expect(second.unavailable).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("degrades to unavailable when the fetch throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network down")),
    );

    const catalogue = await fetchOpenRouterCatalogue();
    expect(catalogue).toEqual({
      recommended: [],
      models: [],
      unavailable: true,
    });
  });
});
