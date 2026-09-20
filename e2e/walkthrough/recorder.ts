/**
 * Shared step recorder for the three-persona walkthrough (owner, technician, client).
 *
 * Every step appends exactly one JSON line to results.jsonl with a screenshot, the
 * console errors, the HTTP >= 400 responses and every non-GET request seen since the
 * previous step. A step never throws: a measured failure is recorded as FAIL and the
 * journey moves on, so one broken screen cannot hide the rest of the product. A step
 * that could NOT be exercised is UNMEASURED, never FAIL. verify.mjs checks the file.
 *
 * Outcomes: PASS, FAIL, EXPECTED-BY-CODE (a gap the code already shows), PURCHASED
 * (Stripe test mode), SIMULATED (signed webhook, no Stripe), BYPASS (seeded), UNMEASURED.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";
import { Client } from "pg";

export const RESULTS_DIR =
  process.env.WALKTHROUGH_DIR || "/Volumes/Storage Unit/RestoreAssist/walkthrough-20260919";
const RESULTS_FILE = path.join(RESULTS_DIR, "results.jsonl");
const STATE_FILE = path.join(RESULTS_DIR, "state.json");
const RUN_FILE = path.join(RESULTS_DIR, "run.json");

/**
 * The one destination every journey is allowed to reach. Each spec used to re-derive
 * this from PLAYWRIGHT_BASE_URL WITHOUT the locality check the Playwright config
 * applies, so the check existed in one place and the 26 mutating calls read another.
 */
export const BASE_URL = ((): string => {
  const raw = (process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
  if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(raw)) {
    throw new Error(`walkthrough refuses non-local base URL "${raw}"`);
  }
  return raw;
})();

/**
 * Identity of THIS run. Results used to append to a reused file with no run marker, so
 * a rerun interrupted before a required step borrowed that step's evidence from an
 * older, complete run. The first worker to create run.json wins (O_EXCL); the other two
 * Playwright projects read the id it wrote.
 */
export const RUN_ID = ((): string => {
  if (process.env.WALKTHROUGH_RUN) return process.env.WALKTHROUGH_RUN;
  mkdirSync(RESULTS_DIR, { recursive: true });
  const candidate = `run-${new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14)}`;
  try {
    writeFileSync(RUN_FILE, `${JSON.stringify({ runId: candidate, startedAt: new Date().toISOString() }, null, 2)}\n`, {
      flag: "wx",
    });
    return candidate;
  } catch {
    return String(JSON.parse(readFileSync(RUN_FILE, "utf8")).runId);
  }
})();

const SHOTS_DIR = path.join(RESULTS_DIR, "shots", RUN_ID);

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
  requests: { method: string; url: string }[];
}

const watches = new WeakMap<Page, Watch>();

/** Start collecting console errors, failing responses and mutating requests for a page. */
export function watch(page: Page): void {
  const w: Watch = { consoleErrors: [], badResponses: [], requests: [] };
  watches.set(page, w);
  page.on("console", (msg) => {
    if (msg.type() === "error") w.consoleErrors.push(msg.text().slice(0, 300));
  });
  page.on("pageerror", (err) => w.consoleErrors.push(`pageerror: ${String(err.message).slice(0, 300)}`));
  page.on("response", (res) => {
    if (res.status() >= 400) {
      w.badResponses.push({ status: res.status(), method: res.request().method(), url: res.url().slice(0, 300) });
    }
  });
  // Every mutation, not only the ones that failed. The destination check reads these.
  page.on("request", (req) => {
    if (req.method().toUpperCase() !== "GET") {
      w.requests.push({ method: req.method(), url: req.url().slice(0, 300) });
    }
  });
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
  try {
    result = await body();
  } catch (err) {
    result = { outcome: "FAIL", note: `threw: ${String((err as Error)?.message ?? err).slice(0, 500)}` };
  }
  let screenshot: string | undefined;
  if (page && !page.isClosed()) {
    const rel = path.join("shots", RUN_ID, `${id.replace(/[^\w.-]/g, "_")}.png`);
    try {
      await page.screenshot({ path: path.join(RESULTS_DIR, rel), fullPage: false });
      screenshot = rel;
    } catch {
      screenshot = undefined;
    }
  }
  const w = page ? watches.get(page) : undefined;
  const line = {
    step: id,
    runId: RUN_ID,
    title,
    ...result,
    screenshot,
    pageUrl: page && !page.isClosed() ? page.url() : undefined,
    consoleErrors: w?.consoleErrors.splice(0) ?? [],
    badResponses: w?.badResponses.splice(0) ?? [],
    requests: w?.requests.splice(0) ?? [],
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
 * passed a localhost check and then connected to example.invalid. Nothing here is
 * handed a connection string, so a query parameter cannot redirect the connection, and
 * a parameter that tries to is refused out loud rather than ignored.
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
  if (host !== "localhost" && host !== "127.0.0.1") {
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
 * Read-only query against the LOCAL walkthrough database, so a misconfigured
 * environment can never touch production.
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
