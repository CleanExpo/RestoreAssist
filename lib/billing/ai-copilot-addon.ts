/**
 * Margot AI Co-pilot recurring add-on (SSOT).
 *
 * Layer 2 gate on the technician co-pilot — the `app/api/live-teacher/*` routes
 * that answer standards questions with clause citations and write findings into
 * the job (`take_reading`, `fill_scope_item`, `flag_whs_hazard`,
 * `check_report_gaps`). A recurring $11/month AUD subscription add-on whose
 * active `FeatureEntitlement` (sku AI_COPILOT) unlocks it.
 *
 * WHAT CHANGES. Until this SKU, the co-pilot was gated ONLY on an active base
 * subscription plus a workspace-supplied Anthropic key
 * (`app/api/live-teacher/turn/route.ts`), which meant it was bundled into the
 * $99/month base plan for any workspace that brought a key. RestoreAssist is the
 * CRM; every other function is a bolt-on, and the co-pilot is one.
 *
 * BYOK IS NOT THE SAME AS ENTITLEMENT. The workspace key covers the *model*
 * cost, which is why the co-pilot could be given away without a metering
 * problem. This add-on charges for the product built on top of it — the
 * standards grounding, the tool set and the write-back into the job.
 *
 * GRANDFATHERING IS MANDATORY BEFORE THE GATE GOES LIVE. Workspaces already
 * using the co-pilot must be backfilled by
 * `scripts/grandfather-ai-copilot-addon.ts`, or the gate silently removes a
 * feature they are already relying on mid-job. CLIENT_COMMS hit exactly this
 * and `scripts/grandfather-client-comms-addon.ts` is the precedent to copy.
 *
 * FLAT, PER COMPANY — never per technician. `perSeat` is deliberately absent, so
 * the shared checkout bills Stripe `quantity: 1` and the webhook leaves
 * `FeatureEntitlement.seats` null. Every technician on the workspace gets the
 * co-pilot for the one price. TECHNICIAN_SEATS is the ONLY quantity-based
 * add-on.
 *
 * Registered in `lib/billing/addon-registry.ts`, which both
 * `app/api/addons/checkout/route.ts` and `app/api/webhooks/stripe/route.ts`
 * read from — no edits needed to either route for this add-on.
 */

/** The Prisma `AddonSku` value for this add-on (mirrors ADDON_SKUS). */
export const AI_COPILOT_SKU = "AI_COPILOT" as const;

/**
 * `subscription_data.metadata.type` stamped on the Stripe Subscription at
 * checkout. The webhook reads it off `subscription.metadata` to distinguish
 * this add-on subscription from the base $99/month plan subscription (which
 * must NOT touch FeatureEntitlement) and from every other add-on. MUST stay
 * globally unique across the registry.
 */
export const AI_COPILOT_ADDON_SUBSCRIPTION_TYPE = "ai_copilot_addon" as const;

/**
 * Recurring price for the add-on. GST-inclusive (AU convention) so Stripe Tax
 * breaks out the 10% GST component rather than adding it on top of $11. Do not
 * re-derive GST here — `lib/gst-rules.ts` is the SSOT (AU 10%, NZ 15%).
 */
export const AI_COPILOT_ADDON = {
  sku: AI_COPILOT_SKU,
  name: "Margot AI Co-pilot",
  description:
    "On-site standards answers, voice capture and findings written straight into the job.",
  /** Dollars, AUD, GST-inclusive. */
  amount: 11.0,
  currency: "AUD",
  interval: "month",
} as const;
