/**
 * GET /api/addons/catalog
 *
 * The in-app add-on packs catalog (Phase 5). Returns the recurring add-on
 * descriptors straight from the billing registry (the pricing SSOT — never
 * hardcoded here) plus the SKUs the caller's workspace already owns, so the
 * dashboard can render an "Active" badge vs. an "Add" button per pack.
 *
 * Read-only + auth-gated. No Stripe calls — purchasing goes through the
 * existing POST /api/addons/checkout.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { RECURRING_ADDONS } from "@/lib/billing/addon-registry";
import { getWorkspaceForUser } from "@/lib/workspace/provider-connections";
import { apiError, fromException } from "@/lib/api-errors";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(req, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    // Public catalog fields only — sourced from each add-on's own SSOT via the
    // registry, so price/name/description can never drift from checkout.
    const addons = Object.values(RECURRING_ADDONS).map((a) => ({
      sku: a.sku,
      name: a.name,
      description: a.description,
      amount: a.amount,
      currency: a.currency,
      interval: a.interval,
      perSeat: a.perSeat ?? false,
    }));

    // Which of these the caller's workspace already has an ACTIVE entitlement for.
    let owned: string[] = [];
    const workspace = await getWorkspaceForUser(session.user.id);
    if (workspace) {
      const skus = addons.map((a) => a.sku);
      const entitlements = await prisma.featureEntitlement.findMany({
        where: { workspaceId: workspace.id, active: true, sku: { in: skus } },
        select: { sku: true },
        take: 100,
      });
      owned = entitlements.map((e) => e.sku);
    }

    return NextResponse.json({ addons, owned });
  } catch (error) {
    return fromException(req, error, { stage: "catalog" });
  }
}
