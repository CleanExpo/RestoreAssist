/**
 * RA-7877 — a cold start with no signal needs the /offline page's JavaScript.
 *
 * Caching /offline's HTML alone left a page that could not run its capture form:
 * the /_next/static chunks it names were only cached after being fetched online.
 * The install step must cache every static file the cached /offline HTML names.
 */
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const ORIGIN = "https://synthetic.example.test";
const OFFLINE_HTML = `<!DOCTYPE html><html><head>
<link rel="stylesheet" href="/_next/static/chunks/app.css"/>
<script src="/_next/static/chunks/main.js" async=""></script>
<script src="/_next/static/chunks/offline-page.js" async=""></script>
</head><body><script>self.__next_f.push([1,"\\"/_next/static/chunks/flight.js\\""])</script></body></html>`;
const js = (body = "JS") => new Response(body, { headers: { "Content-Type": "application/javascript" } });
const css = () => new Response("body{}", { headers: { "Content-Type": "text/css" } });
const html = (body: string) => new Response(body, { headers: { "Content-Type": "text/html" } });

function install(network: (path: string) => Response | Promise<Response>, seed?: (stores: Map<string, Map<string, Response>>) => void) {
  const listeners = new Map<string, (event: { waitUntil: (p: Promise<unknown>) => void }) => void>();
  const stores = new Map<string, Map<string, Response>>();
  seed?.(stores);
  const keyOf = (r: string | { url: string }) => new URL(typeof r === "string" ? r : r.url, ORIGIN).pathname + new URL(typeof r === "string" ? r : r.url, ORIGIN).search;
  const open = async (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const map = stores.get(name)!;
    return {
      match: async (r: string | { url: string }) => map.get(keyOf(r))?.clone(),
      put: async (r: { url: string }, res: Response) => { map.set(keyOf(r), res.clone()); },
      add: async (r: string) => {
        const res = await network(keyOf(r));
        if (!res.ok) throw new Error(`add ${r}: ${res.status}`);
        map.set(keyOf(r), res.clone());
      },
      delete: async (r: string) => map.delete(keyOf(r)),
    };
  };
  const matchAll = async (r: string) => {
    for (const map of stores.values()) if (map.has(keyOf(r))) return map.get(keyOf(r))!.clone();
    return undefined;
  };
  const fetchSpy = vi.fn(async (r: string | { url: string }) => network(keyOf(r)));
  runInNewContext(readFileSync("public/sw.js", "utf8"), {
    self: {
      location: { hostname: "synthetic.example.test", origin: ORIGIN },
      addEventListener: (name: string, fn: never) => listeners.set(name, fn),
      skipWaiting: () => undefined,
    },
    caches: { open, match: matchAll, keys: async () => [...stores.keys()] },
    fetch: fetchSpy, URL, Request, Response, console, Promise, Set,
  });
  return {
    fetchSpy,
    stores,
    async runInstall() {
      let work: Promise<unknown> = Promise.resolve();
      listeners.get("install")!({ waitUntil: (p) => { work = p; } });
      await work;
    },
  };
}

const network = (path: string) => {
  if (path === "/") return html("<html>home</html>");
  if (path === "/offline") return html(OFFLINE_HTML);
  if (path.endsWith(".css")) return css();
  return js(path);
};

describe("service worker caches the /offline page's JavaScript on install", () => {
  it("caches every static file named by the cached /offline HTML, including flight-data references", async () => {
    const sw = install(network);
    await sw.runInstall();
    const cached = [...(sw.stores.get("nir-v2.3-static")?.keys() ?? [])].sort();
    expect(cached).toContain("/_next/static/chunks/app.css");
    expect(cached).toContain("/_next/static/chunks/main.js");
    expect(cached).toContain("/_next/static/chunks/offline-page.js");
    expect(cached).toContain("/_next/static/chunks/flight.js");
    expect(sw.stores.get("nir-v2.3-app")?.has("/offline")).toBe(true);
  });

  it("fails the install when a file the offline page needs cannot be cached, and does not cache it", async () => {
    const sw = install((path) =>
      path === "/_next/static/chunks/offline-page.js" ? new Response("not found", { status: 404 }) : network(path),
    );
    await expect(sw.runInstall()).rejects.toThrow();
    expect([...(sw.stores.get("nir-v2.3-static")?.keys() ?? [])]).not.toContain("/_next/static/chunks/offline-page.js");
  });

  it("fails the install, and caches nothing, when an HTML gateway page is served at a chunk URL", async () => {
    const sw = install((path) => (path.endsWith("main.js") ? html("login") : network(path)));
    await expect(sw.runInstall()).rejects.toThrow();
    expect([...(sw.stores.get("nir-v2.3-static")?.keys() ?? [])]).not.toContain("/_next/static/chunks/main.js");
  });

  it("fails the install when /offline cannot be fetched, even though an older version holds a working copy", async () => {
    // An upgrade must never replace a working offline shell with none: the old
    // caches are pruned on activate, so a version without its own copy must not activate.
    const sw = install(
      (path) => {
        if (path === "/offline") throw new Error("Synthetic network failure");
        return network(path);
      },
      (stores) => {
        stores.set("nir-v2.2-app", new Map([["/offline", html(OFFLINE_HTML)]]));
      },
    );
    await expect(sw.runInstall()).rejects.toThrow();
    expect(sw.stores.get("nir-v2.3-app")?.has("/offline") ?? false).toBe(false);
    expect(sw.stores.get("nir-v2.2-app")?.has("/offline")).toBe(true);
  });

  it("uses a new cache version, so devices drop the old shell without these files", () => {
    expect(readFileSync("public/sw.js", "utf8")).toContain('const NIR_VERSION = "nir-v2.3"');
  });
});
