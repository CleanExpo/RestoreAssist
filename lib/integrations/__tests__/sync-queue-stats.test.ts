/**
 * RA-8423: GET /api/integrations/metrics returned `syncQueue: {}` because
 * getSyncQueueStats() was called without `await` (a Promise serialises to {}).
 * Awaiting it as it stood would have shown every logged-in user the job
 * counts of every tenant, so the stats are now scoped to the caller's own
 * invoices through one join on Invoice.userId.
 */
import { describe, expect, it, vi } from "vitest";

const queryRaw = vi.hoisted(() => vi.fn());
const count = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: { $queryRaw: queryRaw, invoiceSyncJob: { count } },
}));

import { getSyncQueueStats } from "../sync-queue";

function sqlText(call: unknown[]): string {
  const sql = call[0] as { strings?: readonly string[]; sql?: string };
  return (sql.strings ?? [sql.sql ?? ""]).join("?");
}

describe("getSyncQueueStats scoped to one user", () => {
  it("returns numeric counts for the caller's invoices only", async () => {
    queryRaw.mockResolvedValue([
      { status: "PENDING", count: 3 },
      { status: "FAILED", count: 1n },
    ]);

    const stats = await getSyncQueueStats("user-a");

    expect(stats).toEqual({
      total: 4,
      pending: 3,
      processing: 0,
      completed: 0,
      failed: 1,
    });
    expect(count).not.toHaveBeenCalled();
    expect(queryRaw).toHaveBeenCalledTimes(1);
    const call = queryRaw.mock.calls[0];
    expect(sqlText(call)).toMatch(/JOIN\s+"Invoice"/);
    expect(sqlText(call)).toMatch(/"userId"\s*=\s*\?/);
    expect((call[0] as { values: unknown[] }).values).toEqual(["user-a"]);
  });
});

describe("metrics route awaits the stats", () => {
  it("passes the session user and awaits the result", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(
      path.join(process.cwd(), "app/api/integrations/metrics/route.ts"),
      "utf8",
    );
    expect(src).toMatch(
      /=\s*await\s+getSyncQueueStats\(\s*session\.user\.id\s*\)/,
    );
  });
});
