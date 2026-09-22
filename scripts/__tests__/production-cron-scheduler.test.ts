import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import {
  PRODUCTION_ENABLED,
  PRODUCTION_ORIGIN,
  PRODUCTION_TICK_SCHEDULE,
  dueProductionCrons,
  productionWorkflowSchedules,
} from "../../lib/cron/production-schedule";
import {
  REQUEST_TIMEOUT_MS,
  triggerProductionCrons,
} from "../ci/trigger-production-crons.mjs";

/**
 * RA-7645 — the live DigitalOcean site has no scheduler (D-024), so GitHub
 * Actions fires the production cron routes. These tests lock three things:
 * each job runs at its own cadence and never more often, the trigger fails
 * loudly (empty secret, any non-2xx), and a dry run sends nothing.
 */

const ROOT = process.cwd();
const WORKFLOW = join(ROOT, ".github", "workflows", "cron-production.yml");

type Step = { env?: Record<string, string>; run?: string; uses?: string; with?: Record<string, string> };
function workflow() {
  return parse(readFileSync(WORKFLOW, "utf8")) as {
    on: {
      schedule: Array<{ cron: string }>;
      workflow_dispatch: {
        inputs: {
          dry_run: { default?: boolean; type?: string };
          probe_production: { default?: boolean; type?: string };
        };
      };
    };
    concurrency: { group: string; "cancel-in-progress": boolean };
    jobs: Record<string, { if?: string; environment?: unknown; steps?: Step[] }>;
  };
}

function at(iso: string): Date {
  return new Date(iso);
}

function duePaths(eventSchedule: string | undefined, now: Date): string[] {
  const result = dueProductionCrons(eventSchedule, now);
  if (!result.ok) throw new Error(result.error);
  return result.jobs.map((j) => j.path).sort();
}

const EVERY_TICK = ["storage-mirror", "storage-mirror-recovery", "sync-xero-payments"];

describe("dueProductionCrons — each job at its own cadence", () => {
  it("a :00 tick fires the 15-minute, 30-minute and hourly jobs, never a daily one", () => {
    expect(duePaths(PRODUCTION_TICK_SCHEDULE, at("2026-09-22T22:00:00Z"))).toEqual(
      [...EVERY_TICK, "retry-failed-webhooks", "sync-invoices"].sort(),
    );
  });

  it("a :15 tick fires only the 15-minute jobs", () => {
    expect(duePaths(PRODUCTION_TICK_SCHEDULE, at("2026-09-22T22:15:00Z"))).toEqual(
      EVERY_TICK,
    );
  });

  it("a :30 tick adds the 30-minute job but not the hourly one", () => {
    expect(duePaths(PRODUCTION_TICK_SCHEDULE, at("2026-09-22T22:30:00Z"))).toEqual(
      [...EVERY_TICK, "retry-failed-webhooks"].sort(),
    );
  });

  it("a tick that GitHub starts late still counts in the slot it started in", () => {
    expect(duePaths(PRODUCTION_TICK_SCHEDULE, at("2026-09-22T22:07:41Z"))).toContain(
      "sync-invoices",
    );
  });

  it("each daily job fires only from its own schedule entry", () => {
    expect(duePaths("0 22 * * *", at("2026-09-22T22:03:00Z"))).toEqual([
      "trial-reminders",
    ]);
    expect(duePaths("0 23 * * *", at("2026-09-22T23:40:00Z"))).toEqual(["winback"]);
    expect(duePaths("0 19 * * *", at("2026-09-22T19:00:00Z"))).toEqual([
      "pricing-setup-reminders",
    ]);
    expect(duePaths("0 20 * * *", at("2026-09-22T20:00:00Z"))).toEqual([
      "cron-watchdog",
    ]);
  });

  it("a manual run (no schedule) behaves like a tick and never fires a daily job", () => {
    expect(duePaths(undefined, at("2026-09-22T22:00:00Z"))).not.toContain(
      "trial-reminders",
    );
    expect(duePaths("", at("2026-09-22T22:15:00Z"))).toEqual(EVERY_TICK);
  });

  it("refuses a schedule it does not know, rather than guessing", () => {
    const result = dueProductionCrons("5 4 * * *", at("2026-09-22T04:05:00Z"));
    expect(result.ok).toBe(false);
  });

  it("over a whole day, no job runs more often than its cadence", () => {
    const fires = new Map<string, number>();
    const count = (paths: string[]) =>
      paths.forEach((p) => fires.set(p, (fires.get(p) ?? 0) + 1));

    for (let slot = 0; slot < 96; slot++) {
      const hh = String(Math.floor(slot / 4)).padStart(2, "0");
      const mm = String((slot % 4) * 15).padStart(2, "0");
      count(duePaths(PRODUCTION_TICK_SCHEDULE, at(`2026-09-22T${hh}:${mm}:00Z`)));
    }
    for (const schedule of productionWorkflowSchedules()) {
      if (schedule === PRODUCTION_TICK_SCHEDULE) continue;
      count(duePaths(schedule, at("2026-09-22T12:00:00Z")));
    }

    expect(Object.fromEntries([...fires].sort())).toEqual({
      "cron-watchdog": 1,
      "pricing-setup-reminders": 1,
      "retry-failed-webhooks": 48,
      "storage-mirror": 96,
      "storage-mirror-recovery": 96,
      "sync-invoices": 24,
      "sync-xero-payments": 96,
      "trial-reminders": 1,
      winback: 1,
    });
  });

  it("the workflow schedules are the tick plus one entry per daily hour", () => {
    expect([...productionWorkflowSchedules()].sort()).toEqual(
      ["*/15 * * * *", "0 19 * * *", "0 20 * * *", "0 22 * * *", "0 23 * * *"].sort(),
    );
  });
});

