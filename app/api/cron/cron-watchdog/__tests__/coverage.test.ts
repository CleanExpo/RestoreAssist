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

describe("cron route schedule coverage (RA-7453 / RA-7454 / RA-7455)", () => {
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
});
