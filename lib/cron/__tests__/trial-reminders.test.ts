import { beforeEach, describe, expect, it, vi } from "vitest";

const userFindMany = vi.fn();
const userUpdate = vi.fn();
const sendTrialExpiringEmail = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findMany: (...args: unknown[]) => userFindMany(...args),
      update: (...args: unknown[]) => userUpdate(...args),
    },
  },
}));
vi.mock("@/lib/email", () => ({
  sendTrialExpiringEmail: (...args: unknown[]) =>
    sendTrialExpiringEmail(...args),
}));
vi.mock("@/lib/email-retry", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/email-retry")>();
  return {
    ...original,
    sendWithRetry: (send: () => Promise<unknown>) => send(),
  };
});

const deliverEmailOnce = vi.fn();
vi.mock("@/lib/email-delivery-ledger", () => ({
  deliverEmailOnce: (...args: unknown[]) => deliverEmailOnce(...args),
}));

import { sendTrialReminders } from "../trial-reminders";

describe("sendTrialReminders delivery receipts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const expiry = new Date(Date.now() + 12 * 60 * 60 * 1000);
    userFindMany
      .mockResolvedValueOnce([
        {
          id: "trial_1",
          email: "owner@realco.com",
          name: "Owner",
          trialEndsAt: expiry,
          trialReminderSentAt: null,
        },
      ])
      .mockResolvedValueOnce([]);
  });

  it("does not count or stamp a null email result", async () => {
    deliverEmailOnce.mockRejectedValueOnce(new Error("no receipt"));
    sendTrialExpiringEmail.mockResolvedValueOnce(null);

    const result = await sendTrialReminders();

    expect(result.itemsProcessed).toBe(0);
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it("dry-run counts candidates without sending or stamping", async () => {
    const result = await sendTrialReminders({ dryRun: true });

    expect(result.itemsProcessed).toBe(0);
    expect(result.metadata).toMatchObject({
      dryRun: true,
      windows: { "3-day": 1 },
    });
    expect(deliverEmailOnce).not.toHaveBeenCalled();
    expect(sendTrialExpiringEmail).not.toHaveBeenCalled();
    expect(userUpdate).not.toHaveBeenCalled();
  });
});
