/**
 * RA-6794 — Blocked / past-due customer visibility for ops.
 *
 * Read-only list of users whose subscription is in a non-paying state
 * (PAST_DUE, EXPIRED, CANCELED) so ops can see who has lost access and
 * follow up on dunning. Additive — no schema change.
 *
 * Admin-only, DB-revalidated role (verifyAdminFromDb), tenant-scoped to the
 * admin's organizationId like every other admin route. Bounded with an
 * explicit select + take (cap 100) to avoid full-table scans (F10).
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { verifyAdminFromDb } from "@/lib/admin-auth";
import { fromException } from "@/lib/api-errors";

// SubscriptionStatus values that mean the customer is blocked / not paying.
// Confirmed against prisma/schema.prisma enum SubscriptionStatus.
const BLOCKED_STATUSES = ["PAST_DUE", "EXPIRED", "CANCELED"] as const;

// GET — list blocked customers with last billing/charge info
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    // Re-validates role from DB to prevent stale JWT role from granting admin access
    const auth = await verifyAdminFromDb(session);
    if (auth.response) return auth.response;
    const { user: adminUser } = auth;

    const { searchParams } = new URL(request.url);

    // Optional single-status filter; otherwise show all blocked states.
    const statusParam = searchParams.get("status")?.toUpperCase() ?? "";
    const statusFilter = (
      BLOCKED_STATUSES as readonly string[]
    ).includes(statusParam)
      ? [statusParam as (typeof BLOCKED_STATUSES)[number]]
      : [...BLOCKED_STATUSES];

    // Scope to the admin's own organization — prevents cross-tenant enumeration
    const where = {
      organizationId: adminUser!.organizationId,
      subscriptionStatus: { in: statusFilter },
    };

    // Bound the result set (F10) — cap 100, default 50.
    const limit = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("limit") ?? "50")),
    );

    const [customers, total] = await Promise.all([
      prisma.user.findMany({
        where,
        take: limit,
        select: {
          id: true,
          name: true,
          email: true,
          subscriptionStatus: true,
          subscriptionPlan: true,
          lastBillingDate: true,
          nextBillingDate: true,
          subscriptionEndsAt: true,
          trialEndsAt: true,
        },
        // Most recently lapsed first; nulls sort last under Prisma default.
        orderBy: { subscriptionEndsAt: "desc" },
      }),
      prisma.user.count({ where }),
    ]);

    // Derive days-overdue server-side so the client renders a plain number.
    const now = Date.now();
    const rows = customers.map((c) => {
      // Overdue is measured from when access lapsed (subscriptionEndsAt),
      // falling back to last billing date if the end date is not recorded.
      const reference = c.subscriptionEndsAt ?? c.lastBillingDate;
      const daysOverdue = reference
        ? Math.max(
            0,
            Math.floor((now - new Date(reference).getTime()) / 86_400_000),
          )
        : null;
      return {
        id: c.id,
        name: c.name,
        email: c.email,
        subscriptionStatus: c.subscriptionStatus,
        subscriptionPlan: c.subscriptionPlan,
        lastBillingDate: c.lastBillingDate,
        nextBillingDate: c.nextBillingDate,
        subscriptionEndsAt: c.subscriptionEndsAt,
        daysOverdue,
      };
    });

    return NextResponse.json({ customers: rows, total, limit });
  } catch (err) {
    return fromException(request, err, {
      stage: "admin/blocked-customers:list",
    });
  }
}
