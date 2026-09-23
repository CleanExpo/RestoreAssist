#!/usr/bin/env node

/**
 * RA-7645 / D-027 — fire the production cron routes on the live site.
 *
 * Vercel cron (vercel.json) only runs on the Vercel sandbox project. The live
 * DigitalOcean app has no scheduler and the release contract forbids adding a
 * `jobs` component (D-024), so .github/workflows/cron-production.yml runs this
 * script. It reads lib/cron/production-schedule.ts, works out which enabled
 * jobs are due for this run, and GETs https://restoreassist.app/api/cron/<path>
 * with CRON_SECRET.
 *
 * Environment:
 *   CRON_SECRET          required; an empty value fails the run, dry runs included
 *   CRON_EVENT_SCHEDULE  github.event.schedule; empty on a manual run (a tick)
 *   DRY_RUN              print what would run and call nothing
 *   PROBE_PRODUCTION     with DRY_RUN: GET only the routes that honour ?dryRun=1
 *
 * Exit 1 on an empty secret, an unknown schedule, or any job that answers
 * non-2xx or cannot be reached. Every due job is still called first, so one
 * failure never starves the rest.
 *
 * The repository is public and so are its Actions logs: this prints the job,
 * the HTTP status and the item count, never the secret or a success body.
 */

import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import {
  PRODUCTION_ENABLED,
  PRODUCTION_ORIGIN,
  dueProductionCrons,
} from "../../lib/cron/production-schedule.ts";

/** Longer than the slowest enabled route may run (sync-invoices maxDuration 300 s). */
export const REQUEST_TIMEOUT_MS = 330_000;
const ERROR_BODY_LIMIT = 300;

export function isFlag(value) {
  return value === true || value === "1" || value === "true";
}

export function cronUrl(path, { dryRun = false } = {}) {
  const url = new URL(`/api/cron/${path}`, PRODUCTION_ORIGIN);
  if (dryRun) url.searchParams.set("dryRun", "1");
  if (url.origin !== PRODUCTION_ORIGIN) {
    throw new Error(`refusing to leave ${PRODUCTION_ORIGIN}: ${path}`);
  }
  return url.toString();
}

function writeError(write, message) {
  if (typeof write.error === "function") write.error(message);
  else write.log(message);
}

function summarise(body) {
  try {
    const parsed = JSON.parse(body);
    const parts = [];
    if (typeof parsed?.status === "string") parts.push(`status=${parsed.status}`);
    if (typeof parsed?.itemsProcessed === "number") {
      parts.push(`items=${parsed.itemsProcessed}`);
    }
    return parts.join(" ");
  } catch {
    return "";
  }
}

async function callJob({ path, url, secret, fetchImpl, write }) {
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const body = await response.text();
    if (response.ok) {
      write.log(`[cron] ${path} HTTP ${response.status} ${summarise(body)}`.trimEnd());
      return true;
    }
    writeError(
      write,
      `[cron] ${path} HTTP ${response.status} ${body.slice(0, ERROR_BODY_LIMIT)}`,
    );
    return false;
  } catch (error) {
    writeError(write, `[cron] ${path} request failed: ${error}`);
    return false;
  }
}

export async function triggerProductionCrons({
  env = process.env,
  now = new Date(),
  fetchImpl = fetch,
  write = console,
} = {}) {
  const secret = env.CRON_SECRET;
  if (typeof secret !== "string" || secret.length === 0) {
    writeError(
      write,
      "CRON_SECRET missing: add it as a repository Actions secret (the same value as production).",
    );
    return 1;
  }

  const schedule = env.CRON_EVENT_SCHEDULE ?? "";
  const due = dueProductionCrons(schedule, now);
  if (!due.ok) {
    writeError(write, `[cron] ${due.error}`);
    return 1;
  }

  const label = schedule.trim() === "" ? "manual run (tick)" : `schedule "${schedule}"`;
  write.log(
    `[cron] ${label} at ${now.toISOString()}: ${due.jobs.length} due` +
      (due.jobs.length ? ` (${due.jobs.map((j) => j.path).join(", ")})` : ""),
  );

  if (isFlag(env.DRY_RUN)) {
    for (const job of due.jobs) {
      write.log(`[cron] dry run: would GET ${cronUrl(job.path)}`);
    }
    if (!isFlag(env.PROBE_PRODUCTION)) {
      write.log("[cron] dry run: nothing called (set probe_production to check the live host)");
      return 0;
    }
    // Only routes that honour ?dryRun=1 are safe to call here; every other
    // route ignores the query and would do real work.
    let probeFailed = false;
    for (const job of PRODUCTION_ENABLED.filter((j) => j.supportsDryRun)) {
      const ok = await callJob({
        path: job.path,
        url: cronUrl(job.path, { dryRun: true }),
        secret,
        fetchImpl,
        write,
      });
      probeFailed ||= !ok;
    }
    return probeFailed ? 1 : 0;
  }

  const failed = [];
  for (const job of due.jobs) {
    const ok = await callJob({
      path: job.path,
      url: cronUrl(job.path),
      secret,
      fetchImpl,
      write,
    });
    if (!ok) failed.push(job.path);
  }

  if (failed.length > 0) {
    writeError(write, `[cron] ${failed.length} job(s) failed: ${failed.join(", ")}`);
    return 1;
  }
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  triggerProductionCrons()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
