import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => {
  const tx = {
    organization: { findMany: vi.fn() },
    user: { update: vi.fn() },
  };
  return { prisma: tx };
});

vi.mock("@/lib/email", () => ({
  sendPricingSetupReminderEmail: vi.fn().mockResolvedValue({ data: { id: "e1" } }),
}));

// Pass the thunk straight through so the retry wrapper doesn't obscure calls.
vi.mock("@/lib/email-retry", () => ({
  sendWithRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

vi.mock("@/lib/pricing/effective-pricing", () => ({
  isPricingConfigured: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { sendPricingSetupReminderEmail } from "@/lib/email";
import { isPricingConfigured } from "@/lib/pricing/effective-pricing";
import {
  sendPricingSetupReminders,
  isRealContactEmail,
} from "../pricing-setup-reminders";

const org = prisma as unknown as {
  organization: { findMany: ReturnType<typeof vi.fn> };
  user: { update: ReturnType<typeof vi.fn> };
};
const sendEmail = sendPricingSetupReminderEmail as unknown as ReturnType<
  typeof vi.fn
>;
const configured = isPricingConfigured as unknown as ReturnType<typeof vi.fn>;

/** An owner old enough to be past the grace window. */
const OLD = new Date("2026-01-01T00:00:00.000Z");

function ownerOrg(overrides: Record<string, unknown> = {}) {
  return {
    id: "org_1",
    owner: {
      id: "owner_1",
      email: "ryan@realco.com.au",
      name: "Ryan",
      subscriptionStatus: "TRIAL",
      createdAt: OLD,
      pricingReminderSentAt: null,
      ...overrides,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  org.user.update.mockResolvedValue({});
  configured.mockResolvedValue(false); // unconfigured by default
  process.env.PRICING_REMINDER_ENABLED = "true";
  process.env.RESEND_API_KEY = "re_test";
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.PRICING_REMINDER_ENABLED;
});

describe("isRealContactEmail", () => {
  it("accepts a genuine external address", () => {
    expect(isRealContactEmail("ryan.morey@outlook.com.au")).toBe(true);
  });
  it.each([
    [null],
    [undefined],
    ["no-at-sign"],
    ["someone@example.com"],
    ["e2e-user@foo.com"],
    ["qa+test@foo.com"],
    ["demo@restoreassist.app"], // internal demo
    ["reviewer@restoreassist.app"], // apple reviewer
    ["load-test@foo.com"],
  ])("rejects %s", (email) => {
    expect(isRealContactEmail(email as string | null | undefined)).toBe(false);
  });
});

describe("sendPricingSetupReminders", () => {
  it("does nothing (no query, no send) when the flag is off — dark by default", async () => {
    process.env.PRICING_REMINDER_ENABLED = "false";
    const res = await sendPricingSetupReminders();
    expect(org.organization.findMany).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
    expect(res.itemsProcessed).toBe(0);
    expect(res.metadata).toMatchObject({ skipped: "disabled" });
  });

  it("emails an engaged, unconfigured, real-email owner exactly once and records the send", async () => {
    org.organization.findMany.mockResolvedValueOnce([ownerOrg()]);
    const res = await sendPricingSetupReminders();

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ recipientEmail: "ryan@realco.com.au" }),
    );
    // idempotency stamp written so a re-run won't re-send
    expect(org.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "owner_1" },
        data: expect.objectContaining({ pricingReminderSentAt: expect.any(Date) }),
      }),
    );
    expect(res.itemsProcessed).toBe(1);
  });

  it("skips an owner who already has pricing configured (org-first SSOT)", async () => {
    configured.mockResolvedValueOnce(true);
    org.organization.findMany.mockResolvedValueOnce([ownerOrg()]);
    const res = await sendPricingSetupReminders();
    expect(sendEmail).not.toHaveBeenCalled();
    expect(res.metadata).toMatchObject({ skippedConfigured: 1 });
  });

  it("skips an owner already nudged (pricingReminderSentAt set)", async () => {
    org.organization.findMany.mockResolvedValueOnce([
      ownerOrg({ pricingReminderSentAt: OLD }),
    ]);
    await sendPricingSetupReminders();
    expect(configured).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("skips a test/seed-email owner without a pricing lookup or send", async () => {
    org.organization.findMany.mockResolvedValueOnce([
      ownerOrg({ email: "qa+seed@example.com" }),
    ]);
    await sendPricingSetupReminders();
    expect(configured).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("skips an EXPIRED owner (not an engaged status)", async () => {
    org.organization.findMany.mockResolvedValueOnce([
      ownerOrg({ subscriptionStatus: "EXPIRED" }),
    ]);
    await sendPricingSetupReminders();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("skips a brand-new owner still inside the grace window", async () => {
    org.organization.findMany.mockResolvedValueOnce([
      ownerOrg({ createdAt: new Date() }),
    ]);
    await sendPricingSetupReminders();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("does not stamp the owner when the send throws (so the next run retries)", async () => {
    sendEmail.mockRejectedValueOnce(new Error("resend 500"));
    org.organization.findMany.mockResolvedValueOnce([ownerOrg()]);
    const res = await sendPricingSetupReminders();
    expect(org.user.update).not.toHaveBeenCalled();
    expect(res.itemsProcessed).toBe(0);
    expect(res.metadata).toMatchObject({ failed: 1 });
  });

  it("bounds the query with an explicit take (CLAUDE.md rule 4)", async () => {
    org.organization.findMany.mockResolvedValueOnce([]);
    await sendPricingSetupReminders();
    const arg = org.organization.findMany.mock.calls[0][0];
    expect(typeof arg.take).toBe("number");
    expect(arg.take).toBeGreaterThan(0);
  });
});
