import { beforeEach, describe, expect, it, vi } from "vitest";

const userFindMany = vi.fn();
const sendWinbackEmail = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findMany: (...args: unknown[]) => userFindMany(...args) } },
}));
vi.mock("@/lib/email", () => ({
  sendWinbackEmail: (...args: unknown[]) => sendWinbackEmail(...args),
}));
vi.mock("@/lib/email-retry", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/email-retry")>();
  return {
    ...original,
    sendWithRetry: (send: () => Promise<unknown>) => send(),
  };
});

import { sendWinback } from "../winback";

describe("sendWinback delivery receipts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    userFindMany.mockResolvedValue([
      {
        id: "expired_1",
        email: "owner@realco.com",
        name: "Owner",
        subscriptionEndsAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      },
    ]);
  });

  it("does not count a null email result as sent", async () => {
    sendWinbackEmail.mockResolvedValueOnce(null);

    const result = await sendWinback();

    expect(result.itemsProcessed).toBe(0);
    expect(result.metadata).toMatchObject({ sent: 0, failed: 1 });
  });
});

describe("sendWinback backlog guard (RA-7645)", () => {
  // Production never ran this job. The first live run must only reach the
  // accounts that expired 30 days ago (a 24-hour window), never everyone who
  // has ever lapsed.
  it("only selects subscriptions that ended 30 days ago, give or take 12 hours", async () => {
    vi.clearAllMocks();
    userFindMany.mockReset();
    userFindMany.mockResolvedValue([]);
    const DAY = 24 * 60 * 60 * 1000;
    const before = Date.now();

    await sendWinback();

    const after = Date.now();
    expect(userFindMany).toHaveBeenCalledTimes(1);
    const [arg] = userFindMany.mock.calls[0] as [
      { where: { subscriptionStatus: string; subscriptionEndsAt: { gte: Date; lte: Date } } },
    ];
    expect(arg.where.subscriptionStatus).toBe("EXPIRED");
    expect(arg.where.subscriptionEndsAt.gte.getTime()).toBeGreaterThanOrEqual(
      before - 30 * DAY - 12 * 60 * 60 * 1000,
    );
    expect(arg.where.subscriptionEndsAt.lte.getTime()).toBeLessThanOrEqual(
      after - 30 * DAY + 12 * 60 * 60 * 1000,
    );
  });
});
