/**
 * RA-8453: each cron set that must be visited in full is read past 1000 rows.
 *
 * The fake findMany honours `where.id.gt`, `orderBy` and `take` the way
 * Postgres would. Against the old reads (`take: 1000`, no orderBy, no paging)
 * every test here fails: the 1001st row is never handed to the cron's work.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  userFindMany: vi.fn(),
  userCount: vi.fn(),
  userUpdate: vi.fn(),
  entitlementFindMany: vi.fn(),
  inspectionFindMany: vi.fn(),
  organizationFindMany: vi.fn(),
  empty: vi.fn(async () => []),
}));
const stripeMock = vi.hoisted(() => ({
  subscriptions: { retrieve: vi.fn(), list: vi.fn() },
}));
const deliverEmailOnce = vi.hoisted(() => vi.fn(async () => ({})));
const dispatchPulseNotification = vi.hoisted(() =>
  vi.fn(async () => ({ status: "SKIPPED" })),
);

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findMany: db.userFindMany,
      count: db.userCount,
      update: db.userUpdate,
    },
    featureEntitlement: { findMany: db.entitlementFindMany },
    inspection: { findMany: db.inspectionFindMany },
    organization: { findMany: db.organizationFindMany },
    dryingGoalRecord: { findMany: db.empty },
    inspectionWorkflow: { findMany: db.empty },
    reportApproval: { findMany: db.empty },
    clientCommsLog: { groupBy: db.empty, count: vi.fn(async () => 0) },
  },
}));
vi.mock("@/lib/stripe", () => ({ stripe: stripeMock }));
vi.mock("@/app/api/webhooks/stripe/route", () => ({
  downgradeUserToCanceled: vi.fn(),
}));
vi.mock("@/lib/email", () => ({
  sendPricingSetupReminderEmail: vi.fn(),
  sendTrialExpiringEmail: vi.fn(),
  sendWinbackEmail: vi.fn(),
}));
vi.mock("@/lib/email-delivery-ledger", () => ({ deliverEmailOnce }));
vi.mock("@/lib/pricing/effective-pricing", () => ({
  isPricingConfigured: vi.fn(async () => false),
}));
vi.mock("@/lib/pulse/dispatcher", () => ({ dispatchPulseNotification }));

import { reconcileStripe } from "../reconcile-stripe";
import { runPulseDigest } from "../pulse-digest";
import { sendPricingSetupReminders } from "../pricing-setup-reminders";
import { sendTrialReminders } from "../trial-reminders";
import { sendWinback } from "../winback";

const ROWS = 1001;
const key = (i: number) => String(i).padStart(5, "0");
const LAST = key(ROWS - 1);

type PageArgs = {
  where?: { id?: { gt?: string } };
  orderBy?: unknown;
  take?: number;
};

/** A findMany over `rows` that behaves like Postgres for these arguments. */
function table<T extends { id: string }>(rows: T[]) {
  // An unordered read returns rows in storage order, with the row under test
  // stored last, so a capped read without paging never reaches it.
  const heap = [...rows];
  const sorted = [...rows].sort((a, b) => (a.id < b.id ? -1 : 1));
  return async (args: PageArgs = {}) => {
    const ordered = args.orderBy ? sorted : heap;
    const gt = args.where?.id?.gt;
    const after = gt ? ordered.filter((r) => r.id > gt) : ordered;
    return after.slice(0, args.take ?? after.length);
  };
}

const many = <T>(make: (k: string) => T) =>
  Array.from({ length: ROWS }, (_, i) => make(key(i)));

beforeEach(() => {
  vi.clearAllMocks();
  db.userFindMany.mockImplementation(table([]));
  db.entitlementFindMany.mockImplementation(table([]));
  db.inspectionFindMany.mockImplementation(table([]));
  db.organizationFindMany.mockImplementation(table([]));
  db.userCount.mockResolvedValue(0);
  db.userUpdate.mockResolvedValue({});
  stripeMock.subscriptions.retrieve.mockResolvedValue({
    status: "active",
    items: { data: [{ quantity: 1 }] },
  });
  stripeMock.subscriptions.list.mockResolvedValue({ data: [] });
});

