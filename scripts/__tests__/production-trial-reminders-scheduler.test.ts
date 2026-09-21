import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import {
  PRODUCTION_ORIGIN,
  REQUEST_TIMEOUT_MS,
  TRIAL_REMINDERS_PATH,
  TRIAL_REMINDERS_SCHEDULE_UTC,
  isDryRunFlag,
  resolveTrialRemindersTrigger,
  triggerProductionTrialReminders,
} from "../ci/trigger-production-trial-reminders.mjs";

/**
 * RA-7597 — live DigitalOcean has no scheduler; Vercel cron only hits
 * sandbox. These tests lock the GitHub Actions → restoreassist.app path
 * and refuse the tempting DigitalOcean `jobs` alternative that the
 * production release contract rejects.
 */

const ROOT = process.cwd();
const WORKFLOW = join(
  ROOT,
  ".github",
  "workflows",
  "cron-production-trial-reminders.yml",
);

function workflow() {
  return parse(readFileSync(WORKFLOW, "utf8")) as {
    name: string;
    on: {
      schedule: Array<{ cron: string }>;
      workflow_dispatch: {
        inputs: {
          dry_run: { default?: boolean; type?: string };
          probe_production: { default?: boolean; type?: string };
        };
      };
    };
    jobs: Record<
      string,
      {
        if?: string;
        environment?: unknown;
        steps?: Array<{ env?: Record<string, string>; run?: string; uses?: string }>;
      }
    >;
  };
}

describe("production trial-reminder scheduler contract", () => {
  it("is scheduled at the same UTC cadence as vercel.json trial-reminders", () => {
    const vercel = JSON.parse(readFileSync(join(ROOT, "vercel.json"), "utf8")) as {
      crons: Array<{ path: string; schedule: string }>;
    };
    const vercelCron = vercel.crons.find(
      (cron) => cron.path === "/api/cron/trial-reminders",
    );
    expect(vercelCron?.schedule).toBe(TRIAL_REMINDERS_SCHEDULE_UTC);
    expect(workflow().on.schedule).toEqual([
      { cron: TRIAL_REMINDERS_SCHEDULE_UTC },
    ]);
  });

  it("targets restoreassist.app and only the trial-reminders route", () => {
    const source = readFileSync(WORKFLOW, "utf8");
    expect(source).toContain("restoreassist.app");
    expect(source).toContain("/api/cron/trial-reminders");
    expect(source).toContain("trigger-production-trial-reminders.mjs");
    expect(source).not.toMatch(/\/api\/cron\/(winback|welcome|founder)/);
    expect(source).not.toMatch(/vercel\.app/);
  });

  it("does not use the production environment (reviewers would block the schedule)", () => {
    for (const job of Object.values(workflow().jobs)) {
      expect(job.environment).toBeUndefined();
    }
  });

  it("rejects non-main refs and defaults manual dispatch to dry-run", () => {
    const parsed = workflow();
    expect(parsed.jobs["reject-non-main"].if).toBe(
      "github.ref != 'refs/heads/main'",
    );
    expect(parsed.jobs.trigger.if).toBe("github.ref == 'refs/heads/main'");
    expect(parsed.on.workflow_dispatch.inputs.dry_run.default).toBe(true);
    expect(parsed.on.workflow_dispatch.inputs.probe_production.default).toBe(
      false,
    );
    const triggerEnv = parsed.jobs.trigger.steps?.find(
      (step) => step.env?.DRY_RUN,
    )?.env?.DRY_RUN;
    expect(triggerEnv).toContain("github.event.inputs.dry_run");
    expect(triggerEnv).not.toMatch(/(?<![.\w])inputs\.dry_run/);
  });

  it("does not add a DigitalOcean scheduled job — the release contract forbids jobs", () => {
    const spec = JSON.parse(readFileSync(join(ROOT, ".do", "app.yaml"), "utf8")) as {
      jobs?: unknown;
      workers?: unknown;
    };
    expect(spec.jobs ?? []).toEqual([]);
    expect(spec.workers ?? []).toEqual([]);

    const release = readFileSync(
      join(ROOT, "scripts", "ci", "digitalocean-production-release.py"),
      "utf8",
    );
    expect(release).toMatch(/unapproved \{group\}/);
    expect(release).toMatch(/"workers", "jobs"/);
  });
});

describe("triggerProductionTrialReminders", () => {
  it("fails closed without CRON_SECRET", async () => {
    const write = { log: vi.fn(), error: vi.fn() };
    const fetchImpl = vi.fn();
    const code = await triggerProductionTrialReminders({
      env: {},
      fetchImpl,
      write,
    });
    expect(code).toBe(1);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(write.error).toHaveBeenCalledWith("CRON_SECRET missing");
  });

  it("GETs the live host with Bearer auth", () => {
    const resolved = resolveTrialRemindersTrigger({
      dryRun: false,
      secret: "s3cret",
    });
    expect(resolved).toEqual({
      ok: true,
      hitServer: true,
      request: {
        method: "GET",
        url: `${PRODUCTION_ORIGIN}${TRIAL_REMINDERS_PATH}`,
        headers: { Authorization: "Bearer s3cret" },
      },
    });
  });

  it("appends dryRun=1 and still stays on restoreassist.app", () => {
    expect(isDryRunFlag("true")).toBe(true);
    const resolved = resolveTrialRemindersTrigger({
      dryRun: "true",
      secret: "s3cret",
    });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.hitServer).toBe(false);
    expect(resolved.request.url).toBe(
      `${PRODUCTION_ORIGIN}${TRIAL_REMINDERS_PATH}?dryRun=1`,
    );
    expect(new URL(resolved.request.url).origin).toBe(PRODUCTION_ORIGIN);
  });

  it("does not hit the live host on a local dry-run", async () => {
    const fetchImpl = vi.fn();
    const write = { log: vi.fn(), error: vi.fn() };
    const code = await triggerProductionTrialReminders({
      env: { CRON_SECRET: "s3cret", DRY_RUN: "1" },
      fetchImpl,
      write,
    });
    expect(code).toBe(0);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(write.log.mock.calls.join("\n")).toMatch(/not hitting restoreassist\.app/);
  });

  it("returns the HTTP status from the live host", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ status: "dry-run", itemsProcessed: 0 }),
    });
    const write = { log: vi.fn(), error: vi.fn() };
    const code = await triggerProductionTrialReminders({
      env: { CRON_SECRET: "s3cret", DRY_RUN: "1", PROBE_PRODUCTION: "1" },
      fetchImpl,
      write,
    });
    expect(code).toBe(0);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("dryRun=1");
    expect(init.method).toBe("GET");
    expect(init.signal).toBeDefined();
    expect(REQUEST_TIMEOUT_MS).toBe(60_000);
  });

  it("exits 1 when fetch throws", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("aborted"));
    const write = { log: vi.fn(), error: vi.fn() };
    const code = await triggerProductionTrialReminders({
      env: { CRON_SECRET: "s3cret" },
      fetchImpl,
      write,
    });
    expect(code).toBe(1);
    expect(write.error).toHaveBeenCalledTimes(1);
    expect(write.log).toHaveBeenCalledTimes(1);
  });

  it("exits 1 when the live host is not ok", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ error: "Unauthorized" }),
    });
    const code = await triggerProductionTrialReminders({
      env: { CRON_SECRET: "s3cret" },
      fetchImpl,
      write: { log: vi.fn(), error: vi.fn() },
    });
    expect(code).toBe(1);
  });
});
