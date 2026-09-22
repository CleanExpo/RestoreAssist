/**
 * RA-7645 / D-027 — which cron routes run on the live site, and how often.
 *
 * vercel.json is read only by the Vercel sandbox project (D-024). The live
 * DigitalOcean app has no scheduler, so `.github/workflows/cron-production.yml`
 * calls https://restoreassist.app/api/cron/<path> with CRON_SECRET, driven by
 * this file through `scripts/ci/trigger-production-crons.mjs`.
 *
 * Every directory under app/api/cron is in exactly one list below; the
 * coverage test fails otherwise. A route that production does not run says
 * why in PRODUCTION_EXCLUDED.
 *
 * Cadence:
 *  - every15 / every30 / hourly run on the workflow's `*\/15` tick. The slot is
 *    the quarter-hour the tick started in (UTC), so a late tick still counts
 *    once and a job never runs more often than its cadence.
 *  - daily@HH runs only from the workflow's own `0 HH * * *` schedule entry
 *    (GitHub passes it as github.event.schedule), never from the tick. A late
 *    start therefore cannot skip the day or run it twice.
 *
 * Idempotency at these cadences (checked for RA-7645):
 *  - sync-xero-payments, retry-failed-webhooks, sync-invoices, cron-watchdog,
 *    trial-reminders, winback, pricing-setup-reminders: runCronJob refuses a
 *    second run while one is still going. Xero rows are claimed atomically;
 *    retries stop at 5 attempts; invoice sync re-queues by status.
 *  - trial-reminders: 20-hour per-user guard plus the email ledger key
 *    (user, trial end, window). Windows start at "now", so a lapsed trial is
 *    never selected.
 *  - winback: email ledger key per expiry; the window is the single day
 *    30 days after expiry.
 *  - pricing-setup-reminders: once per owner (pricingReminderSentAt), off
 *    unless PRICING_REMINDER_ENABLED is "true", lapsed trials skipped.
 *  - storage-mirror: jobs are locked by a conditional update before work.
 *  - storage-mirror-recovery: only FAILED jobs at 5+ attempts, once each.
 *
 * This file is imported by plain Node (the workflow runs the .mjs trigger on
 * the pinned Node 22, which strips types), so keep it erasable TypeScript:
 * no imports, no enums, no namespaces.
 */

export const PRODUCTION_ORIGIN = "https://restoreassist.app";

/** The workflow's quarter-hour tick. */
export const PRODUCTION_TICK_SCHEDULE = "*/15 * * * *";

export type DailyHour =
  | "00" | "01" | "02" | "03" | "04" | "05" | "06" | "07" | "08" | "09"
  | "10" | "11" | "12" | "13" | "14" | "15" | "16" | "17" | "18" | "19"
  | "20" | "21" | "22" | "23";

export type ProductionCadence = "every15" | "every30" | "hourly" | `daily@${DailyHour}`;

export interface ProductionCron {
  /** Directory under app/api/cron. */
  readonly path: string;
  readonly cadence: ProductionCadence;
  /** The route honours ?dryRun=1 (counts, sends nothing, writes nothing). */
  readonly supportsDryRun?: boolean;
}

export interface ExcludedCron {
  readonly path: string;
  readonly reason: string;
}

/** Wave 1. vercel.json cadence in brackets where it differs. */
export const PRODUCTION_ENABLED: readonly ProductionCron[] = [
  { path: "sync-xero-payments", cadence: "every15" },
  { path: "retry-failed-webhooks", cadence: "every30" },
  { path: "sync-invoices", cadence: "hourly" },
  // vercel.json */10; 15 minutes is the tick's resolution.
  { path: "storage-mirror", cadence: "every15" },
  { path: "storage-mirror-recovery", cadence: "every15" },
  // vercel.json 20:50 UTC.
  { path: "cron-watchdog", cadence: "daily@20" },
  { path: "trial-reminders", cadence: "daily@22", supportsDryRun: true },
  { path: "winback", cadence: "daily@23" },
  { path: "pricing-setup-reminders", cadence: "daily@19" },
];

