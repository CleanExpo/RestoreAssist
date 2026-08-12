import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  buildCatalogue,
  fetchOpenRouterCatalogue,
  __resetOpenRouterCatalogueCache,
  RECOMMENDED_PER_FAMILY,
} from "../openrouter-catalogue";

function model(id: string, created: number, extra: Record<string, unknown> = {}) {
  return { id, name: id, created, context_length: 128000, ...extra };
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
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [model("qwen/qwen3", 1)] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const catalogue = await fetchOpenRouterCatalogue();

    expect(catalogue.models.map((m) => m.id)).toEqual(["qwen/qwen3"]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://openrouter.ai/api/v1/models");
    expect(JSON.stringify(init.headers)).not.toMatch(/authorization/i);
  });

  it("caches within the TTL and refetches after it lapses", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [model("qwen/qwen3", 1)] }),
    });
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
