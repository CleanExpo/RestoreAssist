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
 *   - `/api/addons/checkout` refuses to sell an add-on held complimentary,
 *     and checks again after creating a session, withholding its link if
 *     the grant committed in between;
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
 *
 * Founder ruling 28/09/2026: the $99/month base plan is ALSO free for 60 days
 * from the grant, then $99/month. The base plan rides the existing trial: the
 * organisation owner's User row goes to TRIAL with trialEndsAt 60 days out
 * (members inherit it through getEffectiveSubscription), and report credits
 * are restored, because the day-16 lockout zeroed them. See
 * grantFoundingTrialBasePlan.
 *
 * Founder input 28/09/2026: the grant is only for a business whose ABN the
 * Australian Business Register confirmed during the signup walkthrough. There
 * is no "verified" column; the record of that confirmation is the ABR
 * HydrationJob (READY, payload from ABR) for the organisation, and it must
 * name the ABN the organisation holds now. See verifiedAbrEntity.
 */

import {
  AddonSku,
  Prisma,
  type PrismaClient,
  type SubscriptionStatus,
} from "@prisma/client";
import { PRICING_CONFIG } from "@/lib/pricing";
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
  customer: string | null;
  sku: string | null;
}

type Metadata = Record<string, string> | null | undefined;

export type BillingReader = {
  checkout: {
    sessions: {
      list(params: {
        status: "open";
        limit: number;
      }): AsyncIterable<{
        id: string;
        customer: string | { id: string } | null;
        metadata?: Metadata;
      }>;
    };
  };
  subscriptions: {
    list(params: { limit: number }): AsyncIterable<{
      id: string;
      status: string;
      customer: string | { id: string };
      metadata?: Metadata;
    }>;
  };
};

/** Subscription states that can no longer charge. */
const FINISHED_SUBSCRIPTION = new Set(["canceled", "incomplete_expired"]);

const customerId = (c: string | { id: string } | null) =>
  typeof c === "string" ? c : (c?.id ?? null);

/**
 * Read-only: nothing is expired, cancelled or refunded.
 *
 * Both lists run across the whole Stripe account, not per customer, and keep
 * what Checkout stamped with this workspace id. A payer the database can no
 * longer name (a removed member, a deleted user, a replaced customer id) is
 * still found, and a list reads current state where Stripe's search index
 * can trail. Every add-on Checkout the app creates carries the workspace id
 * (/api/addons/checkout), and an unfinished session expires within 24 hours,
 * so every live add-on session carries it.
 */
