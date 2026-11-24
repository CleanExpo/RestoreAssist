/**
 * RA-8596 — a cancel reason saved by the real cancel route is visible
 * through the real admin route.
 *
 * Both route handlers run unmodified. Prisma is replaced by one in-memory
 * table: the cancel route's `cancellationFeedback.create` appends to it and
 * the admin route's `findMany` / `groupBy` read the same array. Nothing
 * between the write and the read is stubbed. Stripe, CSRF, rate limiting,
 * idempotency and the billing-owner check are stubbed because they are
 * outside this path.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

type FeedbackRow = {
  id: string;
  userId: string;
  reason: string;
  comment: string | null;
  subscriptionPlan: string | null;
  tenureDays: number | null;
  createdAt: Date;
};

const db = vi.hoisted(() => ({
  users: new Map<string, Record<string, unknown>>(),
  feedback: [] as FeedbackRow[],
  seq: 0,
}));

const session = vi.hoisted(() => ({ current: null as unknown }));

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(async () => session.current),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/csrf", () => ({ validateCsrf: vi.fn(() => null) }));
vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: vi.fn(async () => null),
}));
vi.mock("@/lib/idempotency", () => ({
  withIdempotency: vi.fn(
    async (
      req: NextRequest,
      _scope: string,
      handler: (raw: string) => Promise<Response>,
    ) => handler(await req.text()),
  ),
}));
vi.mock("@/lib/billing/require-billing-owner", () => ({
  refuseNonOwner: vi.fn(async () => null),
}));
vi.mock("@/lib/stripe", () => ({
  stripe: {
    customers: { list: vi.fn() },
    subscriptions: {
      list: vi.fn(),
      update: vi.fn(async () => ({ id: "sub_1" })),
    },
  },
}));

function pick(record: Record<string, unknown>, select?: Record<string, boolean>) {
  if (!select) return { ...record };
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(select)) if (select[key]) out[key] = record[key];
  return out;
}

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(
        async (args: { where: { id: string }; select?: Record<string, boolean> }) => {
          const u = db.users.get(args.where.id);
          return u ? pick(u, args.select) : null;
        },
      ),
      update: vi.fn(
        async (args: { where: { id: string }; data: Record<string, unknown> }) => {
          const u = db.users.get(args.where.id)!;
          Object.assign(u, args.data);
          return u;
        },
      ),
    },
    cancellationFeedback: {
      create: vi.fn(async (args: { data: Omit<FeedbackRow, "id" | "createdAt"> }) => {
        db.seq += 1;
        const row: FeedbackRow = {
          ...args.data,
          id: `fb_${db.seq}`,
          createdAt: new Date(),
        };
        db.feedback.push(row);
        return row;
      }),
      findMany: vi.fn(
        async (args: { take: number; select?: Record<string, boolean> }) =>
          [...db.feedback]
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
            .slice(0, args.take)
            .map((r) => pick(r as unknown as Record<string, unknown>, args.select)),
      ),
      groupBy: vi.fn(async (args: { where: { createdAt: { gte: Date } } }) => {
        const counts = new Map<string, number>();
        for (const r of db.feedback) {
          if (r.createdAt >= args.where.createdAt.gte) {
            counts.set(r.reason, (counts.get(r.reason) ?? 0) + 1);
          }
        }
        return [...counts].map(([reason, n]) => ({
          reason,
          _count: { _all: n },
        }));
      }),
    },
  },
}));

import { POST as cancel } from "@/app/api/cancel-subscription/route";
import { GET as adminList } from "../route";

beforeEach(() => {
  db.users.clear();
  db.feedback.length = 0;
  db.seq = 0;
  process.env.PLATFORM_SUPPORT_USER_IDS = "staff-1";
  db.users.set("owner-1", {
    id: "owner-1",
    role: "ADMIN",
    organizationId: null,
    stripeCustomerId: "cus_1",
    subscriptionId: "sub_1",
    subscriptionPlan: "Monthly Plan",
    createdAt: new Date(Date.now() - 45 * 86_400_000),
  });
  db.users.set("staff-1", { id: "staff-1", role: "ADMIN", organizationId: null });
});

describe("cancel reason reaches the Business admin API", () => {
  it("the row written by the cancel route is returned by the admin route", async () => {
    session.current = { user: { id: "owner-1", email: "owner@example.com" } };
    const cancelRes = await cancel(
      new NextRequest("http://localhost/api/cancel-subscription", {
        method: "POST",
        body: JSON.stringify({
          reason: "missing_feature",
          comment: "Need Xero sync",
        }),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(cancelRes.status).toBe(200);

    session.current = { user: { id: "staff-1", role: "ADMIN" } };
    const adminRes = await adminList(
      new NextRequest("http://localhost/api/admin/cancellation-feedback"),
    );
    expect(adminRes.status).toBe(200);
    const body = await adminRes.json();

    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({
      reason: "missing_feature",
      comment: "Need Xero sync",
      subscriptionPlan: "Monthly Plan",
      tenureDays: 45,
    });
    expect(body.reasonCounts90d).toEqual({ missing_feature: 1 });

    // The cancelling owner is a firm ADMIN, not staff: refused.
    session.current = { user: { id: "owner-1", role: "ADMIN" } };
    const ownerRes = await adminList(
      new NextRequest("http://localhost/api/admin/cancellation-feedback"),
    );
    expect(ownerRes.status).toBe(403);
  });
});
