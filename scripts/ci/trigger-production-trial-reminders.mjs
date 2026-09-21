#!/usr/bin/env node

/**
 * RA-7597 — fire /api/cron/trial-reminders against live DigitalOcean.
 *
 * Vercel cron in vercel.json only runs on the Vercel project, which talks to
 * the sandbox database. The reviewed .do/app.yaml is a single `web` service;
 * digitalocean-production-release.py refuses any `jobs` group (D-024). This
 * script is the live-host scheduler: it calls restoreassist.app with
 * CRON_SECRET. Welcome emails and the founder sign-up alert are not invoked.
 */

import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export const PRODUCTION_ORIGIN = "https://restoreassist.app";
export const TRIAL_REMINDERS_PATH = "/api/cron/trial-reminders";
export const TRIAL_REMINDERS_SCHEDULE_UTC = "0 22 * * *";
export const REQUEST_TIMEOUT_MS = 60_000;

export function isDryRunFlag(value) {
  return value === true || value === "1" || value === "true";
}

export function resolveTrialRemindersTrigger({ dryRun, secret, probeProduction }) {
  if (typeof secret !== "string" || secret.length === 0) {
    return { ok: false, error: "CRON_SECRET missing" };
  }
  const url = new URL(TRIAL_REMINDERS_PATH, PRODUCTION_ORIGIN);
  if (isDryRunFlag(dryRun)) {
    url.searchParams.set("dryRun", "1");
  }
  if (url.origin !== PRODUCTION_ORIGIN) {
    return { ok: false, error: "refusing to leave restoreassist.app" };
  }
  return {
    ok: true,
    hitServer: !isDryRunFlag(dryRun) || isDryRunFlag(probeProduction),
    request: {
      method: "GET",
      url: url.toString(),
      headers: { Authorization: `Bearer ${secret}` },
    },
  };
}

function writeError(write, message) {
  if (typeof write.error === "function") write.error(message);
  else write.log(message);
}

export async function triggerProductionTrialReminders({
  env = process.env,
  fetchImpl = fetch,
  write = console,
} = {}) {
  const resolved = resolveTrialRemindersTrigger({
    dryRun: env.DRY_RUN,
    secret: env.CRON_SECRET,
    probeProduction: env.PROBE_PRODUCTION,
  });
  if (!resolved.ok) {
    writeError(write, resolved.error);
    return 1;
  }

  write.log(
    `[trial-reminders] ${resolved.request.method} ${resolved.request.url}`,
  );

  // Current production ignores ?dryRun=1 and would send. A local dry-run
  // therefore prints the request and stops unless PROBE_PRODUCTION=1
  // (safe only after this SHA is serving restoreassist.app).
  if (!resolved.hitServer) {
    write.log(
      "[trial-reminders] dry-run: not hitting restoreassist.app (set PROBE_PRODUCTION=1 after this SHA is live)",
    );
    return 0;
  }

  try {
    const response = await fetchImpl(resolved.request.url, {
      method: resolved.request.method,
      headers: resolved.request.headers,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const body = await response.text();
    write.log(`[trial-reminders] HTTP ${response.status}`);
    write.log(body);
    return response.ok ? 0 : 1;
  } catch (error) {
    writeError(write, `[trial-reminders] request failed: ${error}`);
    return 1;
  }
}

function main() {
  return triggerProductionTrialReminders();
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