export async function addonBillingConflicts(
  stripe: BillingReader,
  workspaceId: string,
  linkedSubscriptionIds: ReadonlySet<string>,
): Promise<BillingConflict[]> {
  const conflicts: BillingConflict[] = [];
  for await (const s of stripe.checkout.sessions.list({
    status: "open",
    limit: 100,
  })) {
    const m = s.metadata;
    if (m?.type !== "addon_subscription" || m.workspaceId !== workspaceId) {
      continue;
    }
    conflicts.push({
      kind: "open_checkout",
      id: s.id,
      customer: customerId(s.customer),
      sku: m.sku ?? null,
    });
  }
  // Without a status filter Stripe lists every subscription not cancelled.
  for await (const sub of stripe.subscriptions.list({ limit: 100 })) {
    const m = sub.metadata;
    if (m?.workspaceId !== workspaceId) continue;
    if (!getRecurringAddonBySubscriptionType(m.type ?? "")) continue;
    if (FINISHED_SUBSCRIPTION.has(sub.status)) continue;
    if (linkedSubscriptionIds.has(sub.id)) continue;
    conflicts.push({
      kind: "live_subscription",
      id: sub.id,
      customer: customerId(sub.customer),
      sku: m.sku ?? null,
    });
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
  return addonBillingConflicts(stripe, workspaceId, linked);
}

/**
 * How long the grant waits after writing before it checks Stripe again.
 * Correctness does not rest on this wait. Checkout re-reads the row after
 * creating a session, so a session created after the grant committed never
 * has its link handed out; one created before is already listable when the
 * second check runs. The wait is margin, letting a request already under way
 * finish so the second check sees its outcome.
 */
export const GRANT_SETTLE_MS = 5 * 60 * 1000;

export type FoundingTrialRunOutcome =
  | { status: "unverified_abn"; organizationId: string; reason: string }
  | { status: "identity_changed"; organizationId: string; reason: string }
  | { status: "refused"; workspaceId: string; conflicts: BillingConflict[] }
  | { status: "reverted"; workspaceId: string; conflicts: BillingConflict[] }
  | {
      status: "dry_run" | "granted";
      entity: VerifiedAbrEntity;
      result: FoundingTrialGrantResult;
      basePlan: FoundingTrialBasePlanResult;
    };

/**
 * The business the operator confirmed on Preview. Apply is refused unless the
 * locked, re-verified business is still exactly this one (review r3
 * P1-PREVIEW-IDENTITY-NOT-BOUND).
 */
export interface ConfirmedBusiness {
  organizationId: string;
  abn: string;
  legalName: string;
}

const IDENTITY_CHANGED =
  "The business's details changed after Preview. Preview again before applying.";

/** The business as the Australian Business Register named it at signup. */
export interface VerifiedAbrEntity {
  abn: string;
  legalName: string;
  tradingNames: string[];
}

const digitsOnly = (v: unknown) =>
  typeof v === "string" ? v.replace(/\D/g, "") : "";

/**
 * The ABR-confirmed identity of an organisation, or why there is none.
 * Fails closed: no ABN, no ABR lookup, a lookup that did not succeed, a
 * lookup for a different ABN than the one held now, or a cancelled ABN all
 * refuse. Nothing here calls ABR; it reads what the signup walkthrough stored.
 */
export async function verifiedAbrEntity(
  db: GrantDb,
  organizationId: string,
): Promise<{ ok: true; entity: VerifiedAbrEntity } | { ok: false; reason: string }> {
  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { abn: true },
  });
  if (!org) return { ok: false, reason: `No organisation with id ${organizationId}` };
  const abn = digitsOnly(org.abn);
  if (abn.length !== 11) {
    return { ok: false, reason: "This business has no ABN on record." };
  }
  const job = await db.hydrationJob.findUnique({
    where: { organizationId_kind: { organizationId, kind: "ABR" } },
    select: { status: true, payload: true },
  });
  if (!job || job.status !== "READY" || !job.payload) {
    return {
      ok: false,
      reason: "The Australian Business Register has not confirmed this business's ABN.",
    };
  }
  const p = job.payload as Record<string, unknown>;
  if (digitsOnly(p.abn) !== abn) {
    return {
      ok: false,
      reason: "The ABN on this business is not the one the Australian Business Register confirmed.",
    };
  }
  if (p.status !== "ACTIVE") {
    return { ok: false, reason: "The Australian Business Register lists this ABN as cancelled." };
  }
  if (typeof p.legalName !== "string" || !p.legalName) {
    return { ok: false, reason: "The Australian Business Register record has no entity name." };
  }
  const tradingNames = Array.isArray(p.tradingNames)
    ? p.tradingNames.filter((n): n is string => typeof n === "string")
    : [];
  return { ok: true, entity: { abn, legalName: p.legalName, tradingNames } };
}

/** Length of the free base plan for a Founding Trial business. */
export const FOUNDING_TRIAL_BASE_PLAN_DAYS = 60;

export type BasePlanPrior = {
  subscriptionStatus: SubscriptionStatus | null;
  trialEndsAt: Date | null;
  creditsRemaining: number | null;
};

export interface FoundingTrialBasePlanResult {
  ownerId: string;
  /**
   * extended          owner is (or, on a dry run, would be) on TRIAL to trialEndsAt
   * kept_longer       an existing trial already runs past 60 days; left alone
   * skipped_paying    the owner pays for the base plan (or has a Stripe
   *                   subscription, or a non-trial status); left alone
   * skipped_lifetime  lifetime access; left alone
   * skipped_changed   the row changed between read and write; nothing written
   */
  outcome:
    | "extended"
    | "kept_longer"
    | "skipped_paying"
    | "skipped_lifetime"
    | "skipped_changed";
  trialEndsAt: Date | null;
  /** The row before the write, when the grant wrote it. */
  prior: BasePlanPrior | null;
  /** What the grant wrote, so a revert only undoes its own write. */
  written: { trialEndsAt: Date; creditsRemaining: number } | null;
  applied: boolean;
}

const TRIAL_STATUSES: SubscriptionStatus[] = ["TRIAL", "EXPIRED"];

/**
 * Put the owner on the base plan, free, until 60 days from `now`.
 * Never shortens a longer trial, never touches a Stripe payer, lifetime access,
 * or any status other than TRIAL / EXPIRED / none. The write is one
 * conditional update carrying every one of those guards, so a subscription or
 * a longer trial that lands after the read is not overwritten.
 */
