---
type: concept
name: directory-listing-pack-2026-08-25
description: Fill-in-the-form copy blocks and target list for association and directory listings
okf_version: "0.1"
updated: 2026-08-25
---

# RestoreAssist — Directory & Association Listing Pack

Every block below is fill-in-the-form ready. Each listing is a referring domain. RIA week is the window — association listings during a show get processed fast.

## Standing facts

| Field | Value |
| --- | --- |
| Company | Unite-Group Nexus Pty Ltd |
| ABN | 62 580 077 456 |
| Product | RestoreAssist · <https://restoreassist.app> |
| Category | Restoration / Field Service / Construction Software |
| Pricing | Free 15-day trial · $99 AUD/month · add-ons from $11 |
| Markets | Australia, New Zealand |
| Founded | 2026 |

**ABN verified.** `62 580 077 456` passes the ATO weighted-modulus check (weighted sum 534, mod 89 = 0) and the repo's own `isValidABN` in `lib/sanitize.ts`. Safe to put on forms.

**Verified against `lib/pricing.ts`:** 15-day trial, 50 report credits, no card; $99 AUD/month; 50 reports/month; add-ons $11. **GST-inclusivity of the $99 is confirmed** — `app/pricing/page.tsx:239` renders "AUD, incl. GST" and `components/pricing/CostDisclosure.tsx:282` states plan pricing includes GST. An earlier draft called this unverifiable; that was wrong, and it was wrong because I checked `lib/pricing.ts` alone and stopped. **Still owner-supplied:** the CARSI IICRC CEC registration and the 2026 founding date — fine to state, just not repo-checkable.

---

## Reusable blocks

Most forms want one of these four lengths. Same text everywhere: consistency across directories is itself a ranking signal.

### One-liner (under 100 chars)

```text
Restoration software for Australian contractors — site capture to IICRC S500:2021 reports.
```

### Short (under 300 chars)

```text
RestoreAssist is Australian-designed restoration management software. Capture the site from your phone, and reports build on IICRC S500:2021 section structure from what you actually recorded. Built for the contractor, not the insurer. AU and NZ. From $99/month.
```

### Medium (under 800 chars)

```text
RestoreAssist is restoration management software designed in Australia for Australian and New Zealand contractors.

Field technicians capture the site on a phone — photos, moisture readings, scope notes. Reports build on IICRC S500:2021 section structure from recorded data rather than reconstructed memory. Evidence carries its real capture metadata: if a photo didn't record a GPS location, the report says so instead of substituting a plausible one.

Built around Australian compliance — GST, NCC 2022, state WHS regimes and regulators — rather than adapted from a US product.

Unusually, report generation runs on the customer's own Anthropic or OpenAI key. The provider bills them directly at cost; RestoreAssist takes no margin, and says so on its pricing page.

15-day free trial, 50 reports, no credit card. $99 AUD/month thereafter.
```

### Long (1500+ chars) — association profiles and press

```text
RestoreAssist is restoration management software built in Australia for restoration contractors across Australia and New Zealand.

Most platforms in this sector are built around the insurer's workflow. RestoreAssist is built around the contractor's. Field technicians capture the site on a phone while standing in it — photographs, moisture readings, scope notes — and reports build on IICRC S500:2021 section structure from what was recorded on site rather than reconstructed later.

Evidence integrity is treated as a product requirement. Photographs carry their real capture metadata. Where a device did not record a GPS location, the report states that the location was not recorded rather than substituting a plausible value. Documentation that fabricates provenance fails the first time it is challenged, which is precisely when it matters.

Australian and New Zealand regulatory context is built into the workflow rather than appended: GST at AU and NZ rates, NCC 2022, state work health and safety regimes, and the relevant state regulators.

Cost transparency is a deliberate design choice. Report generation runs on the customer's own Anthropic or OpenAI API key — the provider bills the customer directly at cost, and RestoreAssist takes no margin or share. The pricing page discloses this alongside every optional add-on, and states plainly which paid features are not yet enforced server-side.

RestoreAssist is a product of Unite-Group Nexus Pty Ltd (ABN 62 580 077 456), which also operates CARSI, a provider of IICRC CEC-registered restoration training.

Pricing: 15-day free trial with 50 inspection report credits, no credit card required. $99 AUD per month for 50 reports. Optional add-ons from $11 per month.
```

### Taglines

