/**
 * RA-7721 / RA-7717 — Founding Trial grant.
 *
 * Founder ruling (27/09/2026): a Founding Trial business gets every technician
 * seat free and every add-on switched on, none of it charged.
 *
 * The grant is a set of FeatureEntitlement rows on the organisation owner's
 * oldest READY workspace — the same workspace `technicianSeatUsage` and
 * `/api/addons/checkout` (via getWorkspaceForUser) resolve for the owner —
 * marked active, with no Stripe subscription, and `stripePriceId` set to
 * COMPLIMENTARY_PRICE_ID. That marker is what keeps the grant free:
 *   - `/api/addons/checkout` refuses to sell an add-on held complimentary;
 *   - `applyRecurringAddonSubscription` will not overwrite or deactivate it,
 *     so a checkout left open before the grant cannot replace it.
 * Nothing else reads `stripePriceId`, so the marker needs no schema change.
 *
 * A row already linked to a Stripe subscription is never written: each write
 * is a conditional update on `stripeSubscriptionId: null`, or a create that
 * loses cleanly to a concurrent Stripe write, so a paid row that appears
 * between planning and writing is skipped and reported, not overwritten.
 */

import { AddonSku, type Prisma, type PrismaClient } from "@prisma/client";

type GrantDb = PrismaClient | Prisma.TransactionClient;

/** Seat count for a Founding Trial: effectively unlimited, still an Int. */
export const FOUNDING_TRIAL_SEATS = 999;

/** `stripePriceId` value that marks an entitlement as a free grant. */
export const COMPLIMENTARY_PRICE_ID = "complimentary:founding-trial";

export function isComplimentaryEntitlement(
  row: { stripePriceId?: string | null } | null | undefined,
): boolean {
  return row?.stripePriceId === COMPLIMENTARY_PRICE_ID;
}

export interface FoundingTrialGrantResult {
  workspaceId: string;
  /** SKUs written (or that would be written, on a dry run). */
  granted: AddonSku[];
  /** SKUs skipped because a Stripe subscription backs the row. */
  skippedPaid: AddonSku[];
  applied: boolean;
}

export class FoundingTrialGrantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FoundingTrialGrantError";
  }
}

/** An add-on Checkout the business opened and has not finished. */
export interface OpenAddonCheckout {
  id: string;
  sku: string | null;
}

type CheckoutLister = {
  checkout: {
    sessions: {
      list(params: {
        customer: string;
        status: "open";
        limit: number;
      }): AsyncIterable<{ id: string; metadata?: Record<string, string> | null }>;
    };
  };
};

/**
 * Open add-on Checkouts for a Stripe customer. Read-only: nothing is expired
 * or cancelled. An open one could complete after the grant and start a paid
 * subscription for an add-on the business now holds free, so the grant
 * script refuses to apply while any exist and names them instead.
 */
export async function openAddonCheckouts(
  stripe: CheckoutLister,
  customerId: string | null | undefined,
): Promise<OpenAddonCheckout[]> {
  if (!customerId) return [];
  const open: OpenAddonCheckout[] = [];
  for await (const s of stripe.checkout.sessions.list({
    customer: customerId,
    status: "open",
    limit: 100,
  })) {
    if (s.metadata?.type === "addon_subscription") {
      open.push({ id: s.id, sku: s.metadata?.sku ?? null });
    }
  }
  return open;
}

export async function grantFoundingTrial(
  db: GrantDb,
  organizationId: string,
  opts: { apply: boolean },
): Promise<FoundingTrialGrantResult> {
  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { ownerId: true },
  });
  if (!org) {
    throw new FoundingTrialGrantError(
      `No organisation with id ${organizationId}`,
    );
  }

  const workspace = await db.workspace.findFirst({
    where: { ownerId: org.ownerId, status: "READY" },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!workspace) {
    throw new FoundingTrialGrantError(
      `Organisation ${organizationId} has no READY workspace`,
    );
  }
  const workspaceId = workspace.id;

  const granted: AddonSku[] = [];
  const skippedPaid: AddonSku[] = [];

  if (!opts.apply) {
    const existing = await db.featureEntitlement.findMany({
      where: { workspaceId },
      select: { sku: true, stripeSubscriptionId: true },
    });
    const paid = new Set(
      existing.filter((e) => e.stripeSubscriptionId).map((e) => e.sku),
    );
    for (const sku of Object.values(AddonSku)) {
      (paid.has(sku) ? skippedPaid : granted).push(sku);
    }
    return { workspaceId, granted, skippedPaid, applied: false };
  }

  for (const sku of Object.values(AddonSku)) {
    const data = {
      active: true,
      seats: sku === AddonSku.TECHNICIAN_SEATS ? FOUNDING_TRIAL_SEATS : null,
      stripePriceId: COMPLIMENTARY_PRICE_ID,
    };

    // Only a row with no Stripe subscription may be written.
    const updated = await db.featureEntitlement.updateMany({
      where: { workspaceId, sku, stripeSubscriptionId: null },
      data,
    });
    if (updated.count === 1) {
      granted.push(sku);
      continue;
    }

    // No writable row: create one, unless a row already exists — then a
    // Stripe subscription backs it (possibly written a moment ago) and it is
    // left alone. skipDuplicates is ON CONFLICT DO NOTHING, so a conflict
    // does not abort the surrounding transaction the way a failed create would.
    const created = await db.featureEntitlement.createMany({
      data: [{ workspaceId, sku, ...data }],
      skipDuplicates: true,
    });
    (created.count === 1 ? granted : skippedPaid).push(sku);
  }

  return { workspaceId, granted, skippedPaid, applied: true };
}
