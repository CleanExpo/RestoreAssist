/**
 * RA-6922 (P1) — Feature entitlement types for the BYOK monetisation add-ons.
 *
 * The base plan ($99/month AUD) covers the core CRM. Recurring add-ons are
 * mostly $11/month; Floor Plan Underlay is $9.95/month (byok-monetisation-spec
 * §2). Whether a workspace has an add-on is stored per-workspace in the
 * `FeatureEntitlement` table and gated at each add-on's surface by
 * `requireAddon()`.
 *
 * This module is the single source of truth for the add-on SKU keys and
 * mirrors the Prisma `AddonSku` enum (the same pattern `provider-connections`
 * uses to mirror `AiProvider`).
 *
 * The "nothing here is enforced yet" note this header used to carry has been
 * false since the P2 wiring landed: CLIENT_COMMS gates the Pulse sends,
 * SERVICE_CRM gates Ascora/DR-NRPG connect, BOOKKEEPING gates the bookkeeping
 * OAuth, PAYMENTS gates invoice payments, FLOORPLAN_UNDERLAY gates the scrape
 * and VOICE gates the ElevenLabs SFX route. Treat every SKU here as live.
 */

/**
 * The billable add-on SKUs (byok-monetisation-spec §2). Ordered array is the
 * runtime source of truth; the Prisma `AddonSku` enum mirrors these keys.
 */
export const ADDON_SKUS = [
  /** ElevenLabs Voice — client's own ElevenLabs API key + Voice ID. */
  "VOICE",
  /** Field Technician seats — per-seat, enforced at job assignment. */
  "TECHNICIAN_SEATS",
  /** Online Bookkeeping Connection — Xero / QuickBooks / MYOB. */
  "BOOKKEEPING",
  /** Service CRM Connection — Ascora / DR-NRPG. */
  "SERVICE_CRM",
  /** Payments Collection — Stripe Connect on the client's own account. */
  "PAYMENTS",
  /** RA-6922: Floor Plan Underlay — recurring $9.95/mo internet-floorplan-overlay. */
  "FLOORPLAN_UNDERLAY",
  /** RA-6954: Restoration Pulse client-comms — recurring $11/mo client-facing email updates. */
  "CLIENT_COMMS",
  /** Client education library + /learn kiosk on the client portal — recurring $11/mo. */
  "CLIENT_EDUCATION",
  /** Margot technician co-pilot (the live-teacher routes) — recurring $11/mo. */
  "AI_COPILOT",
] as const;

/** Mirrors the Prisma `AddonSku` enum. */
export type AddonSku = (typeof ADDON_SKUS)[number];

/** Runtime type-guard for an untrusted add-on key at a system boundary. */
export function isAddonSku(value: string): value is AddonSku {
  return (ADDON_SKUS as readonly string[]).includes(value);
}
