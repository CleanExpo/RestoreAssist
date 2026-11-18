import { beforeEach, describe, expect, it, vi } from "vitest";

const reportError = vi.hoisted(() => vi.fn());
vi.mock("@/lib/observability", () => ({ reportError }));

import { forEachPage, readAllPages, type CronPageArgs } from "../for-each-page";

const rows = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: String(i).padStart(6, "0") }));

function source(all: { id: string }[]) {
  const calls: CronPageArgs[] = [];
  const fetchPage = async (page: CronPageArgs) => {
    calls.push(page);
    const gt = page.where.id?.gt;
    return all.filter((r) => gt === undefined || r.id > gt).slice(0, page.take);
  };
  return { calls, fetchPage };
}

beforeEach(() => reportError.mockClear());

describe("forEachPage", () => {
  it("visits every row of a set larger than one page, in id order", async () => {
    const all = rows(1001);
    const { calls, fetchPage } = source(all);
    const seen: string[] = [];
    const result = await forEachPage(
      "t",
      fetchPage,
      (page) => {
        seen.push(...page.map((r) => r.id));
      },
      { pageSize: 300 },
    );
    expect(seen).toEqual(all.map((r) => r.id));
    expect(result).toEqual({ rowsRead: 1001, truncated: false });
    expect(calls.every((c) => c.orderBy.id === "asc")).toBe(true);
    expect(calls[1].where).toEqual({ id: { gt: all[299].id } });
    expect(reportError).not.toHaveBeenCalled();
  });

  it("stops after an exactly-full final page with one empty read", async () => {
    const { calls, fetchPage } = source(rows(600));
    const result = await readAllPages("t", fetchPage, { pageSize: 300 });
    expect(result.rows).toHaveLength(600);
    expect(result.truncated).toBe(false);
    expect(calls).toHaveLength(3);
  });

  it("reports and flags a run that reaches the ceiling", async () => {
    const { fetchPage } = source(rows(1001));
    const result = await readAllPages("pulse-digest:active-jobs", fetchPage, {
      pageSize: 300,
      maxRows: 1000,
    });
    expect(result.rows).toHaveLength(1000);
    expect(result.truncated).toBe(true);
    expect(reportError).toHaveBeenCalledTimes(1);
    expect(reportError.mock.calls[0][1]).toMatchObject({
      stage: "cron:pulse-digest:active-jobs",
      truncated: true,
      rowsRead: 1000,
    });
  });
});
