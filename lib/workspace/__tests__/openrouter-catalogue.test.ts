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

/** Mirror the shape the fetch path consumes: a byte-capped text read. */
function okResponse(payload: unknown, contentLength?: string) {
  const text = JSON.stringify(payload);
  return {
    ok: true,
    headers: { get: (h: string) => (h === "content-length" ? contentLength ?? null : null) },
    text: async () => text,
  };
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
    const text = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: {
        get: (h: string) =>
          h === "content-length" ? String(MAX_RESPONSE_BYTES + 1) : null,
      },
      text,
    });
    vi.stubGlobal("fetch", fetchMock);

    expect((await fetchOpenRouterCatalogue()).unavailable).toBe(true);
    // The point of the header check is to bail before buffering the body.
    expect(text).not.toHaveBeenCalled();
  });

  it("refuses an oversized body that declared no content-length", async () => {
    // Deliberately VALID JSON that would parse into a usable catalogue. A
    // garbage string would be rejected by JSON.parse instead, and the test
    // would pass with the size cap removed — proving nothing.
    const padded = JSON.stringify({
      data: [{ id: "qwen/ok", name: "x".repeat(MAX_RESPONSE_BYTES) }],
    });
    expect(padded.length).toBeGreaterThan(MAX_RESPONSE_BYTES);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => null },
      text: async () => padded,
    });
    vi.stubGlobal("fetch", fetchMock);

    expect((await fetchOpenRouterCatalogue()).unavailable).toBe(true);
  });

  it("degrades to unavailable on a malformed body rather than throwing", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => null },
      text: async () => "{not json",
    });
    vi.stubGlobal("fetch", fetchMock);

    expect((await fetchOpenRouterCatalogue()).unavailable).toBe(true);
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