export async function grantFoundingTrialBasePlan(
  db: GrantDb,
  ownerId: string,
  opts: { apply: boolean; now?: Date },
): Promise<FoundingTrialBasePlanResult> {
  const now = opts.now ?? new Date();
  const end = new Date(
    now.getTime() + FOUNDING_TRIAL_BASE_PLAN_DAYS * 24 * 60 * 60 * 1000,
  );
  const base = { ownerId, prior: null, written: null, applied: opts.apply };

  const owner = await db.user.findUnique({
    where: { id: ownerId },
    select: {
      subscriptionStatus: true,
      trialEndsAt: true,
      creditsRemaining: true,
      subscriptionId: true,
      lifetimeAccess: true,
    },
  });
  if (!owner) {
    throw new FoundingTrialGrantError(`No owner user with id ${ownerId}`);
  }
  if (owner.lifetimeAccess) {
    return { ...base, outcome: "skipped_lifetime", trialEndsAt: owner.trialEndsAt };
  }
  if (
    owner.subscriptionId ||
    (owner.subscriptionStatus !== null &&
      !TRIAL_STATUSES.includes(owner.subscriptionStatus))
  ) {
    return { ...base, outcome: "skipped_paying", trialEndsAt: owner.trialEndsAt };
  }
  if (
    owner.subscriptionStatus === "TRIAL" &&
    owner.trialEndsAt &&
    owner.trialEndsAt.getTime() >= end.getTime()
  ) {
    return { ...base, outcome: "kept_longer", trialEndsAt: owner.trialEndsAt };
  }

  const creditsRemaining = Math.max(
    owner.creditsRemaining ?? 0,
    PRICING_CONFIG.free.trialReportCredits,
  );
  if (!opts.apply) {
    return { ...base, outcome: "extended", trialEndsAt: end };
  }

  const updated = await db.user.updateMany({
    where: {
      id: ownerId,
      subscriptionId: null,
      // Compare-and-set: the floor was computed from this balance, so a report
      // charged or refunded since the read makes the write skip, not clobber.
      creditsRemaining: owner.creditsRemaining,
      AND: [
        { OR: [{ lifetimeAccess: null }, { lifetimeAccess: false }] },
        {
          OR: [
            { subscriptionStatus: null },
            { subscriptionStatus: { in: TRIAL_STATUSES } },
          ],
        },
        { OR: [{ trialEndsAt: null }, { trialEndsAt: { lt: end } }] },
      ],
    },
    data: { subscriptionStatus: "TRIAL", trialEndsAt: end, creditsRemaining },
  });
  if (updated.count !== 1) {
    return { ...base, outcome: "skipped_changed", trialEndsAt: null };
  }
  return {
    ownerId,
    outcome: "extended",
    trialEndsAt: end,
    prior: {
      subscriptionStatus: owner.subscriptionStatus,
      trialEndsAt: owner.trialEndsAt,
      creditsRemaining: owner.creditsRemaining,
    },
    written: { trialEndsAt: end, creditsRemaining },
    applied: true,
  };
}

/**
 * Undo the base-plan write, only while the owner still holds exactly what the
 * grant wrote and has no Stripe subscription. Credits go back only if nothing
 * has been charged against them since; a balance spent meanwhile is kept, so
 * the revert never refunds a report the business already made.
 */
export async function revertFoundingTrialBasePlan(
  db: GrantDb,
  result: FoundingTrialBasePlanResult,
): Promise<void> {
  if (!result.applied || !result.prior || !result.written) return;
  const reverted = await db.user.updateMany({
    where: {
      id: result.ownerId,
      subscriptionId: null,
      subscriptionStatus: "TRIAL",
      trialEndsAt: result.written.trialEndsAt,
    },
    data: {
      subscriptionStatus: result.prior.subscriptionStatus,
      trialEndsAt: result.prior.trialEndsAt,
    },
  });
  if (reverted.count !== 1) return;
  await db.user.updateMany({
    where: {
      id: result.ownerId,
      creditsRemaining: result.written.creditsRemaining,
    },
    data: { creditsRemaining: result.prior.creditsRemaining },
  });
}

/**
 * Check Stripe, write the grant, wait (GRANT_SETTLE_MS), then check again.
 * From the moment the grant commits, checkout refuses every granted add-on
 * (409) and withholds the link of any session it created after that instant,
 * so a payable conflict can only be a session created before the commit; the
 * second check sees it and the grant is put back as it was. The business is
 * never left holding a free add-on it is also paying for, and the grant
 * touches nothing in Stripe.
 */
