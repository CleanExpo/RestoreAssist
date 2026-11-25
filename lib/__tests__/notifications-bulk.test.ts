import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCreateMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    notification: { createMany: (...a: unknown[]) => mockCreateMany(...a) },
  },
}));

import {
  createNotificationForUsers,
  tryCreateNotificationForUsers,
} from "../notifications";

const NOTICE = { title: "T", message: "M", type: "INFO" as const };

describe("bulk notifications (RA-8516)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("tryCreateNotificationForUsers reports how many were written", async () => {
    mockCreateMany.mockResolvedValue({ count: 2 });
    await expect(tryCreateNotificationForUsers(["a", "b"], NOTICE)).resolves.toEqual({
      ok: true,
      written: 2,
    });
  });

  it("tryCreateNotificationForUsers reports a failure instead of throwing", async () => {
    const error = new Error("db down");
    mockCreateMany.mockRejectedValue(error);
    await expect(tryCreateNotificationForUsers(["a"], NOTICE)).resolves.toEqual({
      ok: false,
      error,
    });
  });

  it("createNotificationForUsers still swallows and logs, unchanged for its callers", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockCreateMany.mockRejectedValue(new Error("db down"));
    await expect(createNotificationForUsers(["a"], NOTICE)).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalledWith(
      "[Notifications] Failed to create bulk notifications:",
      expect.any(Error),
    );
    spy.mockRestore();
  });
});
