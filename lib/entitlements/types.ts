/**
 * RA-6922 (P1) — Feature entitlement types for the BYOK monetisation add-ons.
 *
 * The base plan ($99/month AUD) covers the core CRM. Five $11/month add-ons
 * are sold on top (byok-monetisation-spec §2). Whether a workspace has an
 * add-on is stored per-workspace in the `FeatureEntitlement` table and gated
 * at each add-on's surface by `requireAddon()`.
 *
 * This module is the single source of truth for the add-on SKU keys and
 * mirrors the Prisma `AddonSku` enum (the same pattern `provider-connections`
 * uses to mirror `AiProvider`). Nothing here is enforced yet — the guard is
 * not wired into any live surface in this PR.
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
  /** RA-6922: Floor Plan Underlay — recurring $11/mo internet-floorplan-overlay. */
  "FLOORPLAN_UNDERLAY",
  /** RA-6954: Restoration Pulse client-comms — recurring $11/mo client-facing email updates. */
  "CLIENT_COMMS",
] as const;

/** Mirrors the Prisma `AddonSku` enum. */
export type AddonSku = (typeof ADDON_SKUS)[number];

/** Runtime type-guard for an untrusted add-on key at a system boundary. */
export function isAddonSku(value: string): value is AddonSku {
  return (ADDON_SKUS as readonly string[]).includes(value);
}
