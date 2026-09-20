/**
 * Shared step recorder for the three-persona walkthrough (owner, technician, client).
 *
 * Every step appends exactly one JSON line to this run's results.jsonl with a screenshot,
 * the console errors, the failing responses and every mutating request seen since the
 * previous step. A step never throws: a measured failure is recorded as FAIL and the
 * journey moves on, so one broken screen cannot hide the rest of the product. A step that
 * could NOT be exercised is UNMEASURED, never FAIL. verify.mjs checks the file.
 *
 * Outcomes: PASS, FAIL, EXPECTED-BY-CODE (a gap the code already shows), PURCHASED
 * (Stripe test mode), SIMULATED (signed webhook, no Stripe), BYPASS (seeded), UNMEASURED.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { APIRequestContext, Page, Route } from "@playwright/test";
import { Client } from "pg";
import { claimRunId, runDir } from "./run-identity";

/**
 * The one destination every journey is allowed to reach. Each spec used to re-derive this
 * from PLAYWRIGHT_BASE_URL WITHOUT the locality check the Playwright config applies, so the
 * check lived in one place and the mutating calls read another.
 */
export const BASE_URL = ((): string => {
  const raw = (process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
  if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(raw)) {
    throw new Error(`walkthrough refuses non-local base URL "${raw}"`);
  }
  return raw;
})();

/**
 * Identity of THIS invocation. See run-identity.ts: the directory is claimed exclusively,
 * so a run can never append to another run's evidence, whatever its id.
 */
export const RUN_ID = claimRunId();

/** Each invocation owns a directory. Nothing from an older run is reachable from it. */
export const RESULTS_DIR = runDir(RUN_ID);
const RESULTS_FILE = path.join(RESULTS_DIR, "results.jsonl");
const STATE_FILE = path.join(RESULTS_DIR, "state.json");
const SHOTS_DIR = path.join(RESULTS_DIR, "shots");

export type Outcome =
  | "PASS"
  | "FAIL"
  | "EXPECTED-BY-CODE"
  | "PURCHASED"
  | "SIMULATED"
  | "BYPASS"
  | "UNMEASURED";

export interface StepResult {
  outcome: Outcome;
  note?: string;
  /** HTTP status of the request that proves the step, when there is one. */
  status?: number;
  url?: string;
  method?: string;
  /** Gap id (G1-G10) this step confirms or refutes. */
  gap?: string;
}

interface Watch {
  consoleErrors: string[];
  badResponses: { status: number; method: string; url: string }[];
  /**
   * Responses to requests THIS step issued. This is what says a step was exercised.
   *
   * A screenshot cannot say it: step() takes one whether or not the callback did anything.
   * Nor can a plain response count: responses arrive asynchronously, so a slow response to
   * the PREVIOUS step's request - including one landing while this step's screenshot is
   * being taken - made a callback that did nothing look measured. Counting only responses
   * whose request this step issued removes both the cross-step leak and the screenshot
   * window.
   */
  observedResponses: number;
  /** Requests issued during the current step, used to attribute responses to it. */
  stepRequests: Set<unknown>;
}

const watches = new WeakMap<Page, Watch>();

/**
 * Mutating requests seen since the previous step, from every transport.
 *
 * Page events do not fire for APIRequestContext traffic (page.request, a context's
 * request, pwRequest.newContext), and those carry most of this harness's writes. So the
 * sink is module-level and every transport feeds it.
 */
const mutations: { method: string; url: string }[] = [];
const API_METHODS = ["fetch", "get", "post", "put", "patch", "delete", "head"];
const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const MAX_REDIRECTS = 5;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

/** Refuse a non-local destination BEFORE it is dispatched, and record the mutation. */
function checkedDestination(method: string, url: string): string {
  let absolute: string;
  try {
    absolute = new URL(url, `${BASE_URL}/`).toString();
  } catch {
    throw new Error(`walkthrough cannot resolve request URL "${url}"`);
  }
  const host = new URL(absolute).hostname;
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(`walkthrough refuses ${method} to non-local destination "${absolute}"`);
  }
  if (MUTATING.has(method)) mutations.push({ method, url: absolute.slice(0, 300) });
  return absolute;
}

/**
 * An APIRequestContext that validates every destination before dispatch and records every
 * mutation it makes. Wrapping the context covers each call made through it, so a new call
 * site cannot forget to be recorded.
 */