export const PRODUCTION_EXCLUDED: readonly ExcludedCron[] = [
  { path: "process-emails", reason: "no producer: no app code creates ScheduledEmail rows for it to send" },
  { path: "advance-workflows", reason: "no producer: AgentWorkflow rows are only created by lib/agents/orchestrator.ts, which no route calls" },
  { path: "provision-tenant-db", reason: "its only producer (/api/onboarding/database) is off unless TENANT_DATABASE_PROVISIONING_ENABLED is true (pilot only)" },
  { path: "sync-qbo-myob-payments", reason: "QuickBooks and MYOB credentials are absent in production (22/09 audit), so no integration can connect" },
  { path: "cleanup-expired-files", reason: "its TTL list includes the \"attachment\" tag; automated deletion needs D-017 retention sign-off first" },
  { path: "cleanup", reason: "wave 2: deletes old logs, tokens and security events; review against live data before enabling" },
  { path: "media-cleanup", reason: "wave 2: retries failed deletes of invite headshots; review before enabling" },
  { path: "reconcile-stripe", reason: "review before enabling: it downgrades live subscriptions that Stripe reports cancelled" },
  { path: "dead-letter-review", reason: "wave 2: re-queues dead-letter tasks; review what the live dead-letter queue holds first" },
  { path: "backfill-progress", reason: "wave 2: writes inferred ClaimProgress rows for existing reports; needs a live-data review" },
  { path: "google-token-refresh", reason: "wave 2: refreshes every stored Google token weekly; review before enabling" },
  { path: "dr-nrpg-liveness", reason: "wave 2: can mark DR-NRPG integrations inactive after auth failures; review before enabling" },
  { path: "prune-webhook-events", reason: "wave 2: deletes webhook and sync audit rows past 90/180 days; needs retention sign-off (D-017)" },
  { path: "pulse-digest", reason: "wave 2: sends client-facing drying digests and Code of Practice updates; review before enabling" },
  { path: "override-governance", reason: "wave 2: monthly board roll-up only, nothing customer-facing depends on it yet" },
  { path: "sync-ascora-historical", reason: "operator-run: fired on demand by trigger-ascora-sync.yml, not on a schedule" },
  { path: "sync-ascora-labour", reason: "operator-run: fired on demand by trigger-ascora-sync.yml, not on a schedule" },
  { path: "storage-restore", reason: "wave 2: drains the restore queue; not in the approved wave-1 list, review before enabling" },
  { path: "board-meeting", reason: "internal agent cron, pruned in 37221517; not scheduled anywhere" },
  { path: "brand-ambassador", reason: "internal agent cron, pruned in 37221517; not scheduled anywhere" },
  { path: "design-system-onboarding", reason: "internal agent cron, pruned in 37221517; not scheduled anywhere" },
  { path: "scout", reason: "internal agent cron, pruned in 37221517; not scheduled anywhere" },
  { path: "ingest-standards", reason: "operator-invoked with its own STANDARDS_INGEST_TOKEN; not a scheduled job" },
];

function dailyHour(cadence: ProductionCadence): number | null {
  const match = /^daily@(\d{2})$/.exec(cadence);
  return match ? Number(match[1]) : null;
}

/** The cron expression the workflow uses for a daily cadence, e.g. "0 22 * * *". */
export function dailySchedule(cadence: ProductionCadence): string | null {
  const hour = dailyHour(cadence);
  return hour === null ? null : `0 ${hour} * * *`;
}

/** Every schedule entry cron-production.yml must carry: the tick plus one per daily hour. */
export function productionWorkflowSchedules(): string[] {
  const daily = PRODUCTION_ENABLED.map((c) => dailySchedule(c.cadence)).filter(
    (s): s is string => s !== null,
  );
  return [PRODUCTION_TICK_SCHEDULE, ...new Set(daily)];
}

function dueOnTick(cadence: ProductionCadence, now: Date): boolean {
  const slot = Math.floor((now.getUTCHours() * 60 + now.getUTCMinutes()) / 15);
  if (cadence === "every15") return true;
  if (cadence === "every30") return slot % 2 === 0;
  if (cadence === "hourly") return slot % 4 === 0;
  return false;
}

export type DueResult =
  | { ok: true; jobs: ProductionCron[] }
  | { ok: false; error: string };

/**
 * The jobs to fire for one workflow run. `eventSchedule` is
 * github.event.schedule: empty on a manual run, which is treated as a tick.
 */
export function dueProductionCrons(
  eventSchedule: string | undefined,
  now: Date,
): DueResult {
  const schedule = (eventSchedule ?? "").trim();
  if (schedule === "" || schedule === PRODUCTION_TICK_SCHEDULE) {
    return { ok: true, jobs: PRODUCTION_ENABLED.filter((c) => dueOnTick(c.cadence, now)) };
  }
  const daily = PRODUCTION_ENABLED.filter((c) => dailySchedule(c.cadence) === schedule);
  if (daily.length === 0) {
    return {
      ok: false,
      error: `unknown schedule "${schedule}": cron-production.yml and lib/cron/production-schedule.ts disagree`,
    };
  }
  return { ok: true, jobs: daily };
}