describe("reconcile-stripe reads every row", () => {
  it("checks the 1001st ACTIVE subscriber against Stripe", async () => {
    db.userFindMany.mockImplementation(
      async (
        args: PageArgs & {
          where: Record<string, unknown>;
        },
      ) =>
        "subscriptionId" in args.where
          ? table(many((k) => ({ id: `u${k}`, subscriptionId: `sub_${k}` })))(
              args,
            )
          : [],
    );
    const result = await reconcileStripe();
    expect(stripeMock.subscriptions.retrieve).toHaveBeenCalledWith(
      `sub_${LAST}`,
    );
    expect(result.metadata).toMatchObject({
      candidates: ROWS,
      truncated: false,
    });
  });

  it("checks the 1001st seat entitlement against Stripe", async () => {
    db.entitlementFindMany.mockImplementation(
      table(
        many((k) => ({
          id: `e${k}`,
          seats: 1,
          stripeSubscriptionId: `seat_${k}`,
        })),
      ),
    );
    await reconcileStripe();
    expect(stripeMock.subscriptions.retrieve).toHaveBeenCalledWith(
      `seat_${LAST}`,
    );
  });

  it("lists subscriptions for the 1001st seat customer", async () => {
    db.userFindMany.mockImplementation(
      async (
        args: PageArgs & {
          where: Record<string, unknown>;
        },
      ) =>
        "stripeCustomerId" in args.where
          ? table(many((k) => ({ id: `c${k}`, stripeCustomerId: `cus_${k}` })))(
              args,
            )
          : [],
    );
    await reconcileStripe();
    expect(stripeMock.subscriptions.list).toHaveBeenCalledWith(
      expect.objectContaining({ customer: `cus_${LAST}` }),
    );
  });
});

describe("pulse-digest reads every active job", () => {
  it("sends the Code of Practice update to the 1001st job", async () => {
    db.inspectionFindMany.mockImplementation(
      table(
        many((k) => ({
          id: `i${k}`,
          status: "SCOPED",
          createdAt: new Date("2020-01-01T00:00:00Z"),
          report: null,
          affectedAreas: [],
          moistureReadings: [],
        })),
      ),
    );
    const result = await runPulseDigest();
    expect(dispatchPulseNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        inspectionId: `i${LAST}`,
        event: expect.objectContaining({ type: "COP_UPDATE" }),
      }),
    );
    expect(result.metadata).toMatchObject({
      jobsConsidered: ROWS,
      truncated: false,
    });
  });
});

describe("email crons read every candidate", () => {
  it("pricing-setup-reminders reaches the 1001st organisation", async () => {
    vi.stubEnv("PRICING_REMINDER_ENABLED", "true");
    db.organizationFindMany.mockImplementation(
      table(
        many((k) => ({
          id: `o${k}`,
          owner: {
            id: `own${k}`,
            email: `owner${k}@builder.com.au`,
            name: "Owner",
            subscriptionStatus: "ACTIVE",
            createdAt: new Date("2025-01-01T00:00:00Z"),
            trialEndsAt: null,
            pricingReminderSentAt: null,
          },
        })),
      ),
    );
    const result = await sendPricingSetupReminders();
    vi.unstubAllEnvs();
    expect(deliverEmailOnce).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: `pricing-setup:own${LAST}` }),
    );
    expect(result.metadata).toMatchObject({ orgs: ROWS, truncated: false });
  });

  it("trial-reminders reaches the 1001st TRIAL user", async () => {
    const ends = new Date(Date.now() + 12 * 60 * 60 * 1000);
    db.userFindMany.mockImplementation(
      table(
        many((k) => ({
          id: `t${k}`,
          email: `trial${k}@builder.com.au`,
          name: "Trial",
          trialEndsAt: ends,
          trialReminderSentAt: null,
        })),
      ),
    );
    await sendTrialReminders();
    expect(deliverEmailOnce).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: expect.stringContaining(`trial:t${LAST}:`),
      }),
    );
  });

  it("winback reaches the 1001st expired user", async () => {
    const ended = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    db.userFindMany.mockImplementation(
      table(
        many((k) => ({
          id: `w${k}`,
          email: `gone${k}@builder.com.au`,
          name: "Gone",
          subscriptionEndsAt: ended,
        })),
      ),
    );
    const result = await sendWinback();
    expect(deliverEmailOnce).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: expect.stringContaining(`winback:w${LAST}:`),
      }),
    );
    expect(result.metadata).toMatchObject({
      candidates: ROWS,
      truncated: false,
    });
  });
});
