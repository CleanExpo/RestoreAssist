/**
 * Shared step recorder for the three-persona walkthrough (owner, technician, client).
 *
 * Every step appends exactly one JSON line to results.jsonl with a screenshot, the
 * console errors and the HTTP >= 400 responses seen since the previous step. A step
 * never throws: a failure is recorded as FAIL and the journey moves on, so one broken
 * screen cannot hide the rest of the product. verify.mjs checks the file afterwards.
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
}

const watches = new WeakMap<Page, Watch>();

/** Start collecting console errors and failing responses for a page. Call once per page. */
export function watch(page: Page): void {
  const w: Watch = { consoleErrors: [], badResponses: [] };
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
    const rel = path.join("shots", `${id.replace(/[^\w.-]/g, "_")}.png`);
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
    title,
    ...result,
    screenshot,
    pageUrl: page && !page.isClosed() ? page.url() : undefined,
    consoleErrors: w?.consoleErrors.splice(0) ?? [],
    badResponses: w?.badResponses.splice(0) ?? [],
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
 * Read-only query against the LOCAL walkthrough database. Refuses any DATABASE_URL
 * that is not localhost, so a misconfigured environment can never touch production.
 */
export async function localQuery<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const url = process.env.DATABASE_URL || "";
  const host = (() => {
    try {
      return new URL(url).hostname;
    } catch {
      return "";
    }
  })();
  if (host !== "localhost" && host !== "127.0.0.1") {
    throw new Error(`localQuery refuses non-local DATABASE_URL host "${host}"`);
  }
  if (!/^\s*select\b/i.test(sql)) throw new Error("localQuery is read-only: SELECT statements only");
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const res = await client.query(sql, params);
    return res.rows as T[];
  } finally {
    await client.end();
  }
}
