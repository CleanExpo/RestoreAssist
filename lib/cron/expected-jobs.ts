/**
 * Cron health registry + analyzer (RA-7026 follow-up).
 *
 * WHY: the Ascora historical sync failed silently for four consecutive nights
 * (2026-07-06 → 07-09). Every failure WAS recorded in CronJobRun and even
 * surfaced as an HTTP 500 (runCronJob throws), but nothing actively told the
 * operator — so a broken cron stayed invisible until someone hand-queried the
 * table. This registry + `analyzeCronHealth` are the detection half of the
 * `cron-watchdog` route, which turns those silent records into an email alert.
 *
 * The registry is keyed by the string each route passes to `runCronJob(...)`
 * (which is what lands in CronJobRun.jobName), NOT the URL path — most match,
 * but a few differ (e.g. /api/cron/scout → "scout-agent"). Each entry also
 * carries its `path` (route segment) so the coverage test can prove every
 * scheduled+audited cron in vercel.json is monitored here.
 */

export interface CronExpectation {
  /** vercel.json route segment, e.g. "sync-ascora-historical". */
  path: string;
  /** The jobName written to CronJobRun (runCronJob's first arg). */
  jobName: string;
  /** Human label for the alert email. */
  label: string;
  /**
   * Max minutes a healthy job may go without a *successful* run before it is
   * "stale". Rule of thumb: ~2× the cadence + buffer, so a single missed run
   * doesn't page but a genuinely stuck job does.
   */
  maxStalenessMinutes: number;
}

const MIN = 1;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/**
 * Scheduled crons that use runCronJob (so they emit CronJobRun rows we can
 * watch). Budgets derive from the vercel.json schedule.
 */
export const MONITORED_CRONS: readonly CronExpectation[] = [
  // ── high-frequency (*/5) ──────────────────────────────────────────────
  { path: "process-emails", jobName: "process-emails", label: "Outbound email queue", maxStalenessMinutes: 20 * MIN },
  { path: "advance-workflows", jobName: "advance-workflows", label: "Workflow advancer", maxStalenessMinutes: 20 * MIN },
  { path: "provision-tenant-db", jobName: "provision-tenant-db", label: "Tenant DB provisioner", maxStalenessMinutes: 20 * MIN },
  // ── */15 ──────────────────────────────────────────────────────────────
  { path: "dead-letter-review", jobName: "dead-letter-review", label: "Dead-letter review", maxStalenessMinutes: 45 * MIN },
  { path: "sync-xero-payments", jobName: "sync-xero-payments", label: "Xero payment sync", maxStalenessMinutes: 45 * MIN },
  { path: "sync-qbo-myob-payments", jobName: "sync-qbo-myob-payments", label: "QBO/MYOB payment sync", maxStalenessMinutes: 45 * MIN },
  // ── */30 ──────────────────────────────────────────────────────────────
  { path: "retry-failed-webhooks", jobName: "retry-failed-webhooks", label: "Webhook retry", maxStalenessMinutes: 70 * MIN },
  // ── hourly ────────────────────────────────────────────────────────────
  { path: "sync-ascora-labour", jobName: "sync-ascora-labour", label: "Ascora labour importer", maxStalenessMinutes: 140 * MIN },
  // ── daily ─────────────────────────────────────────────────────────────
  { path: "cleanup", jobName: "cleanup", label: "Daily cleanup", maxStalenessMinutes: 28 * HOUR },
  { path: "trial-reminders", jobName: "trial-reminders", label: "Trial reminders", maxStalenessMinutes: 28 * HOUR },
  { path: "backfill-progress", jobName: "backfill-progress", label: "Progress backfill", maxStalenessMinutes: 28 * HOUR },
  { path: "winback", jobName: "winback", label: "Win-back campaign", maxStalenessMinutes: 28 * HOUR },
  { path: "dr-nrpg-liveness", jobName: "dr-nrpg-liveness", label: "DR-NRPG liveness", maxStalenessMinutes: 28 * HOUR },
  { path: "prune-webhook-events", jobName: "prune-webhook-events", label: "Webhook-event pruning", maxStalenessMinutes: 28 * HOUR },
  { path: "reconcile-stripe", jobName: "reconcile-stripe", label: "Stripe reconciliation", maxStalenessMinutes: 28 * HOUR },
  { path: "pulse-digest", jobName: "pulse-digest", label: "Pulse digest", maxStalenessMinutes: 28 * HOUR },
  { path: "sync-ascora-historical", jobName: "sync-ascora-historical", label: "Ascora historical sync", maxStalenessMinutes: 28 * HOUR },
  // ── weekly (Sun 05:00) ────────────────────────────────────────────────
  { path: "google-token-refresh", jobName: "google-token-refresh", label: "Google token refresh", maxStalenessMinutes: 8 * DAY },
];

/**
 * Scheduled crons that are deliberately NOT watched via CronJobRun, so the
 * coverage test stays green when they appear in vercel.json.
 *
 * - storage-mirror / storage-mirror-recovery / storage-restore: do NOT wrap
 *   their work in runCronJob, so they emit no CronJobRun rows to inspect.
 *   TODO(RA-7026): wrap these in runCronJob, then promote into MONITORED_CRONS.
 * - cron-watchdog: it cannot alert on its own failure (it is the alerter); a
 *   watchdog crash still surfaces as an HTTP 500 to Vercel Cron.
 */
