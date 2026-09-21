import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  MONITORED_CRONS,
  KNOWN_UNMONITORED,
  DELIBERATELY_UNSCHEDULED,
} from "@/lib/cron/expected-jobs";

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

describe("cron route schedule coverage (RA-7454 / RA-7455)", () => {
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
});
