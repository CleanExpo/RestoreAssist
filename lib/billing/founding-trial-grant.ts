/**
 * RA-7721 / RA-7717 — Founding Trial grant.
 *
 * Founder ruling (27/09/2026): a Founding Trial business gets every technician
 * seat free and every add-on switched on, none of it charged.
 *
 * The grant is a set of FeatureEntitlement rows on the organisation owner's
 * oldest READY workspace — the same workspace `technicianSeatUsage` and
 * `/api/addons/checkout` use — marked active with no Stripe linkage. The
 * Stripe webhook only writes a row for that workspace's own add-on
 * subscription, so an unlinked row is not touched by billing.
 *
 * A row already linked to a Stripe subscription is left alone and reported:
 * overwriting it would detach a paid subscription from its entitlement.
 */

import { AddonSku, type Prisma, type PrismaClient } from "@prisma/client";

type GrantDb = PrismaClient | Prisma.TransactionClient;

/** Seat count for a Founding Trial: effectively unlimited, still an Int. */
export const FOUNDING_TRIAL_SEATS = 999;

export interface FoundingTrialGrantResult {
  workspaceId: string;
  /** SKUs written (or that would be written, on a dry run). */
  granted: AddonSku[];
  /** SKUs skipped because a Stripe subscription already backs the row. */
  skippedPaid: AddonSku[];
  applied: boolean;
}

export class FoundingTrialGrantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FoundingTrialGrantError";
  }
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

  const existing = await db.featureEntitlement.findMany({
    where: { workspaceId: workspace.id },
    select: { sku: true, stripeSubscriptionId: true },
  });
  const paid = new Set(
    existing.filter((e) => e.stripeSubscriptionId).map((e) => e.sku),
  );

  const granted: AddonSku[] = [];
  const skippedPaid: AddonSku[] = [];
  for (const sku of Object.values(AddonSku)) {
    if (paid.has(sku)) {
      skippedPaid.push(sku);
      continue;
    }
    granted.push(sku);
    if (!opts.apply) continue;
    const seats =
      sku === AddonSku.TECHNICIAN_SEATS ? FOUNDING_TRIAL_SEATS : undefined;
    await db.featureEntitlement.upsert({
      where: { workspaceId_sku: { workspaceId: workspace.id, sku } },
      create: { workspaceId: workspace.id, sku, active: true, seats },
      update: { active: true, seats },
    });
  }

  return {
    workspaceId: workspace.id,
    granted,
    skippedPaid,
    applied: opts.apply,
  };
}
