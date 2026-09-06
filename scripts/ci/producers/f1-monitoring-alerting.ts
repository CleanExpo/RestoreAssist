/**
 * F1-monitoring-alerting producer: measures whether production monitoring
 * actually runs, and whether its alarms can actually fire.
 *
 * THE CRITERION, AND A STALE DESCRIPTION OF IT
 * --------------------------------------------
 * The criterion, as `docs/evidence/release-gate/1.0.0/F1-monitoring-alerting.md`
 * states it, is platform-neutral:
 *
 *   "Monitoring and alerting are configured for auth failures, billing webhook
 *    errors, and restore/job workflow failures."
 *
 * `scripts/release-gate-score.ts` describes it as "Vercel Observability alert
 * rules configured for auth/billing/restore". That description is stale, and
 * building to it would have been this criterion's version of A3's defect --
 * measuring a population that is not the one the criterion is about.
 *
 * Production is DigitalOcean App Platform: `.do/app.yaml` binds
 * `restoreassist.app` as the primary domain. The only Vercel project linked to
 * this repository is `restoreassist-sandbox`, whose domains are
 * `restoreassist-sandbox-unite-group.vercel.app` and its git alias -- it does
 * not serve `restoreassist.app`. Three Vercel Observability alert rules on that
 * project would satisfy the stale description word for word while watching
 * preview deployments and alerting on nothing a customer touches.
 *
 * So this producer measures the criterion, not the description.
 *
 * WHAT IT MEASURES, AND WHY EACH HALF IS NECESSARY
 * -----------------------------------------------
 *  1. **Monitoring that runs and is green.** Each declared production check
 *     must exist, be scheduled, have run inside its own window, and its latest
 *     run must have succeeded. Freshness is not a nicety: the Supabase advisor
 *     gate was RED for eight consecutive weeks, which means the check watching
 *     prod for RLS-disabled tables had not looked at prod since 2026-06-22. A
 *     check that is failing is not monitoring, and a check that has stopped
 *     running is not monitoring either -- both report silence, and silence is
 *     what a healthy system also looks like.
 *
 *  2. **Alarms that can fire.** This is the half the evidence file found the
 *     hard way, and it is the reason those eight weeks produced ZERO
 *     notifications. `supabase-advisor-gate.yml` opens its failure issue with
 *     `gh issue create --label "security"`, and the `security` label does not
 *     exist in this repository. `gh issue create` rejects a non-existent label,
 *     so the notifier step failed too. The check was dark AND its alarm was
 *     broken, and nothing said so.
 *
 *     A notifier referencing a label that does not exist is not alerting. It is
 *     an alarm wired to a bell that was never installed, and it reads exactly
 *     like a working one in review.
 *
 * WHY THE COVERAGE MAP IS DELIBERATELY EMPTY
 * ------------------------------------------
 * The criterion names three failure classes. `F1_ALERT_COVERAGE` maps each to
 * the alert that watches it, and it is EMPTY -- so this criterion cannot pass.
 * That is the honest state, not a regression.
 *
 * The evidence file is explicit that the signals exist in code while nothing
 * watches them: every `LOGIN_FAILED` is a `SecurityEvent` row, every billing
 * failure is a `StripeWebhookEvent.status = 'FAILED'` plus a structured
 * `stage = "stripe-webhook:processing"` log line, every restore failure is a
 * `StorageRestoreJob` row and a `reportError()` call. Its own words: "None of
 * these is wired to an alert - someone has to go looking."
 *
 * Filling this map is an owner action, because it requires choosing where the
 * alerts live now that production is not on Vercel, and because whatever is
 * chosen has to be reachable by this producer to be measured. Until then F1
 * fails closed with a precise list rather than passing on the strength of four
 * scheduled workflows that watch other things. The same shape as
 * `A3_EXPECTED_VIEWER_ID`, which is empty for the same reason.
 *
 * Usage:
 *   GITHUB_TOKEN=... npx tsx scripts/ci/producers/f1-monitoring-alerting.ts --json
 *
 * This script never signs: it has no access to the signing key and must not.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

export const F1_REPOSITORY = "CleanExpo/RestoreAssist";
const GITHUB_API = "https://api.github.com";

/** The three failure classes the criterion names. Not negotiable here. */
export const F1_REQUIRED_CLASSES = [
  "auth-failures",
  "billing-webhook-errors",
  "restore-job-failures",
] as const;

