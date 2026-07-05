/**
 * RA-6920 B0 — Recurring add-on registry (SSOT of SSOTs).
 *
 * The BYOK-monetisation epic sells several $11/month recurring add-ons on top
 * of the base plan. Each add-on is a SEPARATE Stripe subscription, priced
 * inline (`price_data`, no pre-created Stripe product), whose active
 * `FeatureEntitlement` unlocks its gated surface.
 *
 * This registry is the single data-driven spine both shared route files read:
 *   - app/api/addons/checkout/route.ts  looks up the descriptor by addon key
 *     and builds the subscription checkout from it (no per-SKU branch).
 *   - app/api/webhooks/stripe/route.ts  looks up the descriptor by the
 *     subscription metadata marker and upserts/expires its FeatureEntitlement.
 *
 * Adding a new recurring add-on (VOICE, BOOKKEEPING, PAYMENTS) is a ONE-LINE
 * change here — drop in its `lib/billing/*-addon.ts` SSOT and register it
 * below — with ZERO edits to the two route files.
 *
 * FLOORPLAN_UNDERLAY (shipped in #1728) and SERVICE_CRM (RA-6920 B1) are each
 * sourced directly from their own SSOT so their SKU, price and metadata
 * marker never drift.
 */

import type { AddonSku } from "@/lib/entitlements/types";
import {
  FLOORPLAN_UNDERLAY_ADDON,
  FLOORPLAN_ADDON_SUBSCRIPTION_TYPE,
} from "./floorplan-underlay-addon";
import {
  BOOKKEEPING_ADDON,
  BOOKKEEPING_ADDON_SUBSCRIPTION_TYPE,
} from "./bookkeeping-addon";
import {
  SERVICE_CRM_ADDON,
  SERVICE_CRM_ADDON_SUBSCRIPTION_TYPE,
} from "./service-crm-addon";
import {
  PAYMENTS_ADDON,
  PAYMENTS_ADDON_SUBSCRIPTION_TYPE,
} from "./payments-addon";

/**
 * The data-driven descriptor for one recurring add-on. Everything the checkout
 * route and the webhook need to price, stamp and recognise the add-on, with no
 * per-SKU code branches.
 */
export interface RecurringAddonDescriptor {
  /** Prisma `AddonSku` value; also the `FeatureEntitlement.sku` entitlement key. */
  readonly sku: AddonSku;
  /** Buyer-facing product name on the Stripe checkout line item. */
  readonly name: string;
  /** Buyer-facing description stamped on the line item product metadata. */
  readonly description: string;
  /** Recurring price in dollars, GST-inclusive (AU convention). */
  readonly amount: number;
  /** ISO currency code, e.g. "AUD". */
  readonly currency: string;
  /** Stripe recurring interval. */
  readonly interval: "month" | "year";
  /**
   * The `subscription_data.metadata.type` value stamped on the Stripe
   * Subscription at checkout, read back off `subscription.metadata.type` in the
   * webhook to recognise this add-on's lifecycle events. MUST be globally unique
   * across the registry so the reverse lookup is unambiguous.
   */
  readonly subscriptionType: string;
}

/**
 * The recurring add-on registry, keyed by add-on key (the Prisma `AddonSku`).
 * Register each add-on from its own `lib/billing/*-addon.ts` SSOT so there is a
 * single source for its price and metadata marker.
 */
export const RECURRING_ADDONS: Readonly<
  Record<string, RecurringAddonDescriptor>
> = {
  [FLOORPLAN_UNDERLAY_ADDON.sku]: {
    sku: FLOORPLAN_UNDERLAY_ADDON.sku,
    name: FLOORPLAN_UNDERLAY_ADDON.name,
    description: FLOORPLAN_UNDERLAY_ADDON.description,
    amount: FLOORPLAN_UNDERLAY_ADDON.amount,
    currency: FLOORPLAN_UNDERLAY_ADDON.currency,
    interval: FLOORPLAN_UNDERLAY_ADDON.interval,
    subscriptionType: FLOORPLAN_ADDON_SUBSCRIPTION_TYPE,
  },
  [BOOKKEEPING_ADDON.sku]: {
    sku: BOOKKEEPING_ADDON.sku,
    name: BOOKKEEPING_ADDON.name,
    description: BOOKKEEPING_ADDON.description,
    amount: BOOKKEEPING_ADDON.amount,
    currency: BOOKKEEPING_ADDON.currency,
    interval: BOOKKEEPING_ADDON.interval,
    subscriptionType: BOOKKEEPING_ADDON_SUBSCRIPTION_TYPE,
  },
  [SERVICE_CRM_ADDON.sku]: {
    sku: SERVICE_CRM_ADDON.sku,
    name: SERVICE_CRM_ADDON.name,
    description: SERVICE_CRM_ADDON.description,
    amount: SERVICE_CRM_ADDON.amount,
    currency: SERVICE_CRM_ADDON.currency,
    interval: SERVICE_CRM_ADDON.interval,
    subscriptionType: SERVICE_CRM_ADDON_SUBSCRIPTION_TYPE,
  },
  [PAYMENTS_ADDON.sku]: {
    sku: PAYMENTS_ADDON.sku,
    name: PAYMENTS_ADDON.name,
    description: PAYMENTS_ADDON.description,
    amount: PAYMENTS_ADDON.amount,
    currency: PAYMENTS_ADDON.currency,
    interval: PAYMENTS_ADDON.interval,
    subscriptionType: PAYMENTS_ADDON_SUBSCRIPTION_TYPE,
  },
};

/**
 * Look up a recurring add-on by its add-on key (the value POSTed to the checkout
 * route). Returns `undefined` for a non-recurring key (e.g. a one-time report
 * pack), which the checkout route treats as "fall through to the one-time path".
 */
export function getRecurringAddon(
  addonKey: string,
): RecurringAddonDescriptor | undefined {
  return RECURRING_ADDONS[addonKey];
}

/**
 * Reverse lookup used by the Stripe webhook: resolve a recurring add-on from the
 * `subscription.metadata.type` marker stamped at checkout. Returns `undefined`
 * when the subscription is not one of our add-ons (e.g. the base plan).
 */
export function getRecurringAddonBySubscriptionType(
  subscriptionType: string,
): RecurringAddonDescriptor | undefined {
  return Object.values(RECURRING_ADDONS).find(
    (descriptor) => descriptor.subscriptionType === subscriptionType,
  );
}