- From site to signed report. One system.
- Built for the contractor. Not the insurer.
- Australian restoration software that admits what it doesn't know.

### Keywords / tags

`restoration software` · `water damage` · `IICRC S500` · `Australia` · `New Zealand` · `field service` · `inspection reports` · `mould remediation` · `structural drying` · `insurance claims` · `NCC 2022` · `restoration CRM`

---

## Priority 1 — Associations (RIA week)

**Restoration Industry Association — restorationindustry.org (AS 39).** The highest-relevance link available; they already link to Encircle. Membership → Supplier/Vendor or Corporate. Use the Long block, logo, ABN, contact. Angle: an ANZ-based supplier serving RIA members in the Australian and New Zealand market. May carry a membership fee — worth it for the link alone, and it is a genuine industry relationship.

**RIA Australasia.** Regional chapter; Encircle cannot have this. Find the current ANZ chapter contact and apply as a supplier member.

**IICRC — iicrc.org.** A relationship already exists through CARSI's CEC registration. Check whether an approved-provider or partner listing exists and whether RestoreAssist can be listed separately from CARSI. One sentence in Thursday's board meeting.

**State and national bodies:** Australian Cleaning & Restoration Association · Master Builders state chapters (supplier directories) · Australian Institute of Building · NZ equivalents.

## Priority 2 — Directories (self-serve)

**Zapier — zapier.com (AS 75).** Encircle has 159 backlinks from it. Highest-authority link here, and real distribution as well as SEO. Xero and Ascora already integrate, so the integration story is legitimate. Zapier Developer Platform → build integration → submit. Requires dev work; start now, ship later.

**AlternativeTo — alternativeto.net (AS 53).** Free. Submit as an alternative to Encircle, Xactimate, DASH, Restoration Manager. That is the whole positioning: "Australian alternative to Encircle." Short block plus screenshots.

**WebCatalog (AS 59) · Comparably (AS 52) · SiteLike (AS 42) · FitGap (AS 34).** Free submissions. Medium block, logo, screenshots, pricing.

**Australian SaaS directories.** Smaller domains, AU-relevant, and Encircle is not in them.

**G2 / Capterra / GetApp.** Free vendor profiles; slow burn but high value — buyers comparing restoration software land here. Do not solicit reviews from customers who have not used the product. Both platforms police it and it backfires.

## Priority 3 — Press

**Pitch angle:** *"Australian restoration software publishes the costs it doesn't charge you."*

The pricing page names the customer's AI provider spend, states RestoreAssist takes no margin on it, and refuses to publish a per-report estimate it cannot stand behind. It also lists which paid features are not yet enforced server-side. That is the opposite of standard SaaS pricing practice, and it is verifiable in thirty seconds.

Targets: Insurance News AU · Insurance Business AU · Industry Update · SmartCompany · StartupDaily · Australian Fintech (Xero/MYOB integration angle).

## Priority 4 — The free one already owned

Verify `restoreassist.com.au` in Search Console, put a real page on it, 301 to `.app`. Encircle runs exactly this play — `getencircle.com` sends their main domain 404 backlinks.

**Extra reason to do this one:** eight files under `tools/remotion/` already print `restoreassist.com.au` as the call-to-action URL, including `RA_URL` in that package's brand config. Every rendered video currently points viewers at a domain Search Console reports as unverified. The redirect fixes all eight without touching a composition. Recorded in `seo-export-2026-08-25.md`.

---

## Rules for every form

- Never "Australia's first" — removed from five live surfaces on 2026-08-25.
- "IICRC S500:2021 aligned" or "structured on S500:2021 sections", never "IICRC certified".
- Nothing about the Google Play app until UNI-2617 clears.
- Never "no per-seat" — Field Technician Seat is $11 per seat, per month.
- Same description everywhere.
- Real screenshots only. No mockups.

## Order of attack

1. AlternativeTo — 20 min, immediate
2. WebCatalog, FitGap, SiteLike, Comparably — an hour total
3. RIA vendor listing — this week, while the show is on
4. `restoreassist.com.au` verify + redirect — 15 min
5. RIA Australasia + IICRC — Thursday conversation
6. G2 / Capterra profiles
7. Zapier — start now, ships later
8. Press — next week

Thirty referring domains today, and the enumerated 28 are almost all spam. Twenty legitimate ones from this list roughly doubles the real profile with domains that are actually relevant. See `seo-export-2026-08-25.md` for the baseline and the two unaccounted domains.
