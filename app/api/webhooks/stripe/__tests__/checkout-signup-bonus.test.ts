/**
 * RA-6962 — the advertised +10 first-signup bonus is granted exactly once,
 * atomically, by the checkout.session.completed webhook.
 *
 * The grant is a single updateMany guarded on `signupBonusApplied: false`, so
 * a user who already claimed it (reactivation, or a re-delivered event) is a
 * no-op at the database level. The browser verify/check paths no longer grant
 * the bonus, so the webhook is the sole granter. Prisma, Stripe, email and the
 * subscription-event ledger are mocked (no live DB).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { PRICING_CONFIG } from "@/lib/pricing";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  },
}));
vi.mock("@/lib/stripe", () => ({
  stripe: { subscriptions: { retrieve: vi.fn() } },
}));
vi.mock("@/lib/billing/subscription-event", () => ({
  recordSubscriptionEvent: vi.fn(async () => ({ kind: "recorded" })),
}));
vi.mock("@/lib/email", () => ({
  sendSubscriptionActivatedEmail: vi.fn(async () => undefined),
}));
vi.mock("@/lib/prisma-assert", () => ({ warnIfZeroRows: vi.fn() }));

import { handleCheckoutCompleted } from "../route";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { recordSubscriptionEvent } from "@/lib/billing/subscription-event";

const userUpdateMany = (
  prisma as unknown as { user: { updateMany: ReturnType<typeof vi.fn> } }
).user.updateMany;
const userFindUnique = (
  prisma as unknown as { user: { findUnique: ReturnType<typeof vi.fn> } }
).user.findUnique;

function subEvent() {
  return {
    id: "evt_bonus_1",
    type: "checkout.session.completed",
    data: {
      object: {
        mode: "subscription",
        subscription: "sub_1",
        customer: "cus_1",
        metadata: { userId: "u1", tier: "STANDARD" },
        payment_status: "paid",
        amount_total: 9900,
        currency: "aud",
      },
    },
  };
}

describe("checkout.session.completed — signup bonus (RA-6962)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    userFindUnique.mockResolvedValue({
      id: "u1",
      name: "Owner",
      email: "owner@example.com",
    });
    userUpdateMany.mockResolvedValue({ count: 1 });
    vi.mocked(stripe.subscriptions.retrieve).mockResolvedValue({
      id: "sub_1",
      items: {
        data: [
          {
            current_period_end: 2_000_000_000,
            price: { recurring: { interval: "month" } },
          },
        ],
      },
    } as never);
    vi.mocked(recordSubscriptionEvent).mockResolvedValue({
      kind: "recorded",
    } as never);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("grants +10 reports atomically, guarded on signupBonusApplied:false", async () => {
    await handleCheckoutCompleted(subEvent() as never);

    expect(userUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "u1", signupBonusApplied: false },
        data: expect.objectContaining({
          addonReports: {
            increment: PRICING_CONFIG.pricing.monthly.signupBonus,
          },
          signupBonusApplied: true,
        }),
      }),
    );
  });

  it("does not grant when the event is a deduped replay", async () => {
    vi.mocked(recordSubscriptionEvent).mockResolvedValue({
      kind: "deduped",
    } as never);

    await handleCheckoutCompleted(subEvent() as never);

    // Deduped replay returns before any activation/bonus write.
    expect(userUpdateMany).not.toHaveBeenCalled();
  });
});
