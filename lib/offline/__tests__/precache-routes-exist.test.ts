/**
 * Every URL the service worker precaches must be a real app route.
 *
 * public/sw.js installs with `Promise.allSettled(cache.add(url))`, so a 404 on
 * one entry is swallowed silently: the install "succeeds" and the device simply
 * has nothing cached under that URL. `privateDocumentWithOfflineFallback`
 * answers every failed private navigation with `caches.match("/offline")`, so a
 * missing /offline page meant a technician who lost signal got a bare 503 text
 * body instead of the offline page.
 *
 * The SW fetches these URLs signed-out on install, so /offline must also stay
 * outside every proxy.ts auth gate.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

const getToken = vi.fn(async () => null);
vi.mock("next-auth/jwt", () => ({ getToken: (...a: unknown[]) => getToken(...(a as [])) }));

const repoRoot = resolve(__dirname, "../../..");
const appDir = join(repoRoot, "app");

function precacheUrls(): string[] {
  const source = readFileSync(join(repoRoot, "public/sw.js"), "utf8");
  const match = source.match(/const PRECACHE_URLS\s*=\s*\[([^\]]*)\]/);
  if (!match) throw new Error("PRECACHE_URLS not found in public/sw.js");
  return [...match[1].matchAll(/["'`]([^"'`]+)["'`]/g)].map((m) => m[1]);
}

const ROUTE_FILES = ["page.tsx", "page.ts", "page.jsx", "page.js", "route.ts", "route.js"];

function isDir(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/** Resolves a static URL path to an app/ route, looking through (group) segments. */
function routeExists(dir: string, segments: string[]): boolean {
  if (!isDir(dir)) return false;
  const groups = readdirSync(dir).filter((name) => /^\(.+\)$/.test(name));
  if (segments.length === 0) {
    if (ROUTE_FILES.some((file) => existsSync(join(dir, file)))) return true;
  } else if (routeExists(join(dir, segments[0]), segments.slice(1))) {
    return true;
  }
  return groups.some((group) => routeExists(join(dir, group), segments));
}

describe("service worker precache list", () => {
  const urls = precacheUrls();

  it("parses a non-empty list that includes the offline fallback", () => {
    expect(urls.length).toBeGreaterThan(0);
    expect(urls).toContain("/offline");
  });

  it.each(urls)("%s maps to an existing app route", (url) => {
    const segments = url.split("/").filter(Boolean);
    expect(routeExists(appDir, segments)).toBe(true);
  });
});

/** proxy.ts matchers are plain paths or `<prefix>/:path*`; mirror that shape. */
function matcherRegex(pattern: string): RegExp {
  if (!/^\/[\w\-/]*(\/:path\*)?$/.test(pattern)) {
    throw new Error(`Unrecognised matcher shape: ${pattern}`);
  }
  const base = pattern.replace(/\/:path\*$/, "");
  const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return pattern.endsWith("/:path*")
    ? new RegExp(`^${escaped}/.+$`)
    : new RegExp(`^${escaped}$`);
}

describe("proxy does not gate the precached public pages", () => {
  it("the matcher helper recognises a gated path (positive control)", async () => {
    const { config } = await import("@/proxy");
    const matches = (path: string) => config.matcher.some((p) => matcherRegex(p).test(path));
    expect(matches("/dashboard/field")).toBe(true);
    expect(matches("/invite/abc")).toBe(true);
  });

  it("/offline is outside every proxy matcher, so the signed-out SW install reaches it", async () => {
    const { config } = await import("@/proxy");
    expect(config.matcher.some((p) => matcherRegex(p).test("/offline"))).toBe(false);
  });

  it("a direct proxy call for /offline does not redirect when the setup flag is off", async () => {
    const prev = process.env.SETUP_WIZARD_ENABLED;
    delete process.env.SETUP_WIZARD_ENABLED;
    try {
      const { proxy } = await import("@/proxy");
      const res = await proxy(new NextRequest("http://localhost/offline"));
      expect(res.headers.get("location")).toBeNull();
      expect(getToken).not.toHaveBeenCalled();
    } finally {
      if (prev !== undefined) process.env.SETUP_WIZARD_ENABLED = prev;
    }
  });
});
