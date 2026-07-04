# RA-6922 — Implementation plan / touch-points

Build ON the existing RA-6922 scaffold (AddonSku enum, FeatureEntitlement model,
requireAddon guard) and the existing addon checkout + Stripe webhook. No reinvention.

## 1. Schema + migration

- `prisma/schema.prisma` — add `FLOORPLAN_UNDERLAY` to `enum AddonSku`.
- `prisma/migrations/20260705010000_ra6922_floorplan_underlay_addon_sku/migration.sql`
  — `ALTER TYPE "AddonSku" ADD VALUE IF NOT EXISTS 'FLOORPLAN_UNDERLAY';`. Ordered
  after `20260705000000_ra_6922_feature_entitlement` (which creates the type).
  Hand-authored: no local DB, so `prisma migrate dev --create-only` cannot connect
  (repo runs no local Postgres). `pnpm prisma:generate` run to refresh the client.

## 2. SSOT constant module (new)

- `lib/billing/floorplan-underlay-addon.ts` — `FLOORPLAN_UNDERLAY_SKU`,
  `FLOORPLAN_ADDON_SUBSCRIPTION_TYPE`, `FLOORPLAN_UNDERLAY_ADDON` (price $11 AUD,
  GST-inclusive, monthly). Shared by checkout + webhook + client so the SKU key,
  price and subscription-metadata marker never drift.
- `lib/entitlements/types.ts` — add `FLOORPLAN_UNDERLAY` to `ADDON_SKUS` (mirrors the enum).

## 3. Entitlement gate (layer 2)

- `app/api/properties/scrape/route.ts` — replace the `hasFloorPlanUnderlay(tier)`
  gate with `requireAddon(userId, FLOORPLAN_UNDERLAY_SKU)` → fail-closed 402.
- Delete `lib/billing/floor-plan-entitlement.ts` + its test — the hardcoded-false
  predicate is fully superseded by the real entitlement resolution; all call sites
  updated (no dead code).
- `components/sketch/SketchEditor.tsx` + `SketchEditorV2.tsx` — remove the
  `hasFloorPlanUnderlay(null)` render gate so the loader renders; the server 402
  is now authoritative and drives the upgrade CTA.

## 4. Recurring checkout

- `app/api/addons/checkout/route.ts` — branch when `addonKey === FLOORPLAN_UNDERLAY_SKU`:
  reuse auth + base-subscription ACTIVE check + Stripe customer resolution, then
  create a `mode: "subscription"` session with inline recurring `price_data`
  ($11 AUD, `tax_behavior: "inclusive"`, `recurring.interval: "month"`). Stamp the
  subscription (`subscription_data.metadata`) with `type`, `sku`, `workspaceId`,
  `userId` so the webhook can route + toggle the entitlement. One-time report-pack
  path unchanged.

## 5. Webhook lifecycle → entitlement

- `app/api/webhooks/stripe/route.ts` — new exported `handleFloorplanAddonSubscription()`:
  recognises subscriptions with `metadata.type === FLOORPLAN_ADDON_SUBSCRIPTION_TYPE`,
  upserts the workspace's `FeatureEntitlement` (`active` = status active/trialing),
  stores stripeSubscriptionId + stripePriceId, idempotent via the (workspaceId, sku)
  unique. Branched FIRST into `customer.subscription.created/updated/deleted` so the
  base-plan handlers never run for an add-on subscription id. Signature verification
  + event dedupe untouched.

## 6. UX

- `components/sketch/FloorPlanUnderlayLoader.tsx` — on the `upgradeRequired` (402)
  state, render an "Add Floor Plan Underlay — $11/month" CTA that POSTs
  `/api/addons/checkout` for the SKU and redirects to the returned Stripe URL
  (mirrors `app/dashboard/pricing/page.tsx`).

## 7. Tests (vitest, mock Prisma/Stripe as siblings do)

- `lib/entitlements/__tests__/require-addon.test.ts` — explicit FLOORPLAN_UNDERLAY
  entitled→allow / not→402.
- `app/api/properties/scrape/__tests__/entitlement-gate.test.ts` — rewritten to the
  requireAddon path (not entitled → 402, entitled → proceeds).
- `app/api/properties/scrape/__tests__/cache-read-filter.test.ts` — mock updated to
  `@/lib/entitlements` requireAddon.
- `app/api/addons/checkout/__tests__/route.test.ts` — subscription-mode session for
  the SKU (inline $11/mo recurring price, metadata, 404 no-workspace, 403 no base plan).
- `app/api/webhooks/stripe/__tests__/floorplan-addon-entitlement.test.ts` — new;
  active toggling on/off, idempotent upsert, non-floor-plan → not claimed.

## Launch steps (post-merge, owner)

1. Set `NEXT_PUBLIC_UNDERLAY_URL_IMPORT=true` in Vercel + redeploy (legal flag).
2. Each workspace configures a BYOK scraping provider key (or uses SHARED default).
3. Apply the migration on deploy (`prisma migrate deploy`).