function recorder() {
  return { log: vi.fn(), error: vi.fn() };
}

function allOutput(write: ReturnType<typeof recorder>): string {
  return [...write.log.mock.calls, ...write.error.mock.calls]
    .map((args) => args.join(" "))
    .join("\n");
}

function okResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  };
}

describe("triggerProductionCrons", () => {
  const TICK_2200 = at("2026-09-22T22:00:00Z");

  it("fails closed without CRON_SECRET, even on a dry run", async () => {
    for (const env of [{}, { CRON_SECRET: "" }, { CRON_SECRET: "", DRY_RUN: "true" }]) {
      const write = recorder();
      const fetchImpl = vi.fn();
      const code = await triggerProductionCrons({ env, now: TICK_2200, fetchImpl, write });
      expect(code).toBe(1);
      expect(fetchImpl).not.toHaveBeenCalled();
      expect(allOutput(write)).toMatch(/CRON_SECRET missing/);
    }
  });

  it("GETs each due route on restoreassist.app with the bearer secret", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse({ status: "completed", itemsProcessed: 2 }));
    const code = await triggerProductionCrons({
      env: { CRON_SECRET: "s3cret", CRON_EVENT_SCHEDULE: PRODUCTION_TICK_SCHEDULE },
      now: TICK_2200,
      fetchImpl,
      write: recorder(),
    });

    expect(code).toBe(0);
    const urls = fetchImpl.mock.calls.map(([url]) => url as string).sort();
    expect(urls).toEqual(
      [...EVERY_TICK, "retry-failed-webhooks", "sync-invoices"]
        .sort()
        .map((p) => `${PRODUCTION_ORIGIN}/api/cron/${p}`),
    );
    for (const [url, init] of fetchImpl.mock.calls as Array<[string, RequestInit]>) {
      expect(new URL(url).origin).toBe("https://restoreassist.app");
      expect(init.method).toBe("GET");
      expect(init.headers).toEqual({ Authorization: "Bearer s3cret" });
      expect(init.signal).toBeDefined();
    }
  });

  it("waits longer than the slowest enabled route may run (sync-invoices, 300 s)", () => {
    expect(REQUEST_TIMEOUT_MS).toBeGreaterThan(300_000);
  });

  it("a failing job fails the run, but every other due job still runs", async () => {
    const fetchImpl = vi.fn(async (url: string) =>
      url.endsWith("/storage-mirror")
        ? okResponse({ error: "Internal server error" }, 500)
        : okResponse({ status: "completed" }),
    );
    const write = recorder();
    const code = await triggerProductionCrons({
      env: { CRON_SECRET: "s3cret", CRON_EVENT_SCHEDULE: PRODUCTION_TICK_SCHEDULE },
      now: TICK_2200,
      fetchImpl,
      write,
    });
    expect(code).toBe(1);
    expect(fetchImpl).toHaveBeenCalledTimes(5);
    expect(allOutput(write)).toMatch(/storage-mirror.*HTTP 500/);
  });

  it("a network error fails the run and the remaining jobs still run", async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error("aborted"))
      .mockResolvedValue(okResponse({ status: "completed" }));
    const code = await triggerProductionCrons({
      env: { CRON_SECRET: "s3cret", CRON_EVENT_SCHEDULE: "" },
      now: at("2026-09-22T22:15:00Z"),
      fetchImpl,
      write: recorder(),
    });
    expect(code).toBe(1);
    expect(fetchImpl).toHaveBeenCalledTimes(EVERY_TICK.length);
  });

  it("an unknown schedule fails the run and calls nothing", async () => {
    const fetchImpl = vi.fn();
    const code = await triggerProductionCrons({
      env: { CRON_SECRET: "s3cret", CRON_EVENT_SCHEDULE: "5 4 * * *" },
      now: TICK_2200,
      fetchImpl,
      write: recorder(),
    });
    expect(code).toBe(1);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("a dry run lists the due jobs and calls nothing", async () => {
    const fetchImpl = vi.fn();
    const write = recorder();
    const code = await triggerProductionCrons({
      env: { CRON_SECRET: "s3cret", DRY_RUN: "true", CRON_EVENT_SCHEDULE: "0 22 * * *" },
      now: at("2026-09-22T22:02:00Z"),
      fetchImpl,
      write,
    });
    expect(code).toBe(0);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(allOutput(write)).toContain(`${PRODUCTION_ORIGIN}/api/cron/trial-reminders`);
  });

  it("a probe only calls the routes that honour ?dryRun=1", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse({ status: "dry-run" }));
    const code = await triggerProductionCrons({
      env: { CRON_SECRET: "s3cret", DRY_RUN: "true", PROBE_PRODUCTION: "true" },
      now: TICK_2200,
      fetchImpl,
      write: recorder(),
    });
    expect(code).toBe(0);
    const probed = PRODUCTION_ENABLED.filter((c) => c.supportsDryRun).map(
      (c) => `${PRODUCTION_ORIGIN}/api/cron/${c.path}?dryRun=1`,
    );
    expect(probed).toEqual([`${PRODUCTION_ORIGIN}/api/cron/trial-reminders?dryRun=1`]);
    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual(probed);
  });

  it("never prints the secret or a success body (the repo and its logs are public)", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(okResponse({ status: "completed", itemsProcessed: 3, metadata: { email: "owner@realco.com.au" } }));
    const write = recorder();
    await triggerProductionCrons({
      env: { CRON_SECRET: "s3cret-value", CRON_EVENT_SCHEDULE: PRODUCTION_TICK_SCHEDULE },
      now: TICK_2200,
      fetchImpl,
      write,
    });
    const out = allOutput(write);
    expect(out).not.toContain("s3cret-value");
    expect(out).not.toContain("owner@realco.com.au");
    expect(out).toMatch(/HTTP 200/);
  });
});

