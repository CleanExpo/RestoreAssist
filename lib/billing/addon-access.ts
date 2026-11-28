/**
 * RA-8466 — what a viewer can do with each Field Add-On, and how its card is
 * labelled. Pure, so it is table-tested.
 *
 * Every rule here mirrors a check POST /api/addons/checkout runs, in the same
 * order, using the same helpers, so a card never offers a button the server
 * would refuse:
 *   1. refuseNonOwner: only the business owner (or a solo operator) buys,
 *      and only someone who may open the billing pages (canOpenDashboardPage
 *      for /dashboard/subscription), where every other control and the
 *      checkout's refusal notices lead.
 *   2. The plan must be ACTIVE, except a technician seat during a current trial.
 *   3. A seat needs the database role ADMIN.
 *   4. A pack other than a seat needs a business workspace
 *      (getWorkspaceForUser); checkout answers 404 without one.
 *   5. A pack held free in the Founding Trial is never sold.
 *
 * RA-8665: this function is the only judge of which control a card offers.
 * The cards on screen show its verdict and never make up their own.
 *
 * The label is decided from the entitlement row the catalogue reads, never
 * from pricing copy:
 *   - complimentary marker (Founding Trial)     -> complimentary_pilot
 *   - active row with a Stripe subscription     -> optional_paid (switched on)
 *   - active row with neither (grandfathered)   -> included
 *   - no active row, and the viewer could buy   -> optional_paid
 *   - no active row, and the plan stops a buy   -> unavailable
 */

import { isComplimentaryEntitlement } from "@/lib/billing/founding-trial-grant";
import { isCurrentTrial } from "@/lib/billing/trial-expired-pay-route";
import { FLOORPLAN_UNDERLAY_SKU } from "@/lib/billing/floorplan-underlay-addon";
import { isUnderlayUrlImportEnabled } from "@/lib/sketch/underlay-import-flag";

export type AddonLabel =
  | "included"
  | "optional_paid"
  | "unavailable"
  | "complimentary_pilot"
  // RA-8665: a card the server gave no verdict for. It claims no price.
  | "unknown";

/** What the card may offer. Nothing else is ever rendered as a button. */
export type AddonAction =
  | "buy"
  | "add_seat"
  | "manage"
  | "choose_plan"
  | "ask_owner"
  | "none";

/** The pack's entitlement row as the catalogue reads it (active rows only). */
export interface AddonHoldingRow {
  stripePriceId: string | null;
  stripeSubscriptionId: string | null;
}

export type AddonHolding = "none" | "complimentary" | "paid" | "included";

export interface AddonViewer {
  /** Same rule as refuseNonOwner: the organisation owner, or in no organisation. */
  isBillingOwner: boolean;
  /** RA-8665: whether this account belongs to a business (has an organisation owner). */
  inOrganisation: boolean;
  /** Database role. A seat needs ADMIN. */
  role: string | null;
  subscriptionStatus: string | null;
  trialEndsAt: Date | string | null;
  /**
   * RA-8665: whether checkout would find a workspace to file the purchase on,
   * for a pack and for a seat. Both come from addonCheckoutHasWorkspace
   * (lib/billing/addon-checkout-workspace.ts), the function checkout itself
   * calls before it creates a Stripe customer.
   */
  hasWorkspace: { pack: boolean; seat: boolean };
  /**
   * RA-8665: whether the page guard lets this viewer open the billing pages
   * (canOpenDashboardPage(session role, "/dashboard/subscription")). Choose a
   * plan and Manage open that page, so a viewer it refuses is offered neither.
   */
  canOpenBillingPages: boolean;
}

/**
 * RA-8665: the one rule for who acts on add-on billing. Rule 1 below calls it
 * (through billingStanding); the text above the cards reads the cards'
 * verdicts instead (billingAudience).
 */
export function mayManageBilling(
  viewer: Pick<AddonViewer, "isBillingOwner" | "canOpenBillingPages">,
): boolean {
  return viewer.isBillingOwner && viewer.canOpenBillingPages;
}

