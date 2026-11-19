/**
 * RA-8466 — what a viewer can do with each Field Add-On, and how its card is
 * labelled. Pure, so it is table-tested.
 *
 * Every rule here mirrors a check POST /api/addons/checkout runs, in the same
 * order, using the same helpers, so a card never offers a button the server
 * would refuse:
 *   1. refuseNonOwner: only the business owner (or a solo operator) buys.
 *   2. The plan must be ACTIVE, except a technician seat during a current trial.
 *   3. A seat needs the database role ADMIN.
 *   4. A pack held free in the Founding Trial is never sold.
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
  | "complimentary_pilot";

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
  /** Database role. A seat needs ADMIN. */
  role: string | null;
  subscriptionStatus: string | null;
  trialEndsAt: Date | string | null;
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
  "Coming soon. It cannot be added yet.";

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

  // Rule 1: only the owner acts on billing. Team members see the label only.
  if (!viewer.isBillingOwner) {
    return {
      label: "optional_paid",
      holding,
      action: "ask_owner",
      reason: OWNER_ONLY_REASON,
    };
  }

  if (holding === "paid") {
    // An active seat pack takes one more seat in place; other packs are managed.
    if (perSeat && viewer.role === "ADMIN") {
      return { label: "optional_paid", holding, action: "add_seat", reason: PAID_REASON };
    }
    return { label: "optional_paid", holding, action: "manage", reason: PAID_REASON };
  }

  // Rules 2 and 3, as the checkout route applies them.
  const seatOnTrial =
    perSeat && isCurrentTrial(viewer.subscriptionStatus, viewer.trialEndsAt, input.now);
  if (viewer.subscriptionStatus !== "ACTIVE" && !seatOnTrial) {
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
    return {
      label: "optional_paid",
      holding,
      action: "ask_owner",
      reason: OWNER_ONLY_REASON,
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
};
