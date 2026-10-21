/**
 * JEV setup — runs before every family file, after config/vitest.db-guard.ts.
 *
 * 1. Every route reaches the caller through next-auth's getServerSession
 *    (lib/auth/get-api-session.ts included). It returns whatever identity the
 *    family set with asIdentity(); null means signed out.
 * 2. No request leaves this machine. fetch, http and https are refused for any
 *    host that is not local, and each refusal is counted so a family can tell
 *    "the route needs a provider we do not have" from a real failure. Residency
 *    holds by construction: only synthetic data exists and nothing is sent.
 */
import http from "node:http";
import https from "node:https";
import { vi } from "vitest";
import { applyFakeEnv } from "./env";

applyFakeEnv();

type JevSession = { user: Record<string, unknown>; expires: string } | null;
const g = globalThis as typeof globalThis & {
  __jevSession?: JevSession;
  __jevBlocked?: string[];
  __jevNetPatched?: boolean;
};
g.__jevSession ??= null;
g.__jevBlocked ??= [];

vi.mock("next-auth", async (importOriginal) => {
  const real = await importOriginal<Record<string, unknown>>();
  return { ...real, getServerSession: async () => g.__jevSession ?? null };
});
vi.mock("next-auth/next", async (importOriginal) => {
  const real = await importOriginal<Record<string, unknown>>();
  return { ...real, getServerSession: async () => g.__jevSession ?? null };
});
vi.mock("next/headers", () => {
  const empty = {
    get: () => undefined,
    getAll: () => [],
    has: () => false,
    set: () => undefined,
    delete: () => undefined,
    forEach: () => undefined,
    entries: () => [][Symbol.iterator](),
    [Symbol.iterator]: () => [][Symbol.iterator](),
  };
  // headers() answers with the headers of the request invokeRoute is serving,
  // so a route that reads e.g. stripe-signature through next/headers sees it.
  const current = () => (globalThis as { __jevReqHeaders?: Headers }).__jevReqHeaders ?? new Headers();
  return { cookies: async () => empty, headers: async () => current(), draftMode: async () => ({ isEnabled: false }) };
});

// Route loggers write a stack per handled error; tens of thousands of calls
// would bury the vitest summary. JEV_LOG=1 keeps them.
if (!process.env.JEV_LOG) {
  for (const k of ["log", "info", "warn", "error", "debug"] as const) console[k] = () => undefined;
}

const LOCAL = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function hostOf(input: unknown): string {
  try {
    if (typeof input === "string") return new URL(input).hostname;
    if (input instanceof URL) return input.hostname;
    if (input && typeof input === "object" && "url" in input) return new URL(String((input as { url: string }).url)).hostname;
    if (input && typeof input === "object") {
      const o = input as { hostname?: string; host?: string };
      return String(o.hostname ?? o.host ?? "localhost").split(":")[0];
    }
  } catch {
    return "unparseable";
  }
  return "localhost";
}

export class JevNetworkBlocked extends Error {
  constructor(host: string) {
    super(`JEV: outbound network to ${host} refused`);
    this.name = "JevNetworkBlocked";
  }
}

if (!g.__jevNetPatched) {
  g.__jevNetPatched = true;
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const host = hostOf(input);
    if (!LOCAL.has(host)) {
      g.__jevBlocked!.push(host);
      throw new JevNetworkBlocked(host);
    }
    return realFetch(input, init);
  }) as typeof fetch;
  for (const mod of [http, https] as const) {
    for (const fn of ["request", "get"] as const) {
      const real = mod[fn] as (...a: unknown[]) => http.ClientRequest;
      (mod as unknown as Record<string, unknown>)[fn] = (...args: unknown[]) => {
        const host = hostOf(args[0]);
        if (!LOCAL.has(host)) {
          g.__jevBlocked!.push(host);
          throw new JevNetworkBlocked(host);
        }
        return real.apply(mod, args);
      };
    }
  }
}

export function asIdentity(user: Record<string, unknown> | null): void {
  g.__jevSession = user ? { user, expires: new Date(Date.now() + 3600_000).toISOString() } : null;
}

/** Hosts refused since the last call; clears the list. */
export function takeBlocked(): string[] {
  const out = g.__jevBlocked!.splice(0);
  return [...new Set(out)];
}
