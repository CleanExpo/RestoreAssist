/**
 * RA-7774 — two overlapping invocations of one cron job must not both run the
 * handler. Runs against real Postgres (CI Unit Tests provisions it).
 *
 * The race is made deterministic with two holds, each capped at HOLD_MS:
 *
 * 1. Every read of CronJobRun waits, after it returns, for the other caller's
 *    read to return too. A check-then-create claim lets both callers read
 *    "nothing running" before either creates a row, so both run the handler.
 *    A claim serialised under a lock keeps the second caller from reading
 *    until the first has committed its running row; the first caller's hold
 *    times out, and the second caller then reads that row and skips.
 * 2. The handler waits until both reads have returned, so the first run is
 *    still "running" when the second caller reads. Without this, the second
 *    caller could legitimately start a fresh run after the first had finished.
 *
 * The hook sits on pg.Client#query, below Prisma, so it holds the read whether
 * runCronJob issues it inside a transaction or not.
 */

import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import pg from "pg";
import { prisma } from "@/lib/prisma";
import { runCronJob } from "../runner";

const HOLD_MS = 1_500;

type QueryFn = (...args: unknown[]) => unknown;

function isCronJobRunRead(args: unknown[]): boolean {
  const first = args[0];
  const text =
    typeof first === "string"
      ? first
      : (first as { text?: unknown } | null)?.text;
  return (
    typeof text === "string" &&
    /^\s*SELECT\b/i.test(text) &&
    text.includes('"CronJobRun"')
  );
}

describe.skipIf(!process.env.DATABASE_URL)(
  "runCronJob claim under concurrency (RA-7774)",
  () => {
    const jobName = `ra7774-claim-${Date.now()}`;
    const originalQuery = pg.Client.prototype.query as unknown as QueryFn;
    let readsReturned = 0;
    let waiters: Array<() => void> = [];

    /** Resolves once `readsReturned >= 2`, or after HOLD_MS. */
    const bothReadsReturned = (): Promise<void> =>
      new Promise((resolve) => {
        if (readsReturned >= 2) return resolve();
        waiters.push(resolve);
        setTimeout(resolve, HOLD_MS);
      });

    beforeEach(() => {
      readsReturned = 0;
      waiters = [];

      (pg.Client.prototype as unknown as { query: QueryFn }).query = function (
        this: unknown,
        ...args: unknown[]
      ) {
        if (!isCronJobRunRead(args)) return originalQuery.apply(this, args);
        const callback =
          typeof args[args.length - 1] === "function"
            ? (args.pop() as (err: unknown, res?: unknown) => void)
            : undefined;
        const held = (originalQuery.apply(this, args) as Promise<unknown>).then(
          async (res) => {
            readsReturned += 1;
            if (readsReturned >= 2) waiters.splice(0).forEach((go) => go());
            await bothReadsReturned();
            return res;
          },
        );
        if (callback) {
          held.then(
            (res) => callback(null, res),
            (err) => callback(err),
          );
          return undefined;
        }
        return held;
      };
    });

    afterEach(() => {
      (pg.Client.prototype as unknown as { query: QueryFn }).query =
        originalQuery;
    });

    afterAll(async () => {
      await prisma.cronJobRun.deleteMany({ where: { jobName } });
    });

    it("runs the handler exactly once when two invocations start together", async () => {
      let handlerRuns = 0;
      const handler = async () => {
        handlerRuns += 1;
        await bothReadsReturned();
        return { itemsProcessed: 1 };
      };

      const results = await Promise.all([
        runCronJob(jobName, handler),
        runCronJob(jobName, handler),
      ]);

      // Both callers read CronJobRun through the hook: the holds were live.
      expect(readsReturned).toBe(2);
      expect(handlerRuns).toBe(1);
      expect(results.map((r) => r.status).sort()).toEqual([
        "completed",
        "skipped",
      ]);
      expect(await prisma.cronJobRun.count({ where: { jobName } })).toBe(1);
    });
  },
);
