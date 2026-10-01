import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

function harness(online = false) {
  const listeners = new Map<string, Function>();
  const match = vi.fn(async (input: string) => input === "/offline" ? new Response("Public offline page") : new Response("PRIVATE OLD ACCOUNT"));
  const put = vi.fn();
  const open = vi.fn(async () => ({ put }));
  const fetch = online ? vi.fn(async () => new Response("Current account", { headers: { "Content-Type": "text/html" } })) : vi.fn(async () => { throw new Error("synthetic offline"); });
  runInNewContext(readFileSync("public/sw.js", "utf8"), {
    self: { location: { hostname: "example.test", origin: "https://example.test" }, addEventListener: (name: string, fn: Function) => listeners.set(name, fn) },
    caches: { match, open }, fetch, URL, Response, console,
  });
  return {
    match, put, open, fetch,
    async request(path: string) {
      let response: Promise<Response> | undefined;
      listeners.get("fetch")!({ request: { url: `https://example.test${path}`, method: "GET", mode: "navigate", destination: "document" }, respondWith: (value: Promise<Response>) => { response = value; } });
      return response!;
    },
  };
}

describe("service worker account isolation", () => {
  it.each(["/dashboard/field", "/reports/id", "/portal/inspections", "/capture/secret", "/sign/secret", "/invite/secret", "/setup", "/billing", "/onboarding/account-type", "/invoices", "/future-private-route", "/setup.svg"])("never reads an old account's cached document: %s", async (path) => {
    const app = harness();
    expect(await (await app.request(path)).text()).toBe("Public offline page");
    expect(app.match).toHaveBeenCalledExactlyOnceWith("/offline");
    expect(app.open).not.toHaveBeenCalled();
  });

  it("does not persist a newly loaded private document", async () => {
    const app = harness(true);
    expect(await (await app.request("/dashboard/field")).text()).toBe("Current account");
    expect(app.match).not.toHaveBeenCalled();
    expect(app.open).not.toHaveBeenCalled();
  });

  it("does not treat a private API image extension as a public static asset", async () => {
    const app = harness();
    expect((await app.request("/api/inspections/photo.png")).status).toBe(503);
    expect(app.match).not.toHaveBeenCalled();
  });
});
