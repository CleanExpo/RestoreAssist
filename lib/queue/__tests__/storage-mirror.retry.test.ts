/**
 * RA-8451 — a DEAD_LETTER mirror job must be retryable, and the queue
 * stats must count dead-lettered jobs.
 *
 * Prisma is replaced by a small in-memory table whose updateMany/count
 * honour the `where` clause (plain status or `{ in: [...] }`), so the
 * tests check the effect on the row, not the shape of the query.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

type Row = {
  id: string;
  orgId: string;
  status: string;
  attempts: number;
  lastError: string | null;
  nextAttemptAt: Date;
  completedAt: Date | null;
};

const { rows } = vi.hoisted(() => ({ rows: [] as Row[] }));

function matches(row: Row, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, cond]) => {
    const value = (row as Record<string, unknown>)[key];
    if (cond && typeof cond === "object" && "in" in cond) {
      return (cond as { in: unknown[] }).in.includes(value);
    }
    return value === cond;
  });
}

vi.mock("@/lib/prisma", () => ({
  prisma: {
    storageMirrorJob: {
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: Record<string, unknown>;
          data: Partial<Row>;
        }) => {
          const hit = rows.filter((r) => matches(r, where));
          hit.forEach((r) => Object.assign(r, data));
          return { count: hit.length };
        },
      ),
      count: vi.fn(
        async ({ where }: { where: Record<string, unknown> }) =>
          rows.filter((r) => matches(r, where)).length,
      ),
      findFirst: vi.fn(async () => null),
    },
  },
}));

import { MirrorJobStatus } from "@prisma/client";
import { retryJob, getMirrorQueueStats } from "@/lib/queue/storage-mirror";

function row(id: string, status: string, attempts = 5): Row {
  return {
    id,
    orgId: "org_1",
    status,
    attempts,
    lastError: "boom",
    nextAttemptAt: new Date(0),
    completedAt: null,
  };
}

beforeEach(() => {
  rows.length = 0;
});

describe("retryJob", () => {
  it("resets a DEAD_LETTER job to PENDING with attempts 0", async () => {
    rows.push(row("dead_1", MirrorJobStatus.DEAD_LETTER));
    await expect(retryJob("dead_1")).resolves.toBe(true);
    expect(rows[0].status).toBe(MirrorJobStatus.PENDING);
    expect(rows[0].attempts).toBe(0);
    expect(rows[0].lastError).toBeNull();
  });

  it("still resets a FAILED job", async () => {
    rows.push(row("failed_1", MirrorJobStatus.FAILED));
    await expect(retryJob("failed_1")).resolves.toBe(true);
    expect(rows[0].status).toBe(MirrorJobStatus.PENDING);
  });

  it("does nothing to a COMPLETED or PROCESSING job", async () => {
    rows.push(row("done_1", MirrorJobStatus.COMPLETED, 1));
    rows.push(row("busy_1", MirrorJobStatus.PROCESSING, 1));
    await expect(retryJob("done_1")).resolves.toBe(false);
    await expect(retryJob("busy_1")).resolves.toBe(false);
    expect(rows.map((r) => r.status)).toEqual([
      MirrorJobStatus.COMPLETED,
      MirrorJobStatus.PROCESSING,
    ]);
  });
});

describe("getMirrorQueueStats", () => {
  it("reports dead-lettered jobs instead of hiding them", async () => {
    rows.push(row("dead_1", MirrorJobStatus.DEAD_LETTER));
    rows.push(row("dead_2", MirrorJobStatus.DEAD_LETTER));
    rows.push(row("failed_1", MirrorJobStatus.FAILED));
    const stats = await getMirrorQueueStats("org_1");
    expect(stats.total).toBe(3);
    expect(stats.failed).toBe(1);
    expect(stats.deadLettered).toBe(2);
  });
});