/**
 * Which alert watches each required class.
 *
 * DELIBERATELY EMPTY. See "why the coverage map is deliberately empty" above.
 * An entry here is a claim that a specific, measurable alert exists for that
 * class -- not an intention to build one.
 */
export const F1_ALERT_COVERAGE: Record<string, string> = {};

/**
 * The scheduled checks that watch production, and how stale each may be.
 *
 * `maxAgeHours` is generous against each cron so an ordinary queue delay is not
 * read as a dead check, but tight enough that a check which stopped firing is
 * caught within one cycle. Declared here rather than derived from the cron so
 * narrowing the window is a reviewed edit rather than a side effect.
 */
export interface F1Check {
  workflow: string;
  maxAgeHours: number;
}

export const F1_PRODUCTION_CHECKS: readonly F1Check[] = [
  { workflow: "smoke-prod.yml", maxAgeHours: 2 },
  { workflow: "pilot-canary.yml", maxAgeHours: 48 },
  { workflow: "supabase-advisor-gate.yml", maxAgeHours: 192 },
  { workflow: "deepsec-weekly.yml", maxAgeHours: 192 },
];

export interface WorkflowRun {
  status: string;
  conclusion: string | null;
  created_at: string;
  event: string;
}

/** The measurement bag this producer emits, all values receipt-safe scalars. */
export interface F1Measurements {
  source: string;
  repository: string;
  checksDeclared: number;
  checksHealthy: number;
  failingChecks: string;
  staleChecks: string;
  notifierLabelsDeclared: string;
  missingNotifierLabels: string;
  requiredClasses: string;
  coveredClasses: string;
  uncoveredClasses: string;
}

/**
 * Reduce the observed runs, labels and coverage map to the measurements.
 *
 * Pure and separately tested: this is where a false pass would be born, and it
 * should not need a network round trip to exercise.
 */
export function summariseF1(input: {
  runs: Map<string, WorkflowRun | undefined>;
  existingLabels: Set<string>;
  declaredLabels: string[];
  now: Date;
  checks?: readonly F1Check[];
  coverage?: Record<string, string>;
}): F1Measurements {
  const checks = input.checks ?? F1_PRODUCTION_CHECKS;
  const coverage = input.coverage ?? F1_ALERT_COVERAGE;

  const failing: string[] = [];
  const stale: string[] = [];

  for (const check of checks) {
    const run = input.runs.get(check.workflow);
    if (!run) {
      // No run at all is the strongest form of "not monitoring": a workflow
      // that has never fired watches nothing. Counted as stale rather than
      // failing so the two causes stay distinguishable in the receipt.
      stale.push(check.workflow);
      continue;
    }
    if (run.status !== "completed" || run.conclusion !== "success") {
      failing.push(check.workflow);
    }
    const ageHours =
      (input.now.getTime() - new Date(run.created_at).getTime()) / 3_600_000;
    if (!Number.isFinite(ageHours) || ageHours > check.maxAgeHours) {
      stale.push(check.workflow);
    }
  }

  const missingLabels = input.declaredLabels
    .filter((label) => !input.existingLabels.has(label))
    .sort();

  const covered = [...F1_REQUIRED_CLASSES].filter((c) => coverage[c]);
  const uncovered = [...F1_REQUIRED_CLASSES].filter((c) => !coverage[c]);

  const unhealthy = new Set([...failing, ...stale]);

  return {
    source: "github-actions",
    repository: F1_REPOSITORY,
    checksDeclared: checks.length,
    checksHealthy: checks.length - unhealthy.size,
    failingChecks: [...failing].sort().join(","),
    staleChecks: [...stale].sort().join(","),
    notifierLabelsDeclared: [...input.declaredLabels].sort().join(","),
    missingNotifierLabels: missingLabels.join(","),
    requiredClasses: [...F1_REQUIRED_CLASSES].join(","),
    coveredClasses: covered.join(","),
    uncoveredClasses: uncovered.join(","),
  };
}

/**
 * Read every label a failure notifier asks `gh issue create` for.
 *
 * Parsed from the workflow sources rather than listed by hand: a notifier added
 * later with a new label would otherwise go unchecked, which is the same
 * "nothing noticed" failure this criterion is about.
 */
