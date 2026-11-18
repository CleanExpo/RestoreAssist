import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * RA-8452: when a headshot delete fails five times the ledger row goes to
 * FAILED and is never selected again. That terminal failure must raise an
 * error report through runCronJob on the run that makes it terminal, and the
 * count must appear on the run record and the route response — not only in
 * the database row.
 */

type Row = {
  id: string;
  publicId: string;
  status: string;
  attemptCount: number;
  lastError: string | null;
  createdAt: Date;
};

const rows: Row[] = [];
const cronJobRunUpdate = vi.fn();
const deleteImage = vi.fn();
const reportError = vi.fn();

const ledger = {
  findMany: vi.fn(async ({ where }: { where: { status: string; attemptCount: { lt: number } } }) =>
    rows.filter((r) => r.status === where.status && r.attemptCount < where.attemptCount.lt),
  ),
  update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
    const row = rows.find((r) => r.id === where.id)!;
    const { attemptCount, ...rest } = data;
    Object.assign(row, rest);
    if (typeof attemptCount === "number") row.attemptCount = attemptCount;
    else if (attemptCount && typeof attemptCount === "object") row.attemptCount += 1;
    return row;
  }),
};

const tx = {
  $executeRaw: vi.fn(async () => 0),
  cronJobRun: {
    findFirst: vi.fn(async () => null),
    create: vi.fn(async () => ({ id: "run_1" })),
  },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: (claim: (t: typeof tx) => unknown) => claim(tx),
    // tx is read lazily at call time, after module init.
    cronJobRun: { update: (...args: unknown[]) => cronJobRunUpdate(...args) },
    mediaCleanupTask: {
      findMany: (...a: unknown[]) => (ledger.findMany as (...x: unknown[]) => unknown)(...a),
      update: (...a: unknown[]) => (ledger.update as (...x: unknown[]) => unknown)(...a),
    },
  },
}));
vi.mock("@/lib/cloudinary", () => ({ deleteImage: (...a: unknown[]) => deleteImage(...a) }));
vi.mock("@/lib/observability", () => ({ reportError: (...a: unknown[]) => reportError(...a) }));

import { runCronJob } from "../runner";
import { retryMediaCleanupTasks } from "../media-cleanup";

beforeEach(() => {
  rows.length = 0;
  rows.push({
    id: "task_1",
    publicId: "headshots/losing-upload",
    status: "PENDING",
    attemptCount: 0,
    lastError: null,
    createdAt: new Date(),
  });
  cronJobRunUpdate.mockReset().mockResolvedValue({});
  deleteImage.mockReset().mockRejectedValue(new Error("cloudinary 503"));
  reportError.mockReset();
});

describe("media-cleanup terminal failures (RA-8452)", () => {
  it("raises exactly one error report, on the fifth failed delete", async () => {
    for (let run = 1; run <= 4; run++) {
      const result = await runCronJob("media-cleanup", retryMediaCleanupTasks);
      expect(result.terminalFailures ?? 0).toBe(0);
    }
    expect(reportError).not.toHaveBeenCalled();
    expect(rows[0].status).toBe("PENDING");

    const fifth = await runCronJob("media-cleanup", retryMediaCleanupTasks);

    expect(deleteImage).toHaveBeenCalledTimes(5);
    expect(rows[0].status).toBe("FAILED");
    expect(fifth.terminalFailures).toBe(1);
    expect(reportError).toHaveBeenCalledTimes(1);
    const [, context] = reportError.mock.calls[0];
    expect(context).toMatchObject({ route: "cron:media-cleanup", terminalFailures: 1 });

    // The count is on the run record, readable without querying the ledger.
    const lastUpdate = cronJobRunUpdate.mock.calls.at(-1)![0];
    expect(JSON.parse(lastUpdate.data.metadata)).toMatchObject({ terminalFailures: 1 });

    // A sixth run selects nothing and does not alert again.
    const sixth = await runCronJob("media-cleanup", retryMediaCleanupTasks);
    expect(sixth.terminalFailures ?? 0).toBe(0);
    expect(reportError).toHaveBeenCalledTimes(1);
  });

  it("does not alert when a retry succeeds", async () => {
    deleteImage.mockReset().mockResolvedValue(undefined);
    const result = await runCronJob("media-cleanup", retryMediaCleanupTasks);
    expect(result.terminalFailures ?? 0).toBe(0);
    expect(reportError).not.toHaveBeenCalled();
    expect(rows[0].status).toBe("COMPLETE");
  });
});
