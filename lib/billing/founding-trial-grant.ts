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
 *
 * `runFoundingTrialGrant` wraps the grant in Stripe checks so it is never
 * applied while the business has add-on billing in flight (see there).
 */

import { AddonSku, type Prisma, type PrismaClient } from "@prisma/client";
import { getRecurringAddonBySubscriptionType } from "./addon-registry";

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

/** A row's state before the grant wrote it; null when there was no row. */
export type PriorEntitlement = {
  active: boolean;
  seats: number | null;
  stripePriceId: string | null;
} | null;

export interface FoundingTrialGrantResult {
  workspaceId: string;
  /** SKUs written (or that would be written, on a dry run). */
  granted: AddonSku[];
  /** SKUs skipped because a Stripe subscription backs the row. */
  skippedPaid: AddonSku[];
  /** For each granted SKU, what the row held before, so it can be put back. */
  prior: Partial<Record<AddonSku, PriorEntitlement>>;
  applied: boolean;
}

export class FoundingTrialGrantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FoundingTrialGrantError";
  }
}

/**
 * Stripe billing for this business that the grant would collide with: an
 * add-on Checkout not yet finished, or a live add-on subscription that no
 * entitlement row records yet (its checkout completed but the webhook has not
 * landed). Either one would leave the business paying for an add-on it holds
 * free, so the grant refuses while any exist and names them.
 */
export interface BillingConflict {
  kind: "open_checkout" | "live_subscription";
  id: string;
  customer: string;
  sku: string | null;
}

type Metadata = Record<string, string> | null | undefined;

export type BillingReader = {
  checkout: {
    sessions: {
      list(params: {
        customer: string;
        status: "open";
        limit: number;
      }): AsyncIterable<{ id: string; metadata?: Metadata }>;
    };
  };
  subscriptions: {
    list(params: {
      customer: string;
      status: "all";
      limit: number;
    }): AsyncIterable<{ id: string; status: string; metadata?: Metadata }>;
  };
};

/** Subscription states that can no longer charge. */
const FINISHED_SUBSCRIPTION = new Set(["canceled", "incomplete_expired"]);

/**
 * Every Stripe customer that can buy an add-on for this workspace. Checkout
 * bills the purchasing user's own customer and resolves an ACTIVE member to
 * the shared workspace (getWorkspaceForUser), so the owner alone is not
 * enough. A member who resolves elsewhere only adds sessions the workspace
 * filter in addonBillingConflicts drops.
 */
export async function workspaceBillingCustomers(
  db: GrantDb,
  workspaceId: string,
): Promise<string[]> {
  const ws = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: {
      owner: { select: { stripeCustomerId: true } },
      members: {
        where: { status: "ACTIVE" },
        select: { user: { select: { stripeCustomerId: true } } },
      },
    },
  });
  const ids = [
    ws?.owner?.stripeCustomerId,
    ...(ws?.members ?? []).map((m) => m.user?.stripeCustomerId),
  ].filter((id): id is string => !!id);
  return [...new Set(ids)];
}

/**
 * Read-only: nothing is expired, cancelled or refunded. An add-on checkout
 * without a workspace id cannot be ruled out, so it counts against this one.
 */
export async function addonBillingConflicts(
  stripe: BillingReader,
  customerIds: string[],
  workspaceId: string,
  linkedSubscriptionIds: ReadonlySet<string>,
): Promise<BillingConflict[]> {
  const conflicts: BillingConflict[] = [];
  for (const customer of customerIds) {
    for await (const s of stripe.checkout.sessions.list({
      customer,
      status: "open",
      limit: 100,
    })) {
      const m = s.metadata;
      if (m?.type !== "addon_subscription") continue;
      if (m.workspaceId && m.workspaceId !== workspaceId) continue;
      conflicts.push({
        kind: "open_checkout",
        id: s.id,
        customer,
        sku: m.sku ?? null,
      });
    }
    for await (const sub of stripe.subscriptions.list({
      customer,
      status: "all",
      limit: 100,
    })) {
      const m = sub.metadata;
      if (m?.workspaceId !== workspaceId) continue;
      if (!getRecurringAddonBySubscriptionType(m.type ?? "")) continue;
      if (FINISHED_SUBSCRIPTION.has(sub.status)) continue;
      if (linkedSubscriptionIds.has(sub.id)) continue;
      conflicts.push({
        kind: "live_subscription",
        id: sub.id,
        customer,
        sku: m.sku ?? null,
      });
    }
  }
  return conflicts;
}

async function currentConflicts(
  db: GrantDb,
  stripe: BillingReader,
  workspaceId: string,
): Promise<BillingConflict[]> {
  const rows = await db.featureEntitlement.findMany({
    where: { workspaceId },
    select: { stripeSubscriptionId: true },
  });
  const linked = new Set(
    rows
      .map((r) => r.stripeSubscriptionId)
      .filter((id): id is string => !!id),
  );
  const customers = await workspaceBillingCustomers(db, workspaceId);
  return addonBillingConflicts(stripe, customers, workspaceId, linked);
}