export function declaredNotifierLabels(sources: string[]): string[] {
  const labels = new Set<string>();
  for (const source of sources) {
    // Only labels on a `gh issue create` invocation matter -- a --label
    // elsewhere is not an alarm.
    for (const block of source.split("gh issue create").slice(1)) {
      // Stop at the next step boundary so a later step's flags are not read as
      // part of this notifier.
      const scope = block.split(/^\s*-\s+name:/m)[0];
      for (const match of scope.matchAll(/--label\s+"([^"]+)"/g)) {
        labels.add(match[1]);
      }
    }
  }
  return [...labels].sort();
}

async function githubJson(path: string, token: string): Promise<unknown> {
  const response = await fetch(`${GITHUB_API}${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!response.ok) {
    throw new Error(`GET ${path} returned ${response.status} ${response.statusText}`);
  }
  return response.json();
}

/** The most recent SCHEDULED run, which is the one that proves the check fires. */
export async function latestScheduledRun(
  workflow: string,
  token: string,
): Promise<WorkflowRun | undefined> {
  const payload = (await githubJson(
    `/repos/${F1_REPOSITORY}/actions/workflows/${workflow}/runs?event=schedule&per_page=1`,
    token,
  )) as { workflow_runs?: WorkflowRun[] };
  return payload.workflow_runs?.[0];
}

async function existingLabels(token: string): Promise<Set<string>> {
  const labels = new Set<string>();
  for (let page = 1; page <= 10; page++) {
    const payload = (await githubJson(
      `/repos/${F1_REPOSITORY}/labels?per_page=100&page=${page}`,
      token,
    )) as Array<{ name?: string }>;
    if (!Array.isArray(payload) || payload.length === 0) break;
    for (const label of payload) if (label.name) labels.add(label.name);
    if (payload.length < 100) break;
  }
  return labels;
}

/**
 * Take the measurement. Exported so `sign-release-receipt.ts` can invoke it
 * directly rather than accepting numbers on the command line.
 */
export async function produceF1Measurements(
  token: string,
  now: Date = new Date(),
): Promise<F1Measurements> {
  const runs = new Map<string, WorkflowRun | undefined>();
  await Promise.all(
    F1_PRODUCTION_CHECKS.map(async (check) => {
      runs.set(check.workflow, await latestScheduledRun(check.workflow, token));
    }),
  );

  const sources = F1_PRODUCTION_CHECKS.map((check) =>
    readFileSync(join(process.cwd(), ".github", "workflows", check.workflow), "utf8"),
  );

  return summariseF1({
    runs,
    existingLabels: await existingLabels(token),
    declaredLabels: declaredNotifierLabels(sources),
    now,
  });
}

async function main(): Promise<void> {
  const token = process.env.GITHUB_TOKEN?.trim();
  if (!token) {
    console.error(
      "GITHUB_TOKEN is not set. This producer reads workflow runs and labels " +
        "directly so the measurement is reproducible rather than transcribed.",
    );
    process.exit(2);
  }
  const m = await produceF1Measurements(token);

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(m));
    return;
  }
  console.log(
    `${m.checksHealthy}/${m.checksDeclared} production checks healthy.`,
  );
  if (m.failingChecks) console.log(`Failing: ${m.failingChecks}`);
  if (m.staleChecks) console.log(`Stale or never run: ${m.staleChecks}`);
  if (m.missingNotifierLabels) {
    console.log(
      `Alarms that cannot fire -- these labels do not exist: ${m.missingNotifierLabels}. ` +
        "`gh issue create` rejects a non-existent label, so the notifier step " +
        "fails and no issue is ever filed.",
    );
  }
  if (m.uncoveredClasses) {
    console.log(
      `No alert covers: ${m.uncoveredClasses}. The signals exist in code -- ` +
        "SecurityEvent rows, StripeWebhookEvent FAILED plus the " +
        "stage=stripe-webhook:processing log line, StorageRestoreJob failures " +
        "and reportError() -- but nothing watches them. F1 cannot pass until " +
        "an alert exists for each class and is registered in F1_ALERT_COVERAGE.",
    );
  }
}

// Only run when invoked directly, so the pure exports stay importable.
if (process.argv[1]?.endsWith("f1-monitoring-alerting.ts")) {
  main().catch((error) => {
    console.error(String(error));
    process.exit(1);
  });
}