/**
 * RA-8665: where the viewer stands for rule 1 below. "owner" may act on
 * billing; "staff" belongs to a business and is sent to its owner;
 * "no_business" belongs to none, so there is no owner to send them to. Only
 * the judge reads this; later rules can still refuse an "owner" (a seat for a
 * database role that is not ADMIN, a pack with no workspace).
 */
export type BillingStanding = "owner" | "staff" | "no_business";

export function billingStanding(
  viewer: Pick<AddonViewer, "isBillingOwner" | "canOpenBillingPages" | "inOrganisation">,
): BillingStanding {
  if (mayManageBilling(viewer)) return "owner";
  return viewer.inOrganisation ? "staff" : "no_business";
}

/**
 * RA-8665: the line above the cards, read from the cards' own verdicts. The
 * owner offer shows only when some card offers an owner control, and the
 * ask-your-owner line only when some card says ask_owner. With neither, there
 * is no line: each card already says why. So the text above the cards can
 * never offer what no card offers (review rounds 1-8 found it could while it
 * was judged apart from the cards). The deck applies it to the card states it
 * draws (introAudience), so no reply field can speak for the cards. An action
 * not listed here offers nothing.
 */
export type BillingAudience = "owner" | "staff";

const OWNER_ACTIONS: ReadonlySet<string> = new Set<AddonAction>([
  "buy",
  "add_seat",
  "manage",
  "choose_plan",
]);

export function billingAudience(
  access: Record<string, Pick<AddonAccess, "action">>,
): BillingAudience | null {
  const actions = Object.values(access).map((a) => a.action);
  if (actions.some((a) => OWNER_ACTIONS.has(a))) return "owner";
  if (actions.includes("ask_owner")) return "staff";
  return null;
}

export interface AddonAccess {
  label: AddonLabel;
  holding: AddonHolding;
  action: AddonAction;
  /** One plain sentence saying why, shown on the card. */
  reason: string;
}

export const OWNER_ONLY_REASON =
  "Only your business owner can add or change packs.";
export const TRIAL_PACK_REASON =
  "Not available on the free trial. Packs start once your plan is active.";
export const NO_PLAN_REASON =
  "Packs start once your plan is active. Choose a plan first.";
export const COMPLIMENTARY_REASON =
  "Free in your Founding Trial pilot. There is nothing to buy.";
export const INCLUDED_REASON =
  "Already switched on for your business at no extra charge.";
export const PAID_REASON =
  "Switched on. Billed monthly; cancel any time from Subscription settings.";
export const AVAILABLE_REASON = "Optional. Add it only if your business needs it.";
export const SEAT_ON_TRIAL_REASON =
  "You can add technician seats during the free trial.";

export const COMING_SOON_REASON =
  "Not available yet. It cannot be added at the moment.";
export const NO_WORKSPACE_REASON =
  "This account is not linked to a business workspace, so packs cannot be added here.";
export const NO_BUSINESS_REASON =
  "This account is not part of a business, so packs cannot be added here.";

/**
 * Whether a pack's feature is switched on. Floor Plan Underlay unlocks only
 * the listing-site import, which stays off until its legal kill-switch opens
 * (lib/sketch/underlay-import-flag.ts); uploading a plan needs no pack.
 */
export function addonFeatureLive(sku: string): boolean {
  if (sku === FLOORPLAN_UNDERLAY_SKU) return isUnderlayUrlImportEnabled();
  return true;
}

export function holdingFor(row: AddonHoldingRow | null | undefined): AddonHolding {
  if (!row) return "none";
  if (isComplimentaryEntitlement(row)) return "complimentary";
  if (row.stripeSubscriptionId) return "paid";
  return "included";
}

/**
 * The plan rule add-on checkout enforces, owned here so the card labels and the
 * checkout route cannot disagree: the plan must be ACTIVE, except a technician
 * seat bought during a current trial.
 */
export function planAllowsAddonPurchase(
  perSeat: boolean,
  subscriptionStatus: string | null,
  trialEndsAt: Date | string | null,
  now?: number,
): { allowed: boolean; seatOnTrial: boolean } {
  const seatOnTrial = perSeat && isCurrentTrial(subscriptionStatus, trialEndsAt, now);
  return { allowed: subscriptionStatus === "ACTIVE" || seatOnTrial, seatOnTrial };
}

