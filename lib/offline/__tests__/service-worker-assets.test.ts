import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const ORIGIN = "https://synthetic.example.test";
const CHUNK = "/_next/static/chunks/synthetic.js";
const js = (body = "SYNTHETIC_JS") => new Response(body, { headers: { "Content-Type": "application/javascript; charset=utf-8" } });
const html = (status = 200) => new Response("Synthetic gateway HTML", { status, headers: { "Content-Type": "text/html" } });

function harness(responses: Response[], initial: Record<string, Response> = {}) {
  const listeners = new Map<string, (event: { request: object; respondWith: (value: Promise<Response>) => void }) => void>();
  const entries = new Map(Object.entries(initial).map(([path, value]) => [ORIGIN + path, value]));
  const key = (request: string | { url: string }) => typeof request === "string" ? new URL(request, ORIGIN).href : request.url;
  const match = vi.fn(async (request: string | { url: string }) => entries.get(key(request))?.clone());
  const remove = vi.fn(async (request: string | { url: string }) => entries.delete(key(request)));
  const put = vi.fn(async (request: { url: string }, response: Response) => { entries.set(key(request), response.clone()); });
  const open = vi.fn(async () => ({ match, put, delete: remove }));
  const fetch = vi.fn(async () => {
    const response = responses.shift();
    if (!response) throw new Error("Synthetic offline network");
    return response;
  });
  runInNewContext(readFileSync("public/sw.js", "utf8"), {
    self: { location: { hostname: "synthetic.example.test", origin: ORIGIN }, addEventListener: (name: string, fn: typeof listeners extends Map<string, infer V> ? V : never) => listeners.set(name, fn) },
    caches: { match, open },
    fetch, URL, Response, console,
  });
  return {
    fetch, put, remove, match, open, entries,
    async request(path = CHUNK) {
      let response: Promise<Response> | undefined;
      listeners.get("fetch")!({ request: { url: ORIGIN + path, method: "GET", mode: "cors", destination: path.endsWith(".css") ? "style" : "script" }, respondWith: value => { response = value; } });
      return response!;
    },
  };
}

describe("service worker static asset recovery", () => {
  it.each([200, 404])("does not retain HTML status %s at a JavaScript URL", async status => {
    const app = harness([html(status), js()]);
    expect((await app.request()).status).toBe(status);
    expect(await (await app.request()).text()).toBe("SYNTHETIC_JS");
    expect(app.fetch).toHaveBeenCalledTimes(2);
    expect(app.put).toHaveBeenCalledOnce();
  });

  it("repairs only the invalid asset entry and preserves unrelated cached assets and offline HTML", async () => {
    const app = harness([js()], { [CHUNK]: html(), "/_next/static/chunks/other.js": js("OTHER"), "/offline": html() });
    expect(await (await app.request()).text()).toBe("SYNTHETIC_JS");
    expect(app.remove).toHaveBeenCalledOnce();
    expect(app.entries.has(ORIGIN + "/offline")).toBe(true);
    expect(await app.entries.get(ORIGIN + "/_next/static/chunks/other.js")!.text()).toBe("OTHER");
  });

  it("keeps valid JavaScript available without another network request", async () => {
    const app = harness([js()]);
    await app.request();
    expect(await (await app.request()).text()).toBe("SYNTHETIC_JS");
    expect(app.fetch).toHaveBeenCalledOnce();
    expect(app.remove).not.toHaveBeenCalled();
  });

  it("does not pin a redirected JavaScript response", async () => {
    const redirected = js("REDIRECTED");
    Object.defineProperty(redirected, "redirected", { value: true });
    const app = harness([redirected, js()]);
    await app.request();
    expect(await (await app.request()).text()).toBe("SYNTHETIC_JS");
    expect(app.fetch).toHaveBeenCalledTimes(2);
  });

  it("does not cache HTML returned for a stylesheet", async () => {
    const css = new Response("body{color:black}", { headers: { "Content-Type": "text/css" } });
    const app = harness([html(), css]);
    const path = "/_next/static/chunks/synthetic.css";
    await app.request(path);
    expect(await (await app.request(path)).text()).toBe("body{color:black}");
    expect(app.fetch).toHaveBeenCalledTimes(2);
  });

  it.each(["open", "match", "put", "remove"] as const)("serves network JavaScript when cache %s fails", async operation => {
    const app = harness([js()], { [CHUNK]: html() });
    app[operation].mockRejectedValueOnce(new Error("Synthetic cache storage failure"));
    expect(await (await app.request()).text()).toBe("SYNTHETIC_JS");
    expect(app.fetch).toHaveBeenCalledOnce();
  });

  it("keeps query variants separate while validating the JavaScript content type", async () => {
    const first = CHUNK + "?dpl=synthetic-a";
    const second = CHUNK + "?dpl=synthetic-b";
    const textJs = new Response("SECOND", { headers: { "Content-Type": "Text/JavaScript; charset=UTF-8" } });
    const app = harness([js("FIRST"), textJs]);
    expect(await (await app.request(first)).text()).toBe("FIRST");
    expect(await (await app.request(second)).text()).toBe("SECOND");
    expect(await (await app.request(first)).text()).toBe("FIRST");
    expect(app.fetch).toHaveBeenCalledTimes(2);
    expect(app.remove).not.toHaveBeenCalled();
  });
});
