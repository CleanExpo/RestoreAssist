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