export const KNOWN_UNMONITORED: readonly string[] = [
  "storage-mirror",
  "storage-mirror-recovery",
  "storage-restore",
  "cron-watchdog",
];

export type CronProblemKind = "never_succeeded" | "stale" | "failing";

export interface CronJobSummary {
  jobName: string;
  /** Timestamp of the most recent status="completed" run, or null. */
  lastSuccessAt: Date | null;
  /** Count of status="failed" runs since the last success (or all-time if never). */
  consecutiveFailures: number;
}

export interface CronProblem {
  jobName: string;
  label: string;
  kind: CronProblemKind;
  detail: string;
  lastSuccessAt: Date | null;
  consecutiveFailures: number;
  stalenessMinutes: number | null;
}

export interface CronHealthReport {
  healthy: boolean;
  problems: CronProblem[];
  checkedAt: Date;
  monitoredCount: number;
}

export interface AnalyzeCronHealthOptions {
  /** Consecutive failures that trigger a "failing" alert on an otherwise-fresh job. Default 2. */
  failureThreshold?: number;
}

/**
 * Pure health analysis — no DB, no I/O. Given the registry, a compact per-job
 * summary (built by the route from CronJobRun), and `now`, return every job
 * that is unhealthy. A job is unhealthy when it:
 *   - never succeeded            → "never_succeeded"
 *   - last success is too old    → "stale"
 *   - is fresh but failing ≥N×   → "failing"
 */
export function analyzeCronHealth(
  expectations: readonly CronExpectation[],
  summaries: readonly CronJobSummary[],
  now: Date,
  options: AnalyzeCronHealthOptions = {},
): CronHealthReport {
  const failureThreshold = options.failureThreshold ?? 2;
  const byName = new Map(summaries.map((s) => [s.jobName, s]));
  const problems: CronProblem[] = [];

  for (const exp of expectations) {
    const summary = byName.get(exp.jobName);
    const lastSuccessAt = summary?.lastSuccessAt ?? null;
    const consecutiveFailures = summary?.consecutiveFailures ?? 0;

    if (lastSuccessAt === null) {
      problems.push({
        jobName: exp.jobName,
        label: exp.label,
        kind: "never_succeeded",
        detail:
          consecutiveFailures > 0
            ? `No successful run on record; ${consecutiveFailures} failure(s) logged.`
            : "No successful run on record in the lookback window.",
        lastSuccessAt: null,
        consecutiveFailures,
        stalenessMinutes: null,
      });
      continue;
    }

    const stalenessMinutes = Math.floor(
      (now.getTime() - lastSuccessAt.getTime()) / 60_000,
    );

    if (stalenessMinutes > exp.maxStalenessMinutes) {
      problems.push({
        jobName: exp.jobName,
        label: exp.label,
        kind: "stale",
        detail: `Last success ${stalenessMinutes} min ago (budget ${exp.maxStalenessMinutes} min).`,
        lastSuccessAt,
        consecutiveFailures,
        stalenessMinutes,
      });
      continue;
    }

    if (consecutiveFailures >= failureThreshold) {
      problems.push({
        jobName: exp.jobName,
        label: exp.label,
        kind: "failing",
        detail: `${consecutiveFailures} failure(s) since the last success ${stalenessMinutes} min ago.`,
        lastSuccessAt,
        consecutiveFailures,
        stalenessMinutes,
      });
    }
  }

  return {
    healthy: problems.length === 0,
    problems,
    checkedAt: now,
    monitoredCount: expectations.length,
  };
}

/** Render the alert email body. Kept here so it is unit-testable. */
export function renderCronAlertHtml(report: CronHealthReport): string {
  const rows = report.problems
    .map(
      (p) => `
      <tr>
        <td style="padding:6px 10px;border:1px solid #ddd;font-weight:600;">${escapeHtml(p.label)}</td>
        <td style="padding:6px 10px;border:1px solid #ddd;"><code>${escapeHtml(p.jobName)}</code></td>
        <td style="padding:6px 10px;border:1px solid #ddd;">${escapeHtml(p.kind)}</td>
        <td style="padding:6px 10px;border:1px solid #ddd;">${escapeHtml(p.detail)}</td>
      </tr>`,
    )
    .join("");

  return `
  <div style="font-family:system-ui,sans-serif;color:#1C2E47;">
    <h2 style="margin:0 0 8px;">RestoreAssist cron health alert</h2>
    <p style="margin:0 0 12px;color:#555;">
      ${report.problems.length} of ${report.monitoredCount} monitored cron job(s) need attention
      (checked ${report.checkedAt.toISOString()}).
    </p>
    <table style="border-collapse:collapse;font-size:14px;">
      <thead>
        <tr>
          <th style="padding:6px 10px;border:1px solid #ddd;text-align:left;">Job</th>
          <th style="padding:6px 10px;border:1px solid #ddd;text-align:left;">jobName</th>
          <th style="padding:6px 10px;border:1px solid #ddd;text-align:left;">Problem</th>
          <th style="padding:6px 10px;border:1px solid #ddd;text-align:left;">Detail</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="margin:14px 0 0;color:#888;font-size:12px;">
      Source: CronJobRun audit table. Fix, then trigger the job manually to clear the alert.
    </p>
  </div>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