export function addonAccess(input: {
  perSeat: boolean;
  holding: AddonHolding;
  viewer: AddonViewer;
  /** False when the pack's feature is switched off (see addonFeatureLive). */
  featureLive?: boolean;
  now?: number;
}): AddonAccess {
  const { perSeat, holding, viewer } = input;

  if (holding === "complimentary") {
    return {
      label: "complimentary_pilot",
      holding,
      action: "none",
      reason: COMPLIMENTARY_REASON,
    };
  }
  if (holding === "included") {
    return { label: "included", holding, action: "none", reason: INCLUDED_REASON };
  }

  // A pack whose only feature is switched off is not offered for sale, even
  // though checkout would take the money: it would unlock nothing today.
  if (holding === "none" && input.featureLive === false) {
    return {
      label: "unavailable",
      holding,
      action: "none",
      reason: COMING_SOON_REASON,
    };
  }

  // Rule 1: only the owner acts on billing, and only from pages they may open.
  // Team members, and anyone the billing pages turn away, see the label only.
  // An account in no business has no owner to ask, so it is told that.
  const audience = billingStanding(viewer);
  if (audience === "no_business") {
    return {
      label: "optional_paid",
      holding,
      action: "none",
      reason: NO_BUSINESS_REASON,
    };
  }
  if (audience === "staff") {
    return {
      label: "optional_paid",
      holding,
      action: "ask_owner",
      reason: OWNER_ONLY_REASON,
    };
  }

  if (holding === "paid") {
    // An active seat pack takes one more seat in place; other packs are managed.
    // Another seat is still a purchase, so checkout's plan rule applies first:
    // with the base plan past due it refuses, and the owner can only manage.
    if (
      perSeat &&
      viewer.role === "ADMIN" &&
      planAllowsAddonPurchase(perSeat, viewer.subscriptionStatus, viewer.trialEndsAt, input.now)
        .allowed
    ) {
      return { label: "optional_paid", holding, action: "add_seat", reason: PAID_REASON };
    }
    return { label: "optional_paid", holding, action: "manage", reason: PAID_REASON };
  }

  // Rules 2 and 3, as the checkout route applies them.
  const { allowed, seatOnTrial } = planAllowsAddonPurchase(
    perSeat,
    viewer.subscriptionStatus,
    viewer.trialEndsAt,
    input.now,
  );
  if (!allowed) {
    const onTrial = isCurrentTrial(
      viewer.subscriptionStatus,
      viewer.trialEndsAt,
      input.now,
    );
    return {
      label: "unavailable",
      holding,
      action: "choose_plan",
      reason: onTrial ? TRIAL_PACK_REASON : NO_PLAN_REASON,
    };
  }
  if (perSeat && viewer.role !== "ADMIN") {
    return viewer.inOrganisation
      ? { label: "optional_paid", holding, action: "ask_owner", reason: OWNER_ONLY_REASON }
      : { label: "optional_paid", holding, action: "none", reason: NO_BUSINESS_REASON };
  }
  // Rule 4: checkout refuses, before Stripe, when it would find no workspace
  // to file the purchase on. The answer comes from the function checkout
  // calls (addonCheckoutHasWorkspace), for a seat and for a pack alike.
  if (!(perSeat ? viewer.hasWorkspace.seat : viewer.hasWorkspace.pack)) {
    return {
      label: "unavailable",
      holding,
      action: "none",
      reason: NO_WORKSPACE_REASON,
    };
  }
  return {
    label: "optional_paid",
    holding,
    action: "buy",
    reason: seatOnTrial ? SEAT_ON_TRIAL_REASON : AVAILABLE_REASON,
  };
}

/** Plain words for each label, used on every card. */
export const ADDON_LABEL_TEXT: Record<AddonLabel, string> = {
  included: "Included",
  optional_paid: "Optional, paid",
  unavailable: "Not available yet",
  complimentary_pilot: "Complimentary pilot",
  unknown: "Could not be checked",
};
