import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { parse } from "yaml";
import {
  MONITORED_CRONS,
  KNOWN_UNMONITORED,
  DELIBERATELY_UNSCHEDULED,
  PRODUCTION_MONITORED_CRONS,
} from "@/lib/cron/expected-jobs";
import {
  PRODUCTION_ENABLED,
  PRODUCTION_EXCLUDED,
  productionWorkflowSchedules,
} from "@/lib/cron/production-schedule";

/**
 * RA-7026 follow-up: the anti-regression guard for cron observability.
 *
 * The Ascora sync failed silently because there was no monitoring at all. This
 * test makes it impossible to add a NEW scheduled cron without either wiring it
 * into the watchdog (MONITORED_CRONS) or explicitly declaring it unmonitored
 * (KNOWN_UNMONITORED) — a deliberate, reviewable choice, never an accident.
 */

const repoRoot = path.resolve(__dirname, "../../../../..");

function scheduledCronPaths(): string[] {
  const vercelJson = JSON.parse(
    fs.readFileSync(path.join(repoRoot, "vercel.json"), "utf8"),
  ) as { crons?: Array<{ path: string }> };
  return (vercelJson.crons ?? []).map((c) =>
    c.path.replace(/^\/api\/cron\//, "").replace(/\/$/, ""),
  );
}

function cronRoutesOnDisk(): string[] {
  const cronRoot = path.join(repoRoot, "app/api/cron");
  return fs
    .readdirSync(cronRoot, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() &&
        fs.existsSync(path.join(cronRoot, entry.name, "route.ts")),
    )
    .map((entry) => entry.name)
    .sort();
}

describe("cron watchdog coverage", () => {
  it("every scheduled cron is monitored or explicitly allow-listed", () => {
    const monitoredPaths = new Set(MONITORED_CRONS.map((c) => c.path));
    const allowlist = new Set(KNOWN_UNMONITORED);

    const uncovered = scheduledCronPaths().filter(
      (p) => !monitoredPaths.has(p) && !allowlist.has(p),
    );

    expect(
      uncovered,
      `These scheduled crons are neither in MONITORED_CRONS nor KNOWN_UNMONITORED. ` +
        `Add each to lib/cron/expected-jobs.ts (monitor it) or KNOWN_UNMONITORED ` +
        `(declare it intentionally unwatched): ${uncovered.join(", ")}`,
    ).toEqual([]);
  });

  it("every monitored cron has a real route directory", () => {
    const missing = MONITORED_CRONS.filter(
      (c) =>
        !fs.existsSync(path.join(repoRoot, "app/api/cron", c.path, "route.ts")),
    ).map((c) => c.path);
    expect(missing, `Registry references routes that don't exist: ${missing.join(", ")}`).toEqual([]);
  });

  it("the watchdog itself is registered as unmonitored (cannot alert on its own crash)", () => {
    expect(KNOWN_UNMONITORED).toContain("cron-watchdog");
  });

  it("monitors the monthly override-governance job instead of silently allow-listing it", () => {
    expect(MONITORED_CRONS).toContainEqual(
      expect.objectContaining({
        path: "override-governance",
        jobName: "override-governance",
        maxStalenessMinutes: 64 * 24 * 60,
      }),
    );
    expect(KNOWN_UNMONITORED).not.toContain("override-governance");
  });

  it("registry entries are unique by jobName and by path", () => {
    const jobNames = MONITORED_CRONS.map((c) => c.jobName);
    const paths = MONITORED_CRONS.map((c) => c.path);
    expect(new Set(jobNames).size).toBe(jobNames.length);
    expect(new Set(paths).size).toBe(paths.length);
  });
});

/**
 * RA-7645: the live site's schedule.
 *
 * vercel.json is read only by the Vercel sandbox project (D-024), so the
 * blocks further down prove nothing about production. Until RA-7645 every
 * one of these tests passed while exactly one job (trial-reminders) was
 * fired against restoreassist.app. This block reads the production manifest
 * and the workflow that fires it, so a route that production never runs has
 * to say so, with a reason.
 */
const PRODUCTION_WORKFLOW = path.join(
  repoRoot,
  ".github/workflows/cron-production.yml",
);

type WorkflowStep = { run?: string; env?: Record<string, string> };
type Workflow = {
  on?: { schedule?: Array<{ cron: string }> };
  jobs?: Record<string, { steps?: WorkflowStep[] }>;
};

function readWorkflow(file: string): Workflow {
  return parse(fs.readFileSync(file, "utf8")) as Workflow;
}

describe("production cron schedule (RA-7645)", () => {
  const enabled = PRODUCTION_ENABLED.map((c) => c.path);
  const excluded = PRODUCTION_EXCLUDED.map((c) => c.path);

  it("every cron route is enabled in production or excluded with a reason, never both", () => {
    const onDisk = cronRoutesOnDisk();
    const listed = [...enabled, ...excluded];

    const unlisted = onDisk.filter((p) => !listed.includes(p));
    expect(
      unlisted,
      `These cron routes are neither in PRODUCTION_ENABLED nor PRODUCTION_EXCLUDED ` +
        `(lib/cron/production-schedule.ts), so nobody has decided whether the live ` +
        `site runs them: ${unlisted.join(", ")}`,
    ).toEqual([]);

    const duplicated = listed.filter((p, i) => listed.indexOf(p) !== i);
    expect(duplicated, `Listed more than once: ${duplicated.join(", ")}`).toEqual(
      [],
    );

    const missing = listed.filter((p) => !onDisk.includes(p));
    expect(
      missing,
      `The production manifest names routes with no route.ts: ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("every excluded route says why", () => {
    const blank = PRODUCTION_EXCLUDED.filter(
      (c) => !c.reason || c.reason.trim().length < 10,
    ).map((c) => c.path);
    expect(blank, `Excluded without a real reason: ${blank.join(", ")}`).toEqual([]);
  });

  it("enables exactly the approved wave-1 jobs", () => {
    expect([...enabled].sort()).toEqual(
      [
        "cron-watchdog",
        "pricing-setup-reminders",
        "retry-failed-webhooks",
        "storage-mirror",
        "storage-mirror-recovery",
        "sync-invoices",
        "sync-xero-payments",
        "trial-reminders",
        "winback",
      ].sort(),
    );
  });

  it("the workflow is scheduled, fires the manifest and passes the production secret", () => {
    const workflow = readWorkflow(PRODUCTION_WORKFLOW);
    const schedules = (workflow.on?.schedule ?? []).map((s) => s.cron);
    expect(schedules.length).toBeGreaterThan(0);
    // Every cadence the manifest relies on has a schedule entry, and there
    // is no schedule entry the trigger does not know how to handle.
    expect([...schedules].sort()).toEqual(
      [...productionWorkflowSchedules()].sort(),
    );

    const steps = Object.values(workflow.jobs ?? {}).flatMap((j) => j.steps ?? []);
    const trigger = steps.find((s) =>
      (s.run ?? "").includes("scripts/ci/trigger-production-crons.mjs"),
    );
    expect(trigger, "no step runs scripts/ci/trigger-production-crons.mjs").toBeDefined();
    expect(trigger?.env?.CRON_SECRET).toBe("${{ secrets.CRON_SECRET }}");
    expect(trigger?.env?.CRON_EVENT_SCHEDULE).toBe("${{ github.event.schedule }}");
  });

  it("no other scheduled workflow calls a cron route, so no job is fired twice", () => {
    const dir = path.join(repoRoot, ".github/workflows");
    const offenders = fs
      .readdirSync(dir)
      .filter((f) => /\.ya?ml$/.test(f) && f !== "cron-production.yml")
      .filter((f) => {
        const file = path.join(dir, f);
        const scheduled = (readWorkflow(file).on?.schedule ?? []).length > 0;
        const src = fs.readFileSync(file, "utf8");
        return (
          scheduled &&
          (/\/api\/cron\//.test(src) || /trigger-production-/.test(src))
        );
      });
    expect(
      offenders,
      `These scheduled workflows also fire cron routes; production would run ` +
        `those jobs twice: ${offenders.join(", ")}`,
    ).toEqual([]);
  });

  it("the watchdog only alarms on jobs production actually runs", () => {
    const expected = MONITORED_CRONS.filter((c) => enabled.includes(c.path)).map(
      (c) => c.jobName,
    );
    expect(PRODUCTION_MONITORED_CRONS.map((c) => c.jobName)).toEqual(expected);

    // An enabled job that writes CronJobRun rows must be watched, or be one
    // of the declared unmonitored routes.
    const unwatched = enabled.filter(
      (p) =>
        !PRODUCTION_MONITORED_CRONS.some((c) => c.path === p) &&
        !KNOWN_UNMONITORED.includes(p),
    );
    expect(unwatched, `Enabled but never watched: ${unwatched.join(", ")}`).toEqual([]);

    const routeSrc = fs.readFileSync(
      path.join(repoRoot, "app/api/cron/cron-watchdog/route.ts"),
      "utf8",
    );
    expect(routeSrc).toMatch(/PRODUCTION_MONITORED_CRONS/);
    expect(routeSrc).not.toMatch(/\bMONITORED_CRONS\.map\(/);
  });
});

describe("Vercel sandbox schedule coverage (RA-7453 / RA-7454 / RA-7455)", () => {
  it("every cron route is scheduled in vercel.json or deliberately unscheduled", () => {
    const scheduled = new Set(scheduledCronPaths());
    const declared = new Set(DELIBERATELY_UNSCHEDULED.map((c) => c.path));

    const orphans = cronRoutesOnDisk().filter(
      (p) => !scheduled.has(p) && !declared.has(p),
    );

    expect(
      orphans,
      `These cron routes exist on disk but are neither scheduled in vercel.json ` +
        `nor declared in DELIBERATELY_UNSCHEDULED (lib/cron/expected-jobs.ts). ` +
        `A route that is in neither place never runs and nothing reports it: ${orphans.join(", ")}`,
    ).toEqual([]);
  });

  it("declared-unscheduled paths are not also in vercel.json", () => {
    const scheduled = new Set(scheduledCronPaths());
    const contradictions = DELIBERATELY_UNSCHEDULED.map((c) => c.path).filter(
      (p) => scheduled.has(p),
    );

    expect(
      contradictions,
      `Declared unscheduled but present in vercel.json — one of the two is a lie: ${contradictions.join(", ")}`,
    ).toEqual([]);
  });

  it("every deliberately-unscheduled entry has a real route and a reason", () => {
    const missing = DELIBERATELY_UNSCHEDULED.filter(
      (c) =>
        !fs.existsSync(path.join(repoRoot, "app/api/cron", c.path, "route.ts")),
    ).map((c) => c.path);
    expect(
      missing,
      `DELIBERATELY_UNSCHEDULED references routes that don't exist: ${missing.join(", ")}`,
    ).toEqual([]);

    const blank = DELIBERATELY_UNSCHEDULED.filter(
      (c) => !c.reason || c.reason.trim().length === 0,
    ).map((c) => c.path);
    expect(
      blank,
      `DELIBERATELY_UNSCHEDULED entries need a one-line reason: ${blank.join(", ")}`,
    ).toEqual([]);
  });

  it("vercel.json does not schedule paths with no route.ts", () => {
    const missing = scheduledCronPaths().filter(
      (p) =>
        !fs.existsSync(path.join(repoRoot, "app/api/cron", p, "route.ts")),
    );
    expect(
      missing,
      `vercel.json schedules paths with no route.ts — these 404 on every fire: ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("schedules and monitors the invoice-sync backstop (RA-7454)", () => {
    expect(scheduledCronPaths()).toContain("sync-invoices");
    expect(MONITORED_CRONS).toContainEqual(
      expect.objectContaining({
        path: "sync-invoices",
        jobName: "sync-invoices",
        maxStalenessMinutes: 140,
      }),
    );
    expect(KNOWN_UNMONITORED).not.toContain("sync-invoices");
    expect(DELIBERATELY_UNSCHEDULED.map((c) => c.path)).not.toContain(
      "sync-invoices",
    );

    // A MONITORED_CRONS entry without runCronJob would page every night as
    // never_succeeded. The wrap is what makes the watchdog entry honest.
    const routeSrc = fs.readFileSync(
      path.join(repoRoot, "app/api/cron/sync-invoices/route.ts"),
      "utf8",
    );
    expect(routeSrc).toMatch(/runCronJob\(\s*["']sync-invoices["']/);
  });

  it("schedules and monitors cleanup-expired-files (RA-7453)", () => {
    expect(scheduledCronPaths()).toContain("cleanup-expired-files");
    expect(MONITORED_CRONS).toContainEqual(
      expect.objectContaining({
        path: "cleanup-expired-files",
        jobName: "cleanup-expired-files",
        maxStalenessMinutes: 28 * 60,
      }),
    );
    expect(KNOWN_UNMONITORED).not.toContain("cleanup-expired-files");
    expect(DELIBERATELY_UNSCHEDULED.map((c) => c.path)).not.toContain(
      "cleanup-expired-files",
    );

    const vercelJson = JSON.parse(
      fs.readFileSync(path.join(repoRoot, "vercel.json"), "utf8"),
    ) as { crons?: Array<{ path: string; schedule: string }> };
    const entry = vercelJson.crons?.find(
      (c) => c.path === "/api/cron/cleanup-expired-files",
    );
    // 16:00 UTC = 02:00 AEST — the cadence the lib comment always claimed.
    expect(entry?.schedule).toBe("0 16 * * *");

    // A MONITORED_CRONS entry without runCronJob would page every night as
    // never_succeeded. The wrap is what makes the watchdog entry honest.
    const routeSrc = fs.readFileSync(
      path.join(repoRoot, "app/api/cron/cleanup-expired-files/route.ts"),
      "utf8",
    );
    expect(routeSrc).toMatch(/runCronJob\(\s*["']cleanup-expired-files["']/);
  });

  it("keeps the four still-pruned agent crons plus ingest-standards unscheduled (RA-7455)", () => {
    const scheduled = new Set(scheduledCronPaths());
    const declared = new Map(
      DELIBERATELY_UNSCHEDULED.map((c) => [c.path, c.reason]),
    );

    const pruned = [
      "board-meeting",
      "brand-ambassador",
      "design-system-onboarding",
      "scout",
    ] as const;

    for (const pathName of pruned) {
      expect(scheduled.has(pathName), `${pathName} was re-added to vercel.json`).toBe(
        false,
      );
      expect(declared.get(pathName)).toMatch(/pruned in 37221517/);
    }

    expect(declared.get("ingest-standards")).toMatch(/operator-invoked/);
    expect(scheduled.has("override-governance")).toBe(true);
    expect(declared.has("override-governance")).toBe(false);
    expect(scheduled.has("cleanup-expired-files")).toBe(true);
    expect(declared.has("cleanup-expired-files")).toBe(false);
  });
});

/**
 * Comment-truthfulness (RA-7455 residual).
 *
 * A comment describing another file's state is a claim with a shelf life.
 * The route⊆scheduled-or-declared guard cannot see prose, so a pruned cron
 * can still tell a reader it fires every Monday. Collapse the leading
 * block comment (newlines included — override-governance once split
 * "registered" / "in vercel.json" across two lines) and refuse a live
 * schedule claim on a declared-unscheduled route.
 */
const CRON_FIELD = String.raw`[*\d][\d*,/-]*`;
const CRON_EXPR = new RegExp(
  String.raw`(?:^|[^\d*])((?:${CRON_FIELD}\s+){4}${CRON_FIELD})`,
);
const REGISTRATION_CLAIM = /registered\s+in\s+vercel\.json/i;
const PROSE_SCHEDULE = /(?:called by vercel cron|fires\s+\w+day|\bschedule\s*:)/i;

const PRUNED_COMMENT_PATHS = [
  "app/api/cron/board-meeting/route.ts",
  "app/api/cron/brand-ambassador/route.ts",
  "lib/cron/brand-ambassador.ts",
  "app/api/cron/design-system-onboarding/route.ts",
  "app/api/cron/scout/route.ts",
  "lib/cron/board-meeting.ts",
  "lib/cron/design-system-onboarding.ts",
] as const;

function leadingComment(src: string): string {
  const match = src.match(/\/\*\*[\s\S]*?\*\//);
  return match?.[0] ?? "";
}

function collapseComment(block: string): string {
  return block
    .replace(/^\/\*\*?/, "")
    .replace(/\*\/$/, "")
    .replace(/^\s*\*\s?/gm, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findStaleScheduleClaims(commentBody: string): string[] {
  const collapsed = collapseComment(commentBody);
  const claims: string[] = [];
  const cron = collapsed.match(CRON_EXPR);
  if (cron?.[1]) claims.push(cron[1]);
  if (REGISTRATION_CLAIM.test(collapsed)) {
    claims.push("registered in vercel.json");
  }
  if (PROSE_SCHEDULE.test(collapsed)) {
    claims.push("prose schedule claim");
  }
  return claims;
}

/**
 * Scheduled-cron comment truthfulness (RA-7460 expressions, RA-7469 prose).
 *
 * vercel.json is what runs and its expressions are UTC. A comment that
 * restates the schedule must agree with it. Conventions enforced:
 *   - a backticked five-field expression is UTC and must equal vercel.json;
 *   - a stated time must carry UTC, AEST (+10) or AEDT (+11) and equal the
 *     vercel.json time in that zone; a time with no zone is a finding;
 *   - "every N minutes" / "every minute" must equal the vercel.json interval,
 *     and "daily" beside a stated time needs a schedule that runs every day
 *     (day-of-month, month and day-of-week all `*`);
 *   - "daily" / "hourly" with no time or interval is not a claim.
 * Every time or interval in a route's comments is read as a claim about
 * that route. A comment that refers to another route names it and points
 * at its route file; it does not restate that route's timing.
 */
const TZ_OFFSET_HOURS: Record<string, number> = { UTC: 0, AEST: 10, AEDT: 11 };
const CRON_FIELD_RANGES: Array<[number, number]> = [
  [0, 59],
  [0, 23],
  [1, 31],
  [1, 12],
  [0, 7],
];
const TIME_CLAIM =
  /\b(\d{1,2}):(\d{2})(?:\s*([AP]M))?\b|\b(\d{1,2})\s*([AP]M)\b/gi;
const INTERVAL_CLAIM = /\bevery\s+(?:(\d+)\s*)?min(?:ute)?s?\b/gi;
const BACKTICKED = /`([^`]+)`/g;

function commentSourcesFor(segment: string): string[] {
  return [`app/api/cron/${segment}/route.ts`, `lib/cron/${segment}.ts`].filter(
    (rel) => fs.existsSync(path.join(repoRoot, rel)),
  );
}

function blockComments(src: string): string[] {
  return (src.match(/\/\*\*[\s\S]*?\*\//g) ?? []).map(collapseComment);
}

function isCronExpression(candidate: string): boolean {
  const fields = candidate.trim().split(/\s+/);
  if (fields.length !== 5) return false;
  return fields.every((field, i) => {
    if (!/^[*\d][\d*,/-]*$/.test(field)) return false;
    const [lo, hi] = CRON_FIELD_RANGES[i]!;
    const [base, step] = field.split("/");
    if (step !== undefined && !(Number(step) >= 1)) return false;
    return (base!.match(/\d+/g) ?? []).every(
      (n) => Number(n) >= lo && Number(n) <= hi,
    );
  });
}

/** The fixed UTC hour:minute of a daily expression, or null. */
function dailyUtcTime(schedule: string): { h: number; m: number } | null {
  const [min, hour] = schedule.split(/\s+/);
  if (!/^\d+$/.test(min ?? "") || !/^\d+$/.test(hour ?? "")) return null;
  return { h: Number(hour), m: Number(min) };
}

/** True when day-of-month, month and day-of-week are all `*`. */
function runsEveryDay(schedule: string): boolean {
  return schedule.trim().split(/\s+/).slice(2).every((field) => field === "*");
}

/** Minutes between fires for a `*` or step minute field, or null. */
function minuteInterval(schedule: string): number | null {
  const [min, hour] = schedule.split(/\s+/);
  if (hour !== "*" || !runsEveryDay(schedule)) return null;
  if (min === "*") return 1;
  const step = min?.match(/^\*\/(\d+)$/);
  return step ? Number(step[1]) : null;
}

function timeFinding(
  text: string,
  h: number,
  min: number,
  zone: string | undefined,
  schedule: string,
): string | null {
  if (!zone) return `"${text}" names no timezone (write UTC, AEST or AEDT)`;
  const utc = dailyUtcTime(schedule);
  if (!utc) {
    return `"${text} ${zone}" but vercel.json \`${schedule}\` has no fixed daily time`;
  }
  const expected = (utc.h + TZ_OFFSET_HOURS[zone]!) % 24;
  if (expected === h && utc.m === min) return null;
  const want = `${String(expected).padStart(2, "0")}:${String(utc.m).padStart(2, "0")}`;
  return `"${text} ${zone}" but vercel.json \`${schedule}\` is ${want} ${zone}`;
}

function scheduleClaimFindings(
  comment: string,
  schedule: string,
): string[] {
  const findings: string[] = [];

  for (const m of comment.matchAll(BACKTICKED)) {
    const expr = m[1]!.trim();
    if (isCronExpression(expr) && expr !== schedule.trim()) {
      findings.push(`states \`${expr}\`, vercel.json runs \`${schedule}\``);
    }
  }

  for (const sentence of comment.split(/(?<=[.;])\s+/)) {
    const timed = [...sentence.matchAll(TIME_CLAIM)].length > 0;
    if (timed && /\bdaily\b/i.test(sentence) && !runsEveryDay(schedule)) {
      findings.push(`"daily" but vercel.json \`${schedule}\` does not run every day`);
    }
    for (const m of sentence.matchAll(TIME_CLAIM)) {
      const text = m[0];
      let h = Number(m[1] ?? m[4]);
      const min = Number(m[2] ?? 0);
      const meridiem = (m[3] ?? m[5])?.toUpperCase();
      if (meridiem === "AM" && h === 12) h = 0;
      if (meridiem === "PM" && h !== 12) h += 12;
      const after = sentence.slice(m.index! + text.length);
      const zone = after.match(/^\s*(UTC|AEST|AEDT)\b/)?.[1];
      const finding = timeFinding(text, h, min, zone, schedule);
      if (finding) findings.push(finding);
    }

    for (const m of sentence.matchAll(INTERVAL_CLAIM)) {
      const claimed = Number(m[1] ?? 1);
      if (minuteInterval(schedule) === claimed) continue;
      findings.push(`"${m[0]}" but vercel.json runs \`${schedule}\``);
    }
  }

  return findings;
}

function scheduledCrons(): Array<{ segment: string; schedule: string }> {
  const vercelJson = JSON.parse(
    fs.readFileSync(path.join(repoRoot, "vercel.json"), "utf8"),
  ) as { crons?: Array<{ path: string; schedule: string }> };
  return (vercelJson.crons ?? []).map((c) => ({
    segment: c.path.replace(/^\/api\/cron\//, "").replace(/\/$/, ""),
    schedule: c.schedule,
  }));
}

function routeComments(segment: string): Array<{ rel: string; comment: string }> {
  return commentSourcesFor(segment).flatMap((rel) =>
    blockComments(fs.readFileSync(path.join(repoRoot, rel), "utf8")).map(
      (comment) => ({ rel, comment }),
    ),
  );
}

function routeScheduleFindings(segment: string, schedule: string): string[] {
  return routeComments(segment).flatMap(({ rel, comment }) =>
    scheduleClaimFindings(comment, schedule).map(
      (f) => `${rel}: ${f}`,
    ),
  );
}

function routeClaimCount(segment: string): number {
  return routeComments(segment).reduce(
    (count, { comment }) =>
      count +
      [...comment.matchAll(BACKTICKED)].filter((m) => isCronExpression(m[1]!))
        .length +
      [...comment.matchAll(TIME_CLAIM)].length +
      [...comment.matchAll(INTERVAL_CLAIM)].length,
    0,
  );
}

/** RA-7469's control table: sites whose comments are correct. */
const CORRECT_SCHEDULE_COMMENTS = [
  "dead-letter-review",
  "retry-failed-webhooks",
  "provision-tenant-db",
  "sync-invoices",
  "sync-ascora-labour",
  "sync-xero-payments",
  "storage-mirror",
  "storage-restore",
  "dr-nrpg-liveness",
  "pulse-digest",
  "winback",
  "pricing-setup-reminders",
  "cleanup-expired-files",
  "google-token-refresh",
] as const;

describe("cron comment truthfulness (RA-7455)", () => {
  it("detector self-test: collapsed registration and cron expressions", () => {
    expect(
      findStaleScheduleClaims(
        "/**\n * Schedule: 0 23 * * *  (daily 23:00 UTC)\n */",
      ),
    ).toEqual(expect.arrayContaining(["0 23 * * *", "prose schedule claim"]));

    expect(
      findStaleScheduleClaims(
        "/**\n * Schedule: 0 1 1 * *  (...) — registered\n * in vercel.json.\n */",
      ),
    ).toEqual(
      expect.arrayContaining(["0 1 1 * *", "registered in vercel.json"]),
    );

    expect(
      findStaleScheduleClaims(
        "/** Fires Tuesday 00:00 UTC — one hour after Scout Agent */",
      ),
    ).toContain("prose schedule claim");

    expect(
      findStaleScheduleClaims(
        "/** Not scheduled — see DELIBERATELY_UNSCHEDULED (pruned in 37221517). */",
      ),
    ).toEqual([]);

    expect(
      findStaleScheduleClaims(
        "/** operator-invoked, not scheduled (no vercel.json entry) */",
      ),
    ).toEqual([]);
  });

  it("declared-unscheduled routes do not claim a vercel.json schedule", () => {
    const stale: string[] = [];

    for (const entry of DELIBERATELY_UNSCHEDULED) {
      const rel = path.join("app/api/cron", entry.path, "route.ts");
      const src = fs.readFileSync(path.join(repoRoot, rel), "utf8");
      const claims = findStaleScheduleClaims(leadingComment(src));
      for (const claim of claims) {
        stale.push(`${rel}: ${claim}`);
      }
    }

    expect(
      stale,
      `These routes are declared in DELIBERATELY_UNSCHEDULED but their ` +
        `comments still tell a reader they run on a schedule:\n  ${stale.join("\n  ")}`,
    ).toEqual([]);
  });

  it("pruned-agent comment sites say they are not scheduled", () => {
    const silent: string[] = [];

    for (const rel of PRUNED_COMMENT_PATHS) {
      const src = fs.readFileSync(path.join(repoRoot, rel), "utf8");
      const collapsed = collapseComment(leadingComment(src));
      if (!/not scheduled/i.test(collapsed)) {
        silent.push(rel);
      }
      const claims = findStaleScheduleClaims(leadingComment(src));
      expect(
        claims,
        `${rel} still carries a live schedule claim: ${claims.join(", ")}`,
      ).toEqual([]);
    }

    expect(
      silent,
      `A reader opening these routes cannot tell they never run. Each must ` +
        `say "not scheduled" in its header comment, as ingest-standards does:\n  ${silent.join(", ")}`,
    ).toEqual([]);
  });

  it("scheduled-cron comments state the vercel.json schedule (RA-7460, RA-7469)", () => {
    const crons = scheduledCrons();
    expect(crons.length).toBeGreaterThan(0);
    const wrong: string[] = [];
    for (const { segment, schedule } of crons) {
      expect(
        commentSourcesFor(segment).length,
        `${segment} is scheduled but has no route.ts or lib/cron file to inspect`,
      ).toBeGreaterThan(0);
      wrong.push(...routeScheduleFindings(segment, schedule));
    }
    expect(
      wrong,
      `These comments contradict vercel.json (UTC). Correct the comment, ` +
        `never the schedule:\n  ${wrong.join("\n  ")}`,
    ).toEqual([]);
  });

  it("negative controls: the RA-7469 correct sites stay silent, and are actually read", () => {
    const bySegment = new Map(
      scheduledCrons().map((c) => [c.segment, c.schedule]),
    );
    for (const segment of CORRECT_SCHEDULE_COMMENTS) {
      const schedule = bySegment.get(segment);
      expect(schedule, `${segment} is no longer in vercel.json`).toBeDefined();
      expect(routeScheduleFindings(segment, schedule!), segment).toEqual([]);
      // Non-vacuous: every control except sync-ascora-labour ("an hourly
      // cron", deliberately not a claim) yields at least one checked claim.
      if (segment !== "sync-ascora-labour") {
        expect(
          routeClaimCount(segment),
          `${segment} yielded no checked claim`,
        ).toBeGreaterThan(0);
      }
    }
  });

  it("negative control: millisecond arithmetic is not a cron expression (RA-7460)", () => {
    for (const text of ["15 * 60 * 1000", "30 * 60 * 1000"]) {
      expect(isCronExpression(text)).toBe(false);
      expect(
        scheduleClaimFindings(`timeout \`${text}\``, "0 1 * * *"),
      ).toEqual([]);
    }
    expect(isCronExpression("*/10 * * * *")).toBe(true);
  });

  it("expression arm: a backticked expression that is not vercel.json's is a finding", () => {
    expect(
      scheduleClaimFindings(
        "Schedule: every 10 minutes (`* * * * *` in vercel.json)",
        "*/10 * * * *",
      ),
    ).toEqual(["states `* * * * *`, vercel.json runs `*/10 * * * *`"]);
    // Mutant schedule for a real, correctly commented route: the guard fires.
    expect(routeScheduleFindings("google-token-refresh", "0 6 * * 0")).not.toEqual(
      [],
    );
  });

  it("timezone-label arm: AEST and AEDT are parsed, never assumed UTC", () => {
    expect(
      scheduleClaimFindings("Vercel daily 09:00 AEST.", "0 23 * * *"),
    ).toEqual([]);
    expect(
      scheduleClaimFindings(
        "Runs daily at 21:00 UTC (07:00 AEST / 08:00 AEDT).",
        "0 21 * * *",
      ),
    ).toEqual([]);
    expect(
      scheduleClaimFindings(
        "Runs daily at 3:00 AM UTC via Vercel Cron",
        "0 17 * * *",
      ),
    ).toEqual(['"3:00 AM UTC" but vercel.json `0 17 * * *` is 17:00 UTC']);
  });

  it("unlabelled-time arm: a time with no timezone fails loudly", () => {
    expect(
      scheduleClaimFindings(
        "Wired into vercel.json (daily, off-peak: 02:30).",
        "30 16 * * *",
      ),
    ).toEqual(['"02:30" names no timezone (write UTC, AEST or AEDT)']);
    // "Runs daily" with no time is not a claim.
    expect(scheduleClaimFindings("Runs daily.", "30 16 * * *")).toEqual(
      [],
    );
  });

  it("interval arm: 'every N minutes' must equal the vercel.json interval", () => {
    expect(
      scheduleClaimFindings(
        "Runs every 1 minute via Vercel Cron",
        "*/5 * * * *",
      ),
    ).toEqual(['"every 1 minute" but vercel.json runs `*/5 * * * *`']);
    expect(
      scheduleClaimFindings("Schedule: every minute.", "*/10 * * * *"),
    ).toHaveLength(1);
    expect(
      scheduleClaimFindings("Runs every 5 minutes.", "*/5 * * * *"),
    ).toEqual([]);
  });

  it("other-route arm: another route's timing restated here is a finding", () => {
    // A comment names another route and points at its file; it does not
    // restate that route's timing, which is read as a claim about this one.
    expect(
      scheduleClaimFindings(
        "Runs every 30 minutes (vercel.json) so the next sync-xero-payments " +
          "poll (which runs every 15 minutes) sees it.",
        "*/30 * * * *",
      ),
    ).toEqual(['"every 15 minutes" but vercel.json runs `*/30 * * * *`']);
    expect(
      scheduleClaimFindings(
        "Runs daily at 17:30 UTC, after the main cleanup cron at 17:00 UTC.",
        "30 17 * * *",
      ),
    ).toEqual(['"17:00 UTC" but vercel.json `30 17 * * *` is 17:30 UTC']);
    // Review round-1 P1: storage-mirror runs */10, not */5.
    expect(
      scheduleClaimFindings(
        "Unlike storage-mirror, Schedule: every 5 minutes (vercel.json).",
        "*/10 * * * *",
      ),
    ).toEqual(['"every 5 minutes" but vercel.json runs `*/10 * * * *`']);
  });

  it("coincident-route arm: a claim true only for a named route is still a finding", () => {
    // Review round-2 P1: process-emails really runs */5, so a name-based
    // excuse passes this false claim about storage-restore (*/10).
    expect(
      scheduleClaimFindings(
        "Unlike process-emails, Schedule: every 5 minutes (vercel.json).",
        "*/10 * * * *",
      ),
    ).toEqual(['"every 5 minutes" but vercel.json runs `*/10 * * * *`']);
  });

  it("recurrence arm: 'daily' needs every day-of-month, month and weekday", () => {
    // CodeRabbit on #2345: `0 9 * * 1` fires on Mondays only.
    expect(
      scheduleClaimFindings("Runs daily at 09:00 UTC.", "0 9 * * 1"),
    ).toEqual(['"daily" but vercel.json `0 9 * * 1` does not run every day']);
    // Day-of-month restricted (override-governance's real schedule).
    expect(
      scheduleClaimFindings("Runs daily at 01:00 UTC.", "0 1 1 * *"),
    ).toEqual(['"daily" but vercel.json `0 1 1 * *` does not run every day']);
  });

  it("recurrence arm: 'every N minutes' needs every day-of-month, month and weekday", () => {
    // CodeRabbit on #2345: `*/5 * * * 1` fires on Mondays only.
    expect(
      scheduleClaimFindings("Runs every 5 minutes.", "*/5 * * * 1"),
    ).toEqual(['"every 5 minutes" but vercel.json runs `*/5 * * * 1`']);
    // Month restricted: January only.
    expect(
      scheduleClaimFindings("Runs every 5 minutes.", "*/5 * * 1 *"),
    ).toEqual(['"every 5 minutes" but vercel.json runs `*/5 * * 1 *`']);
    // A restricted schedule stated as such is not a finding.
    expect(
      scheduleClaimFindings("Schedule: weekly, Sunday 05:00 UTC.", "0 5 * * 0"),
    ).toEqual([]);
  });
});