export async function runFoundingTrialGrant(deps: {
  db: PrismaClient;
  stripe: BillingReader;
  organizationId: string;
  apply: boolean;
  settleMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: Date;
  /** What the operator saw on Preview; when absent, the check below. */
  confirmed?: ConfirmedBusiness;
}): Promise<FoundingTrialRunOutcome> {
  const { db, stripe, organizationId, apply, confirmed } = deps;
  if (confirmed && confirmed.organizationId !== organizationId) {
    return { status: "identity_changed", organizationId, reason: IDENTITY_CHANGED };
  }
  const verified = await verifiedAbrEntity(db, organizationId);
  if (!verified.ok) {
    return { status: "unverified_abn", organizationId, reason: verified.reason };
  }
  const { entity } = verified;
  const workspaceId = await grantWorkspaceId(db, organizationId);
  const ownerId = await organisationOwnerId(db, organizationId);

  const before = await currentConflicts(db, stripe, workspaceId);
  if (before.length) {
    return { status: "refused", workspaceId, conflicts: before };
  }
  // The grant is pinned to the workspace both checks cover, so it cannot land
  // on a different one if another of the owner's workspaces turns READY.
  if (!apply) {
    const result = await grantFoundingTrial(db, organizationId, {
      apply: false,
      expectWorkspaceId: workspaceId,
    });
    const basePlan = await grantFoundingTrialBasePlan(db, ownerId, {
      apply: false,
      now: deps.now,
    });
    return { status: "dry_run", entity, result, basePlan };
  }

  const written = await db.$transaction(async (tx) => {
    // The ABR check above ran before the Stripe reads. Lock the organisation
    // and its ABR lookup for the rest of this transaction, then check again,
    // so a setup/hydrate or setup/state write cannot swap the ABN or fail the
    // lookup between the check and the grant (review r1 P1-ABR-IDENTITY-RACE).
    await tx.$queryRaw(
      Prisma.sql`SELECT "id" FROM "Organization" WHERE "id" = ${organizationId} FOR UPDATE`,
    );
    await tx.$queryRaw(
      Prisma.sql`SELECT "id" FROM "HydrationJob" WHERE "organizationId" = ${organizationId} AND "kind" = 'ABR' FOR UPDATE`,
    );
    const still = await verifiedAbrEntity(tx, organizationId);
    if (!still.ok) {
      return { ok: false as const, status: "unverified_abn" as const, reason: still.reason };
    }
    // Bound to what the operator confirmed on Preview, or, with no preview,
    // to what this run checked before the Stripe reads.
    const expected = confirmed ?? entity;
    if (
      still.entity.abn !== expected.abn ||
      still.entity.legalName !== expected.legalName
    ) {
      return { ok: false as const, status: "identity_changed" as const, reason: IDENTITY_CHANGED };
    }
    return {
      ok: true as const,
      result: await grantFoundingTrial(tx, organizationId, {
        apply: true,
        expectWorkspaceId: workspaceId,
      }),
      basePlan: await grantFoundingTrialBasePlan(tx, ownerId, {
        apply: true,
        now: deps.now,
      }),
    };
  });
  if (!written.ok) {
    return { status: written.status, organizationId, reason: written.reason };
  }
  const { result, basePlan } = written;
  const sleep =
    deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  await sleep(deps.settleMs ?? GRANT_SETTLE_MS);

  const after = await currentConflicts(db, stripe, workspaceId);
  if (!after.length) return { status: "granted", entity, result, basePlan };
  await db.$transaction(async (tx) => {
    await revertFoundingTrial(tx, result);
    await revertFoundingTrialBasePlan(tx, basePlan);
  });
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

async function organisationOwnerId(
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
  return org.ownerId;
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
  opts: { apply: boolean; expectWorkspaceId?: string },
): Promise<FoundingTrialGrantResult> {
  const workspaceId = await grantWorkspaceId(db, organizationId);
  if (opts.expectWorkspaceId && workspaceId !== opts.expectWorkspaceId) {
    throw new FoundingTrialGrantError(
      `Organisation ${organizationId}'s workspace changed from ` +
        `${opts.expectWorkspaceId} to ${workspaceId} while Stripe was being ` +
        `checked. Nothing was written; run the grant again.`,
    );
  }

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
