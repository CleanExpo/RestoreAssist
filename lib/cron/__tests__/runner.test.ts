import { beforeEach, describe, expect, it, vi } from "vitest";

const cronJobRunFindFirst = vi.fn();
const cronJobRunCreate = vi.fn();
const cronJobRunUpdate = vi.fn();
const lockExecuteRaw = vi.fn();
const transaction = vi.fn();

// RA-7774: the claim (check + create) runs inside prisma.$transaction on the
// transaction client `tx`; the finish/fail update after the handler uses prisma.
const tx = {
  $executeRaw: (...args: unknown[]) => lockExecuteRaw(...args),
  cronJobRun: {
    findFirst: (...args: unknown[]) => cronJobRunFindFirst(...args),
    create: (...args: unknown[]) => cronJobRunCreate(...args),
  },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: (...args: unknown[]) => transaction(...args),
    cronJobRun: {
      update: (...args: unknown[]) => cronJobRunUpdate(...args),
    },
  },
}));

import { runCronJob } from "../runner";

beforeEach(() => {
  cronJobRunFindFirst.mockReset();
  cronJobRunCreate.mockReset();
  cronJobRunUpdate.mockReset();
  lockExecuteRaw.mockReset();
  transaction.mockReset();

  transaction.mockImplementation((claim: (t: typeof tx) => unknown) =>
    claim(tx),
  );
  lockExecuteRaw.mockResolvedValue(0);
  cronJobRunFindFirst.mockResolvedValue(null);
  cronJobRunCreate.mockResolvedValue({ id: "run_1" });
  cronJobRunUpdate.mockResolvedValue({});
});

describe("runCronJob", () => {
  it("claims the run inside one transaction, taking the per-job advisory lock before the check", async () => {
    const order: string[] = [];
    transaction.mockImplementation(
      async (claim: (t: typeof tx) => unknown) => {
        const claimed = await claim(tx);
        order.push("commit");
        return claimed;
      },
    );
    lockExecuteRaw.mockImplementation(async () => {
      order.push("lock");
      return 0;
    });
    cronJobRunFindFirst.mockImplementation(async () => {
      order.push("check");
      return null;
    });
    cronJobRunCreate.mockImplementation(async () => {
      order.push("create");
      return { id: "run_1" };
    });
    const handler = vi.fn(async () => {
      order.push("handler");
      return { itemsProcessed: 0 };
    });

    await runCronJob("test-job", handler);

    expect(transaction).toHaveBeenCalledTimes(1);
    // The handler runs after the claim transaction has returned, not inside it.
    expect(order).toEqual(["lock", "check", "create", "commit", "handler"]);
    const [sqlParts, ...values] = lockExecuteRaw.mock.calls[0] as [
      TemplateStringsArray,
      ...unknown[],
    ];
    expect(sqlParts.join("?")).toContain("pg_advisory_xact_lock(hashtext(");
    // The job name is a bound parameter, never spliced into the SQL text.
    expect(values).toEqual(["test-job"]);
    expect(sqlParts.join("?")).not.toContain("test-job");
  });

  it("skips when a recent run is already in progress (overlap protection)", async () => {
    cronJobRunFindFirst.mockResolvedValueOnce({ id: "running_1" });
    const handler = vi.fn();

    const result = await runCronJob("test-job", handler);

    expect(result.status).toBe("skipped");
    expect(handler).not.toHaveBeenCalled();
    expect(cronJobRunCreate).not.toHaveBeenCalled();
  });

  it("returns status completed and records the run on success", async () => {
    const handler = vi.fn().mockResolvedValue({
      itemsProcessed: 3,
      metadata: { foo: "bar" },
    });

    const result = await runCronJob("test-job", handler);

    expect(result.status).toBe("completed");
    expect(result.itemsProcessed).toBe(3);
    expect(cronJobRunUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "run_1" },
        data: expect.objectContaining({ status: "completed" }),
      }),
    );
  });

  it("throws a sanitised error on failure — never a non-2xx-invisible resolved 'failed' result", async () => {
    const handler = vi
      .fn()
      .mockRejectedValue(new Error("supersecret connection string leaked"));

    await expect(runCronJob("test-job", handler)).rejects.toThrow();

    let thrown: unknown;
    try {
      await runCronJob("test-job", handler);
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(Error);
    // RA-6968: the raw error message must never surface on the thrown error
    // that propagates into the HTTP response — only the internal DB record
    // (asserted below) retains it.
    expect((thrown as Error).message).not.toContain("supersecret");
  });

  it("still records the real error message internally (DB audit trail) even though it throws", async () => {
    const handler = vi.fn().mockRejectedValue(new Error("boom: db timeout"));

    await expect(runCronJob("test-job", handler)).rejects.toThrow();

    expect(cronJobRunUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "run_1" },
        data: expect.objectContaining({
          status: "failed",
          errorMessage: "boom: db timeout",
        }),
      }),
    );
  });
});
