import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { MONITORED_CRONS, KNOWN_UNMONITORED } from "@/lib/cron/expected-jobs";

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

  it("registry entries are unique by jobName and by path", () => {
    const jobNames = MONITORED_CRONS.map((c) => c.jobName);
    const paths = MONITORED_CRONS.map((c) => c.path);
    expect(new Set(jobNames).size).toBe(jobNames.length);
    expect(new Set(paths).size).toBe(paths.length);
  });
});