/**
 * How long the grant waits after writing before it checks Stripe again.
 * Checkout reads the entitlement row and then creates the session, so a
 * request that read the row just before the grant committed can still open a
 * session afterwards. Stripe's client waits up to 80 s per attempt and
 * retries; five minutes outlasts any such request.
 */
export const GRANT_SETTLE_MS = 5 * 60 * 1000;

export type FoundingTrialRunOutcome =
  | { status: "refused"; workspaceId: string; conflicts: BillingConflict[] }
  | { status: "reverted"; workspaceId: string; conflicts: BillingConflict[] }
  | { status: "dry_run" | "granted"; result: FoundingTrialGrantResult };

/**
 * Check Stripe, write the grant, wait out any checkout already in flight,
 * then check again. From the moment the grant commits, checkout refuses every
 * granted add-on (409), so a later conflict can only come from a checkout
 * started before that; the second check sees it and the grant is put back as
 * it was. The business is never left holding a free add-on it is also paying
 * for, and nothing in Stripe is touched.
 */
export async function runFoundingTrialGrant(deps: {
  db: PrismaClient;
  stripe: BillingReader;
  organizationId: string;
  apply: boolean;
  settleMs?: number;
  sleep?: (ms: number) => Promise<void>;
}): Promise<FoundingTrialRunOutcome> {
  const { db, stripe, organizationId, apply } = deps;
  const workspaceId = await grantWorkspaceId(db, organizationId);

  const before = await currentConflicts(db, stripe, workspaceId);
  if (before.length) {
    return { status: "refused", workspaceId, conflicts: before };
  }
  if (!apply) {
    const result = await grantFoundingTrial(db, organizationId, {
      apply: false,
    });
    return { status: "dry_run", result };
  }

  const result = await db.$transaction((tx) =>
    grantFoundingTrial(tx, organizationId, { apply: true }),
  );
  const sleep =
    deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  await sleep(deps.settleMs ?? GRANT_SETTLE_MS);

  const after = await currentConflicts(db, stripe, workspaceId);
  if (!after.length) return { status: "granted", result };
  await db.$transaction((tx) => revertFoundingTrial(tx, result));
  return { status: "reverted", workspaceId, conflicts: after };
}

/**
 * Put back every row this grant wrote, as it was before. Each write is
 * conditional on the row still being the untouched free grant, so a row
 * Stripe has since linked to a subscription is left alone.
 */
export async function revertFoundingTrial(
  db: GrantDb,
  result: FoundingTrialGrantResult,
): Promise<void> {
  for (const sku of result.granted) {
    const where = {
      workspaceId: result.workspaceId,
      sku,
      stripePriceId: COMPLIMENTARY_PRICE_ID,
      stripeSubscriptionId: null,
    };
    const prior = result.prior[sku];
    if (prior) {
      await db.featureEntitlement.updateMany({ where, data: prior });
    } else {
      await db.featureEntitlement.deleteMany({ where });
    }
  }
}

async function grantWorkspaceId(
  db: GrantDb,
  organizationId: string,
): Promise<string> {
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
  return workspace.id;
}

export async function grantFoundingTrial(
  db: GrantDb,
  organizationId: string,
  opts: { apply: boolean },
): Promise<FoundingTrialGrantResult> {
  const workspaceId = await grantWorkspaceId(db, organizationId);

  const granted: AddonSku[] = [];
  const skippedPaid: AddonSku[] = [];
  const prior: FoundingTrialGrantResult["prior"] = {};

  const existing = await db.featureEntitlement.findMany({
    where: { workspaceId },
    select: {
      sku: true,
      active: true,
      seats: true,
      stripePriceId: true,
      stripeSubscriptionId: true,
    },
  });

  if (!opts.apply) {
    const paid = new Set(
      existing.filter((e) => e.stripeSubscriptionId).map((e) => e.sku),
    );
    for (const sku of Object.values(AddonSku)) {
      (paid.has(sku) ? skippedPaid : granted).push(sku);
    }
    return { workspaceId, granted, skippedPaid, prior, applied: false };
  }

  // Snapshot the values now, before any write, so a revert restores them.
  const before = new Map<AddonSku, NonNullable<PriorEntitlement>>(
    existing.map((e) => [
      e.sku,
      { active: e.active, seats: e.seats, stripePriceId: e.stripePriceId },
    ]),
  );
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
      prior[sku] = before.get(sku) ?? null;
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
    if (created.count === 1) {
      prior[sku] = null;
      granted.push(sku);
    } else {
      skippedPaid.push(sku);
    }
  }

  return { workspaceId, granted, skippedPaid, prior, applied: true };
}
