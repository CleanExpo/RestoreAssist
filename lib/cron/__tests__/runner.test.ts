import { beforeEach, describe, expect, it, vi } from "vitest";

const cronJobRunFindFirst = vi.fn();
const cronJobRunCreate = vi.fn();
const cronJobRunUpdate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    cronJobRun: {
      findFirst: (...args: unknown[]) => cronJobRunFindFirst(...args),
      create: (...args: unknown[]) => cronJobRunCreate(...args),
      update: (...args: unknown[]) => cronJobRunUpdate(...args),
    },
  },
}));

import { runCronJob } from "../runner";

beforeEach(() => {
  cronJobRunFindFirst.mockReset();
  cronJobRunCreate.mockReset();
  cronJobRunUpdate.mockReset();

  cronJobRunFindFirst.mockResolvedValue(null);
  cronJobRunCreate.mockResolvedValue({ id: "run_1" });
  cronJobRunUpdate.mockResolvedValue({});
});

describe("runCronJob", () => {
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
