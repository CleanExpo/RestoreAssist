/**
 * RA-6920 B2 — ElevenLabs Voice recurring add-on (SSOT).
 *
 * Layer 2 gate on the customer-facing ElevenLabs voice surface
 * (`app/api/elevenlabs/sfx/route.ts`). A recurring $11/month AUD subscription
 * add-on whose active `FeatureEntitlement` (sku VOICE) unlocks spending the
 * workspace's own ElevenLabs BYOK key on voice/SFX generation. Priced inline
 * via Stripe `price_data` at checkout, so NO pre-created Stripe product or
 * price is required. Mirrors the shipped FLOORPLAN_UNDERLAY add-on (#1728).
 *
 * Composes with the #1801 BYOK gate: a workspace must have BOTH its own
 * ElevenLabs API key configured (`resolveWorkspaceElevenLabsKey` → 402 if
 * absent) AND an active VOICE entitlement (`requireAddon` → 402 if absent).
 * The two gates check different things — key presence vs. billing — and
 * neither substitutes for the other.
 *
 * Registered in `lib/billing/addon-registry.ts`, which both
 * `app/api/addons/checkout/route.ts` and `app/api/webhooks/stripe/route.ts`
 * read from — no edits needed to either route for this add-on.
 */

/** The Prisma `AddonSku` value for this add-on (mirrors ADDON_SKUS). */
export const VOICE_SKU = "VOICE" as const;

/**
 * `subscription_data.metadata.type` stamped on the Stripe Subscription at
 * checkout. The webhook reads it off `subscription.metadata` to distinguish
 * this add-on subscription from the base $99/month plan subscription (which
 * must NOT touch FeatureEntitlement) and from every other add-on.
 */
export const VOICE_ADDON_SUBSCRIPTION_TYPE = "voice_addon" as const;

/**
 * Recurring price for the add-on. GST-inclusive (AU convention) so Stripe Tax
 * breaks out the 10% GST component rather than adding it on top of $11.
 */
export const VOICE_ADDON = {
  sku: VOICE_SKU,
  name: "ElevenLabs Voice",
  description: "Generate voiceovers and sound effects with your own ElevenLabs key.",
  /** Dollars, AUD, GST-inclusive. */
  amount: 11.0,
  currency: "AUD",
  interval: "month",
} as const;
