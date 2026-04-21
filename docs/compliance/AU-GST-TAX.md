# Australian GST — Stripe Tax Configuration

**Ticket:** RA-1351 (launch-blocker — AU GST missing)

## Legal obligation

A New Tax System (Goods and Services Tax) Act 1999 requires:

- 10 % GST charged on taxable supplies to AU customers
- ATO-compliant tax invoice: supplier ABN, "Tax Invoice" label, GST line, purchaser details (>$82.50)
- 15 % GST Act 1985 for NZ customers (separate tax jurisdiction)

Under-collection → ATO liability on RestoreAssist. Non-compliant invoices → customers can't claim input tax credits → churn risk.

## What this PR ships (code)

- **`automatic_tax: { enabled: true }`** on every Stripe checkout session — Stripe Tax auto-applies the correct rate based on customer location (10 % AU / 15 % NZ / 0 % other)
- **`tax_id_collection: { enabled: true }`** — ABN collection for AU business customers (enables input tax credit claim) + GST number for NZ
- **`tax_behavior: "inclusive"`** on dynamically-created AUD prices — list price includes GST; Stripe breaks it out on the invoice rather than adding on top
- **`customer_update: { name: "auto", address: "auto" }`** — pushes customer address + name from the checkout form onto the Customer object so subsequent invoices resolve the right tax jurisdiction

## What the user still needs to do (Stripe dashboard — ≈ 10 min)

### 1. Enable Stripe Tax

1. Stripe Dashboard → **Tax** → **Activate**
2. Register **Australia** as a collection jurisdiction
3. Add the company's **ABN**: `95 691 477 844` (per the current pricing page footer — confirm with accountant)
4. Register **New Zealand** if serving NZ customers
5. Accept the Stripe Tax terms of service

### 2. Tax invoice configuration

Stripe Dashboard → **Invoice settings**:

- **Supplier details:** Company name + ABN (printed on every invoice)
- **Invoice branding:** upload logo, set brand colours
- **Footer:** add "ABN 95 691 477 844" if not already
- **Memo template:** include "Tax Invoice" label — required for AU compliance

### 3. Register new products/prices with tax_code

For existing Stripe Products that back the MONTHLY_PLAN / YEARLY_PLAN prices, set the **Tax Code** to `txcd_10103001` (SaaS / cloud-based software) so Stripe knows the correct jurisdiction rules apply.

Products without a tax_code use Stripe's default inference, which works for AU but the explicit code is more robust.

## NZ (15 % GST)

Stripe Tax handles the rate switch automatically when the customer's address is NZ. No code change needed — just register NZ as a collection jurisdiction in the dashboard.

## Webhooks

No webhook change in this PR. Stripe's `invoice.finalized` already fires with the tax breakdown in `invoice.total_tax_amounts` — if we want to snapshot GST amounts onto our local Invoice model, that's a follow-up ticket.

## Verification

- [ ] Create a test subscription with a NSW address → invoice shows 10 % GST line + supplier ABN
- [ ] Create a test subscription with a NZ address → invoice shows 15 % GST line
- [ ] Create a test subscription with a US address → no GST charged
- [ ] Enter a valid ABN at checkout → invoice includes "ABN: ..." on the customer-details line
- [ ] Download the invoice PDF — labelled "Tax Invoice", formatted per ATO rules

## Follow-up tickets

- `RA-xxx` — apply the same `automatic_tax` / `tax_behavior` to `/api/invoices/[id]/checkout` + `/api/checkout-lifetime` + `/api/addons/checkout` (the 3 other checkout routes — less trafficked, can stagger)
- `RA-xxx` — snapshot GST amounts onto local Invoice model from `invoice.finalized` webhook so reporting doesn't need to call Stripe
- `RA-xxx` — ensure Xero sync (RA-854/855) maps the Stripe GST line to the correct Xero tax rate code (GST on income / GST free)

## Why this matters beyond compliance

- Without ABN collection, AU business customers can't claim back the 10 % GST on their BAS — effectively a 10 % price hike for them, churn risk
- Without tax_behavior=inclusive, our advertised "$99/mo" would become "$108.90/mo" at checkout — price shock / chargeback risk
- Without `customer_update`, re-billing months later against a stale address → wrong tax jurisdiction → ATO liability
