# RA-6922 — Floor Plan Underlay recurring add-on ($11/mo)

## Summary

The internet-floorplan-overlay feature (fetch a property's floor plan from a
listing site and trace it on the sketch canvas) is fully built but dark behind a
three-layer gate. This work delivers **layer 2**: a recurring **$11/month AUD
(GST-inclusive)** Stripe subscription add-on whose active `FeatureEntitlement`
unlocks the feature per-workspace.

### The three-layer gate

1. **Legal flag** `NEXT_PUBLIC_UNDERLAY_URL_IMPORT` — env kill-switch for the URL
   scrape path. Left untouched; a launch step, not part of this change.
   [VERIFIED lib/sketch/underlay-import-flag.ts] [VERIFIED components/sketch/FloorPlanUnderlayLoader.tsx:95]
2. **Entitlement** — was `hasFloorPlanUnderlay()` returning a hardcoded `false`.
   [VERIFIED lib/billing/floor-plan-entitlement.ts:17-22 (pre-change)] **This change wires it.**
3. **BYOK scraping providers** — already built. [VERIFIED lib/scraping/dispatch.ts via app/api/properties/scrape/route.ts:32]

## User stories

- **Owner / admin (workspace owner or ACTIVE member):** As the account holder, I
  can add the Floor Plan Underlay to my subscription for $11/month so my team can
  auto-fetch floor plans. I start checkout from the upgrade CTA that appears when
  the feature is used without the add-on.
- **Technician:** As a field technician tracing a sketch, when I try to fetch a
  floor plan and my workspace lacks the add-on, I see a clear "$11/month" upgrade
  CTA (not a dead end) and can still upload a plan manually.
- **Any member after purchase:** Once the subscription is active, the floor-plan
  fetch works for everyone in the workspace; if it lapses (canceled / unpaid),
  the feature re-locks automatically.

## Acceptance criteria (Given / When / Then)

1. **Gate — not entitled.** Given a workspace with no active `FeatureEntitlement`
   for `FLOORPLAN_UNDERLAY`, When it POSTs `/api/properties/scrape`, Then the
   response is **402** (`ADDON_REQUIRED`) and no outbound scrape runs.
   [VERIFIED app/api/properties/scrape/route.ts + entitlement-gate.test.ts]
2. **Gate — entitled.** Given an active entitlement, When the same request is
   made, Then the gate is cleared and the handler proceeds.
3. **Checkout — recurring.** Given an authenticated user on an ACTIVE base plan,
   When they POST `/api/addons/checkout` with `{ addonKey: "FLOORPLAN_UNDERLAY" }`,
   Then a Stripe Checkout Session is created with `mode: "subscription"`, a single
   inline `price_data` line (AUD, `unit_amount: 1100`, `tax_behavior: "inclusive"`,
   `recurring: { interval: "month" }`), and no pre-created Stripe product/price.
4. **Checkout — no workspace.** Given the user has no workspace, Then the checkout
   returns **404** and creates no Stripe session.
5. **Checkout — base plan required.** Given the user's `subscriptionStatus` is not
   `ACTIVE`, Then the checkout returns **403** `upgradeRequired`.
6. **Webhook — grant.** Given a `customer.subscription.created` / `.updated` for a
   subscription whose `metadata.type = "floorplan_underlay_addon"` with status
   `active`/`trialing`, Then the workspace's `FeatureEntitlement` is upserted with
   `active: true` and the Stripe subscription + price ids stored (idempotent).
7. **Webhook — revoke.** Given the same subscription becomes `canceled`/`unpaid`,
   or `customer.subscription.deleted` fires, Then `active` is set to `false`.
8. **Webhook — isolation.** The add-on subscription events must NOT alter the
   user's base-plan fields (`subscriptionId`, `subscriptionStatus`), and the
   base-plan `subscription.deleted` handler (with its email fallback) must NOT run
   for an add-on subscription. [VERIFIED app/api/webhooks/stripe/route.ts branches]
9. **UX.** The upgrade CTA POSTs `/api/addons/checkout` for the SKU and redirects
   to the returned Stripe URL. [VERIFIED components/sketch/FloorPlanUnderlayLoader.tsx]
10. **Signature + idempotency unchanged.** The webhook still verifies the Stripe
    signature and dedupes events; the new handler only adds an idempotent upsert.

## Non-goals

- **Does NOT convert the existing one-time add-ons.** The report-pack add-ons
  (`pack8` / `pack25` / `pack60`) stay `mode: "payment"` one-time purchases.
  [VERIFIED lib/pricing.ts:81-108, app/api/addons/checkout/route.ts one-time path]
- **Does NOT wire the other scaffold SKUs** (VOICE / TECHNICIAN_SEATS /
  BOOKKEEPING / SERVICE_CRM / PAYMENTS) to any checkout or surface.
- **Does NOT touch the legal flag** `NEXT_PUBLIC_UNDERLAY_URL_IMPORT` or Vercel env.
- **Does NOT gate manual upload.** Only the outbound scrape (the cost-bearing path)
  is entitlement-gated; manual floor-plan upload remains available.
- **No new Stripe product/price object.** The price is inline at checkout.
