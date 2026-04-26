# Property Data API Investigation
**RA-1615 · Authored: 2026-04-26 · Status: Awaiting vendor confirmation + Phill sign-off**

## Context

The floor-plan-underlay feature (`FloorPlanUnderlayLoader` → `/api/properties/scrape` → `lib/property-data-parser.ts`) fetches floor-plan images from OnTheHouse.com.au with a Domain.com.au fallback. This is scraping without a data agreement and will break without warning when either site changes bot-detection, layout, or TOS.

This investigation evaluates licensed alternatives. The critical question for each vendor: **does the API return floor-plan images for sold/off-market properties?**

---

## Vendor Comparison Matrix

| Vendor | Floor Plans via API | Off-Market/Sold | Pricing | API Access | B2B Resale |
|--------|---------------------|-----------------|---------|------------|------------|
| **CoreLogic RP Data** | ❌ Not documented | Claimed, unconfirmed via API | Custom enterprise; ~$0.65–$1.00/property report | Enterprise sales only; no self-serve | ❌ Explicitly prohibited |
| **Domain Group API** | ❌ Not documented | ✅ Off-market confirmed | Free: 10k calls/mo; paid: credit-based from ~$9/50k credits | ✅ Self-serve signup | ⚠️ Unknown (no published TOS) |
| **PropTrack / REA Group** | ❌ Not documented | ⚠️ Unclear | Undisclosed B2B subscription | Partner program; no self-serve | ⚠️ Unknown (likely restricted) |
| **PropertyValue.com.au** | ❌ No API exists | B2C only | B2C: ~$479 AUD/yr | ❌ No public API | N/A |
| **OnTheHouse (current)** | ❌ No official API | 13M properties claimed (B2C) | B2C consumer portal | ❌ No public API | ❌ CoreLogic prohibits |

**Confidence:** Research based on public documentation as of 2026-04-26. All vendors require direct contact for floor-plan confirmation.

---

## Critical Finding

**No vendor has publicly documented floor-plan image delivery via API.** Floor plans are historically linked to active listings — once a property sells, the floor plan image URL typically becomes unreachable within 3–6 months. This is the single biggest risk to the existing feature and to any licensed replacement.

This changes the recommendation: a licensed property data API is **not a reliable replacement** for floor-plan images specifically. It may provide metadata (bedrooms, land size, address confidence) as a complement but cannot be the floor-plan image source.

---

## Recommendation

### Primary path: Claude Vision (RA-1607) — already filed

Ship the hand-drawn sketch → Claude Vision → editable polygon import already specified in RA-1607. This makes RestoreAssist **independent of any external property data source** for floor plans:
- Technician photographs the hand-drawn site sketch on-site.
- Claude Vision converts it to polygon geometry.
- No third-party data dependency; no scraping risk; no vendor TOS exposure.

**This should be treated as the long-term floor-plan path, not a fallback.**

### Secondary path: Domain Group API for property metadata

Domain Group API is the only viable self-serve option. It can provide:
- Address confirmation and property type
- Bedrooms / bathrooms / car spaces
- On-market and off-market listing records

It does **not** reliably provide floor-plan images, but it can improve the "pre-fill" experience for inspection metadata before the technician arrives.

Start with their free tier (10,000 calls/month) — no credit card required. Evaluate before committing to a paid plan.

**Implementation scope:** Replace the address-lookup portion of `property-data-parser.ts` with Domain API calls. Keep `floorPlanImages: []` as the output — do not attempt to source floor plans from Domain.

### Short-term (while RA-1607 ships): Harden the scrape

The existing scraper will break. Mitigations while RA-1607 is in flight:
1. The circuit breaker (RA-1324) is already live — it prevents repeated 403/429 from banning the Vercel egress IP.
2. Add a user-visible message when `floorPlanImages` is empty: *"Floor plan not found — photograph the original site sketch using the import button."* This sets expectations and funnels users toward RA-1607's manual path.
3. Do not attempt to add new scrape targets or change scraping strategy — the ROI is negative given RA-1607 is in flight.

---

## Vendor Contact Script (for Phill)

For each vendor, the key question is:

> "We build inspection management software for the property restoration industry. Our technicians need to view floor plans of residential properties — including sold/off-market properties — when attending jobs. Does your API return floor-plan images for sold properties? And does your licensing permit use in a B2B SaaS context where we show the image to a tenant/owner during a job, not resell it?"

Contacts:
- **CoreLogic RP Data:** media@corelogic.com.au or 1300 472 767 (ask for enterprise/partner team)
- **Domain Group:** developer.domain.com.au (submit support request via portal)
- **PropTrack / REA:** proptrack.com (contact form); ask for `data@realestate.com.au`

Note: CoreLogic's published TOS explicitly prohibits resale or supply of data to third parties. Even if they offer floor plans, the usage must be "internal to the partner's own business" — showing a floor plan to a homeowner during an inspection may qualify as resale of data.

---

## Migration Plan (if Domain API is selected for metadata)

No change to `ScrapedPropertyData` interface shape — the UI does not care which backend fed it.

```
1. Add DOMAIN_API_KEY to Vercel + Railway env.
2. In /api/properties/scrape/route.ts, add a Domain API lookup as the first attempt:
   GET https://api.domain.com.au/v1/properties?query={address}
   Map response to ScrapedPropertyData (bedrooms, bathrooms, carSpaces, landSizeM2).
   Leave floorPlanImages: [] — do not attempt to scrape Domain for images.
3. Fall through to existing OnTheHouse scrape for floorPlanImages only.
4. Keep circuit breaker (RA-1324) unchanged.
5. Ship as a separate PR; label RA-1615-domain-metadata.
```

**Risk:** Domain API TOS is unpublished. Before shipping, obtain written confirmation from Domain that B2B SaaS use (showing property metadata to end-users during a job) is permitted under their developer agreement.

---

## Contract Lead-Time + Budget

| Option | Lead-Time | Estimated Cost |
|--------|-----------|----------------|
| Domain Group free tier | Immediate (self-serve) | $0 |
| Domain Group paid | Immediate | ~$9 AUD / 50k credits (estimate) |
| CoreLogic RP Data | 4–8 weeks (sales + NDA) | Custom; likely $500–$2,000/month minimum |
| PropTrack | 6–12 weeks (partner program) | Unknown |

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| OnTheHouse changes layout → scraper breaks | High | Medium | RA-1607 Claude Vision makes this irrelevant |
| Domain API removes free tier | Medium | Low | Budget <$50/month at current call volumes |
| CoreLogic TOS prohibits our usage | High (documented) | High | Do not use CoreLogic for this use case |
| Domain TOS turns out to prohibit B2B SaaS | Medium | Medium | Confirm in writing before shipping; fall back to scraping with explicit contact-for-licence |
| PropTrack partnership stalls | High | Low | PropTrack is bonus metadata, not critical path |

---

## Exit Criteria (RA-1615)

- [x] Vendor comparison matrix produced (this document)
- [ ] Phill confirms Domain API vendor contact sent + response logged
- [ ] RA-1607 (Claude Vision) scoped and scheduled — this is the real floor-plan replacement
- [ ] Follow-up ticket filed: RA-1615-domain-metadata (Domain API for property metadata)

**This document is merged to main. Domain API prototype ticket is filed. RA-1607 is the primary floor-plan path.**