export function recordedApi(ctx: APIRequestContext): APIRequestContext {
  return new Proxy(ctx, {
    get(target, prop) {
      const value = Reflect.get(target, prop, target);
      if (typeof value !== "function") return value;
      if (typeof prop === "string" && API_METHODS.includes(prop)) {
        return async (url: string, options?: Record<string, unknown>) => {
          const verb = prop === "fetch" ? String(options?.method ?? "GET").toUpperCase() : prop.toUpperCase();
          // Dispatch the URL that was VALIDATED, not the original argument. Passing the
          // relative argument through let Playwright resolve it against the wrapped
          // context's own baseURL: a context created with a non-local baseURL reached
          // that host while the guard had approved, and recorded, a localhost address.
          // Playwright follows redirects itself, and the hop it follows never reaches this
          // wrapper: a local 307 re-dispatched a POST to an external host with the same
          // body. So redirects are disabled and each hop is validated before it is taken.
          const caller = options ?? {};
          const limit = typeof caller.maxRedirects === "number" ? caller.maxRedirects : MAX_REDIRECTS;
          const rawFetch = Reflect.get(target, "fetch", target) as (...a: unknown[]) => unknown;
          let next = checkedDestination(verb, url);
          let method = verb;
          let opts: Record<string, unknown> = { ...caller };
          let first = true;
          for (let hop = 0; ; hop += 1) {
            const res = (await (first
              ? (value as (...a: unknown[]) => unknown).call(target, next, { ...opts, maxRedirects: 0 })
              : rawFetch.call(target, next, { ...opts, method, maxRedirects: 0 }))) as {
              status: () => number;
              headers: () => Record<string, string>;
            };
            first = false;
            const status = res.status();
            const location = status >= 300 && status < 400 ? res.headers()["location"] : undefined;
            if (!location || limit === 0) return res;
            if (hop >= limit) throw new Error(`walkthrough refuses more than ${limit} redirects from ${url}`);
            // 301, 302 and 303 become a GET without the original body (RFC 9110). Carrying
            // the body forward would repeat a mutation the caller did not ask for.
            if (status === 301 || status === 302 || status === 303) {
              method = "GET";
              opts = { ...opts, data: undefined, form: undefined, multipart: undefined };
            }
            next = checkedDestination(method, new URL(location, next).toString());
          }
        };
      }
      return (value as (...a: unknown[]) => unknown).bind(target);
    },
  }) as APIRequestContext;
}

/**
 * Start guarding and collecting a page.
 *
 * Async because it installs a route handler: `page.on("request")` only OBSERVES, and does
 * so after dispatch, so browser traffic - a UI click that navigates to a returned URL, a
 * fetch inside page.evaluate - reached the network with no locality check at all. Routing
 * is the only point at which a browser request can be refused before it is sent.
 */
export async function watch(page: Page): Promise<void> {
  const w: Watch = { consoleErrors: [], badResponses: [], observedResponses: 0, stepRequests: new Set() };
  watches.set(page, w);
  const hostOf = (u: string): string => {
    try {
      return new URL(u).hostname;
    } catch {
      return "";
    }
  };
  const refuse = async (route: Route, verb: string, url: string, host: string) => {
    w.badResponses.push({ status: 0, method: verb, url: url.slice(0, 300) });
    w.consoleErrors.push(`walkthrough blocked ${verb} to non-local host "${host}"`);
    await route.abort("blockedbyclient");
  };
  await page.route("**/*", async (route) => {
    const request = route.request();
    const verb = request.method().toUpperCase();
    // Reads may leave the box (fonts, a CDN, a checkout page the product itself navigates
    // to). Writes may not: production must not be mutated by a walkthrough.
    if (!MUTATING.has(verb)) {
      await route.continue();
      return;
    }
    const host = hostOf(request.url());
    if (!LOCAL_HOSTS.has(host)) {
      await refuse(route, verb, request.url(), host);
      return;
    }
    mutations.push({ method: verb, url: request.url().slice(0, 300) });
    // Playwright documents that a route handler runs only for the FIRST url in a redirect
    // chain, so letting Chromium follow the chain itself meant a local 307 could forward
    // this POST and its body off-box without the guard ever seeing that hop. The chain is
    // therefore followed here, one validated hop at a time.
    let url = request.url();
    let method = verb;
    let response = await route.fetch({ maxRedirects: 0 });
    for (let hop = 0; response.status() >= 300 && response.status() < 400; hop += 1) {
      const location = response.headers()["location"];
      if (!location) break;
      if (hop >= MAX_REDIRECTS) {
        await refuse(route, method, url, "too many redirects");
        return;
      }
      url = new URL(location, url).toString();
      // 301, 302 and 303 become a GET without the body (RFC 9110).
      method = [301, 302, 303].includes(response.status()) ? "GET" : method;
      if (MUTATING.has(method) && !LOCAL_HOSTS.has(hostOf(url))) {
        await refuse(route, method, url, hostOf(url));
        return;
      }
      if (MUTATING.has(method)) mutations.push({ method, url: url.slice(0, 300) });
      response = await route.fetch({ url, method, maxRedirects: 0 });
    }
    await route.fulfill({ response });
  });
  page.on("console", (msg) => {
    if (msg.type() === "error") w.consoleErrors.push(msg.text().slice(0, 300));
  });
  page.on("pageerror", (err) => w.consoleErrors.push(`pageerror: ${String(err.message).slice(0, 300)}`));
  page.on("request", (req) => w.stepRequests.add(req));
  page.on("response", (res) => {
    // Only a response to a request THIS step issued belongs to this step - for the tally
    // AND for badResponses. Attributing just the tally left the same cross-step leak
    // through the other field, because verify.mjs also reads a recorded response as proof
    // the step was exercised: a previous step's 500 arriving during this step's screenshot
    // made a callback that did nothing verify clean.
    if (!w.stepRequests.has(res.request())) return;
    w.observedResponses += 1;
    if (res.status() >= 400) {
      w.badResponses.push({ status: res.status(), method: res.request().method(), url: res.url().slice(0, 300) });
    }
  });
  // page.request is an APIRequestContext whose traffic raises no page events. Shadowing it
  // here covers every `page.request.*` call site without each one having to remember.
  const proxied = recordedApi(page.request);
  try {
    Object.defineProperty(page, "request", { get: () => proxied, configurable: true });
  } catch (err) {
    throw new Error(
      `walkthrough cannot guard page.request, so mutations through it would go unrecorded: ${String(err)}`,
    );
  }
}