describe("cron-production.yml contract", () => {
  it("rejects non-main refs and defaults manual dispatch to a dry run", () => {
    const parsed = workflow();
    expect(parsed.jobs["reject-non-main"].if).toBe("github.ref != 'refs/heads/main'");
    expect(parsed.jobs.trigger.if).toBe("github.ref == 'refs/heads/main'");
    expect(parsed.on.workflow_dispatch.inputs.dry_run.default).toBe(true);
    expect(parsed.on.workflow_dispatch.inputs.probe_production.default).toBe(false);
    const env = parsed.jobs.trigger.steps?.find((s) => s.env?.DRY_RUN)?.env ?? {};
    expect(env.DRY_RUN).toContain("github.event.inputs.dry_run");
    // The `inputs` context is undefined on schedule events and fails the run.
    expect(env.DRY_RUN).not.toMatch(/(?<![.\w])inputs\.dry_run/);
  });

  it("does not use the production environment (reviewers would block the schedule)", () => {
    for (const job of Object.values(workflow().jobs)) {
      expect(job.environment).toBeUndefined();
    }
  });

  it("runs the trigger on the repo's pinned Node, which can read the TypeScript manifest", () => {
    const steps = workflow().jobs.trigger.steps ?? [];
    const setupNode = steps.find((s) => (s.uses ?? "").startsWith("actions/setup-node@"));
    expect(setupNode?.uses).toBe(
      "actions/setup-node@820762786026740c76f36085b0efc47a31fe5020",
    );
    expect(setupNode?.with?.["node-version-file"]).toBe(".nvmrc");
    expect(readFileSync(join(ROOT, ".nvmrc"), "utf8").trim()).toMatch(/^22\./);
    const script = readFileSync(join(ROOT, "scripts", "ci", "trigger-production-crons.mjs"), "utf8");
    expect(script).toContain("lib/cron/production-schedule.ts");
  });

  it("daily and tick runs cannot cancel each other in the concurrency queue", () => {
    const { concurrency } = workflow();
    expect(concurrency.group).toContain("github.event.schedule");
    expect(concurrency["cancel-in-progress"]).toBe(false);
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
