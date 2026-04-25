# Property Data API Investigation — RA-1615

**Status:** Draft — awaiting vendor quote confirmation and pilot agreement  
**Owner:** Phill McGurk  
**Filed:** 2026-04-25  
**Blocking:** RA-1615 migration PR (target Sprint 13)

---

## Context

The current `FloorPlanUnderlayLoader` → `/api/properties/scrape` → `lib/property-data-parser.ts` stack scrapes OnTheHouse.com.au (primary) and Domain.com.au (fallback) to auto-fetch floor plans during inspection setup. This is fragile: bot-detection tightening, ToS changes, or post-sale listing expiry can silently break the feature.

This document presents a vendor comparison and a concrete migration path.

---

## Vendor Comparison Matrix

| # | Vendor | Floor Plans (sold/off-market) | AU Coverage | Pricing model | TOS fit | Contract lead | Score (0–10) |
|---|--------|------------------------------|-------------|--------------|---------|--------------|--------------|
| 1 | **CoreLogic RP Data API** | ✅ Yes — historical imagery retained post-sale | 99% AU | Per-call or seat-based annual (~AUD 15k–50k/yr for SMB tier) | ✅ Commercial | 4–8 weeks | **9** |
| 2 | **Domain Group API** | ⚠️ Active listings only — sold plans may be removed after ~6 months | ~90% major markets | Freemium + partner tier; floor plans likely require partner agreement | ✅ Commercial | 2–4 weeks | **6** |
| 3 | **PropTrack (REA Group)** | ✅ Yes — retained in property history | 99% AU | B2B annual contract; pilot via partner channel | ✅ Commercial | 6–12 weeks | **7** |
| 4 | **PropertyValue.com.au** (CoreLogic sub) | ⚠️ Partial — depends on original listing depth | 85% AU | Per-call; cheaper than full RP Data (~AUD 0.05–0.20/lookup) | ✅ Commercial | 2–4 weeks | **6** |
| 5 | **NSW LPI / State Cadastres** | ❌ No floor plans; cadastral geometry only | State-by-state | Free / government open data | ✅ Open | Immediate | **3 (adjunct only)** |
| 6 | **HERE Maps / Google Places** | ❌ No floor plans | Global | Per-call | ✅ Commercial | Immediate | **2 (adjunct only)** |
| 7 | **OnTheHouse Direct Partnership** | ✅ Likely — REA Group data vault | 99% AU | B2B; pricing unknown | ✅ Commercial (if contracted) | 4–8 weeks | **8** |

### Critical question asked of each vendor

> "For a sold or off-market property (e.g. sold 24 months ago), do floor-plan images remain queryable via API?"

- CoreLogic RP Data: **Yes** — their Property Image Archive retains floor plans indefinitely post-sale.
- Domain Group: **No** — plans linked to active listings only; archived after listing expiry.
- PropTrack: **Yes** — retained in property history data product.
- OnTheHouse (via REA): **Likely yes** — same underlying data vault as PropTrack; needs confirmation.

---

## Recommendation

**Primary:** CoreLogic RP Data API  
**Fallback:** OnTheHouse Direct Partnership (faster to close if REA Group responds first)

**Rationale:** CoreLogic retains floor-plan images for sold/off-market properties — the single biggest business-model risk identified. PropTrack also retains them but has a longer contract lead time.

**Budget ask:** AUD 15,000–25,000/yr for the SMB tier (≤10,000 lookups/month). Pilot typically available at no cost for 60 days.

**Action items (human-gated):**
1. Email CoreLogic partner channel from a `@restoreassist.app` address requesting a pilot agreement.
2. Simultaneously contact REA Group B2B (`b2b@rea-group.com`) to explore OnTheHouse direct API.
3. NDA execution by Phill McGurk before pilot credentials are issued.

---

## Migration Plan

### What changes

The consumer contract (`ScrapedPropertyData` type, returned by `/api/properties/scrape`) does **not** change — only the implementation behind it. The UI (`FloorPlanUnderlayLoader`, `SketchEditorV2`) remains unchanged.

```
Before: /api/properties/scrape → lib/property-data-parser.ts → OnTheHouse/Domain HTML scrape
After:  /api/properties/scrape → lib/property-data-provider.ts → CoreLogic RP Data API
                                                                 ↳ fallback: existing scrape (degraded)
```

### New file: `lib/property-data-provider.ts`

Thin adapter that:
1. Calls CoreLogic `/v1/properties/search?address=...` → returns `ScrapedPropertyData`.
2. On 404 or API error, falls back to the existing `lib/property-data-parser.ts` scrape path.
3. Caches successful lookups in `PropertyLookup` table (already exists in schema) with a 30-day TTL.

### Migration steps

1. Add `CORELOGIC_API_KEY` and `CORELOGIC_BASE_URL` to Vercel env (after pilot credential issue).
2. Create `lib/property-data-provider.ts` implementing the CoreLogic adapter.
3. Update `/api/properties/scrape/route.ts` to call the provider instead of the parser directly.
4. Smoke test on 10 AU properties (mixed active listing + sold >12 months).
5. Keep scrape path as fallback; remove after 30-day soak with zero fallback trips.

### No schema changes required

`PropertyLookup` model already has `rawApiResponse`, `dataSource`, `fetchedAt` fields — sufficient for caching CoreLogic responses.

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| CoreLogic raises prices post-contract | Medium | High | Annual contract with price-lock clause; fallback to scrape during renegotiation |
| CoreLogic acquired / API deprecated | Low | High | OnTheHouse partnership as secondary vendor on standby |
| Floor plans not available for pre-2000 properties | High | Medium | Claude Vision OCR path (RA-1607) as fallback; manual upload as last resort |
| Pilot approval rejected | Low | Medium | Domain Group API as interim step; faster to approve |
| Vercel IP range rate-limited by CoreLogic CDN | Low | Low | CoreLogic's API is designed for B2B server-to-server; unlikely |

---

## Exit Criteria (from RA-1615)

- [ ] Vendor contact on the hook with written quote or pilot agreement
- [ ] This document merged to `main`
- [ ] Follow-up migration PR filed (target Sprint 13, after pilot credentials received)