function ensureDirs(): void {
  mkdirSync(SHOTS_DIR, { recursive: true });
}

/** Run one walkthrough step. Never throws; always writes one result line. */
export async function step(
  page: Page | null,
  id: string,
  title: string,
  body: () => Promise<StepResult>,
): Promise<StepResult> {
  ensureDirs();
  let result: StepResult;
  const started = Date.now();
  // This step's own tally, reset here so nothing from the previous step counts towards it.
  const watchAtStart = page ? watches.get(page) : undefined;
  if (watchAtStart) {
    watchAtStart.observedResponses = 0;
    watchAtStart.stepRequests.clear();
  }
  const mutationsBefore = mutations.length;
  try {
    result = await body();
  } catch (err) {
    result = { outcome: "FAIL", note: `threw: ${String((err as Error)?.message ?? err).slice(0, 500)}` };
  }
  // Tallied HERE, before the screenshot is awaited. Computing it afterwards let a response
  // arriving during the screenshot count as this step's work, which made a callback that
  // returned immediately look measured.
  const observed = (watchAtStart?.observedResponses ?? 0) + (mutations.length - mutationsBefore);
  let screenshot: string | undefined;
  if (page && !page.isClosed()) {
    // The name is bound to the step so a screenshot cannot stand in for another step.
    const rel = path.join("shots", `${id.replace(/[^\w.-]/g, "_")}.png`);
    try {
      await page.screenshot({ path: path.join(RESULTS_DIR, rel), fullPage: false });
      screenshot = rel;
    } catch {
      screenshot = undefined;
    }
  }
  const w = watchAtStart;
  const line = {
    step: id,
    runId: RUN_ID,
    title,
    ...result,
    screenshot,
    pageUrl: page && !page.isClosed() ? page.url() : undefined,
    consoleErrors: w?.consoleErrors.splice(0) ?? [],
    badResponses: w?.badResponses.splice(0) ?? [],
    requests: mutations.splice(0),
    // What this step actually did. A step that reached no network at all did not exercise
    // anything, whatever its screenshot suggests; verify.mjs reads this, not the screenshot,
    // when deciding whether a FAIL was measured.
    observed,
    ms: Date.now() - started,
    at: new Date().toISOString(),
  };
  appendFileSync(RESULTS_FILE, `${JSON.stringify(line)}\n`);
  return result;
}

/** Shared facts handed from the owner journey to the technician and client journeys. */
export function readState(): Record<string, string> {
  return existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, "utf8")) : {};
}

export function writeState(patch: Record<string, string>): void {
  ensureDirs();
  writeFileSync(STATE_FILE, JSON.stringify({ ...readState(), ...patch }, null, 2));
}

/**
 * The effective local connection, built field by field from DATABASE_URL.
 *
 * Reading only `new URL(url).hostname` was not enough: pg copies the URL's query
 * parameters into its config, so `postgresql://u:p@localhost/db?host=example.invalid`
 * passed a localhost check and then connected to example.invalid. Nothing here is handed a
 * connection string, so a query parameter cannot redirect the connection, and one that
 * tries to is refused rather than ignored.
 */
export function localConnection(): { host: string; port: number; user?: string; password?: string; database?: string } {
  const raw = process.env.DATABASE_URL || "";
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("DATABASE_URL is not a valid URL");
  }
  const redirecting = [...url.searchParams.keys()].filter((k) => /^host|^port$|^hostaddr$/i.test(k));
  if (redirecting.length) {
    throw new Error(`DATABASE_URL carries connection overrides (${redirecting.join(", ")}); refused`);
  }
  const host = url.hostname;
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(`walkthrough refuses non-local DATABASE_URL host "${host}"`);
  }
  return {
    host,
    port: url.port ? Number(url.port) : 5432,
    user: decodeURIComponent(url.username) || undefined,
    password: decodeURIComponent(url.password) || undefined,
    database: decodeURIComponent(url.pathname.replace(/^\//, "")) || undefined,
  };
}

/** A pg client that can only ever address the local walkthrough database. */
export function localClient(): Client {
  return new Client({ ...localConnection(), ssl: false });
}

/**
 * Read-only query against the LOCAL walkthrough database, so a misconfigured environment
 * can never touch production.
 */
export async function localQuery<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  if (!/^\s*select\b/i.test(sql)) throw new Error("localQuery is read-only: SELECT statements only");
  const client = localClient();
  await client.connect();
  try {
    const res = await client.query(sql, params);
    return res.rows as T[];
  } finally {
    await client.end();
  }
}
