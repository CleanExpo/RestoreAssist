# Design — Tablet report-ready floor plans + listing underlay ($9.95)

> Date: 2026-08-25  
> Status: Approved in brainstorm (user confirmed design sections)  
> Goal: On tablet/laptop, technicians create claim-ready floor plans **more easily** than Encircle-class tools while producing **stronger report output**, and optionally pull listing floor plans via a **$9.95/mo** add-on.

## Constraints (non-negotiable)

- **No Encircle (or other competitor) UI / branding / colour clone** — workflow and outcome parity only (`COMPETITOR_RESEARCH`).
- **No fake** ESX/FML/Xactimate export, Bluetooth laser, or Encircle-style video-scan cloud SLA.
- Listing scrape remains behind legal kill-switch `NEXT_PUBLIC_UNDERLAY_URL_IMPORT` until intentionally enabled.
- Manual underlay upload stays available **without** the add-on.
- Do not silently auto-import a floor plan on every job save.

## Decisions locked

| Decision | Choice |
| --- | --- |
| Primary device | Tablet / laptop on site (draw-first; underlay optional) |
| Quality vs speed | Both; **report-ready quality first** |
| Listing import trigger | **C** — listing URL first; address search + explicit match pick as fallback |
| Add-on price | **$9.95 AUD / month** GST-inclusive (other recurring add-ons stay $11) |
| Listing hosts (v1) | **realestate.com.au**, **domain.com.au**, **onthehouse.com.au** |
| Auto-import | Suggest / confirm only — never silent |

## Current baseline (reuse, don’t rebuild)

Already present (see `docs/research/2026-08-17-restoreassist-sketch-studio-encircle-workflow-parity.md` and RA-6922 underlay addon):

- Sketch Studio: Quick/Advanced, rooms L×W + lock, openings + wall bands, adjacency/templates, equipment, moisture anytime, room-crop moisture, PDF chrome, Mark complete (local).
- Floor Plan Underlay: `/api/properties/scrape`, OnTheHouse + Domain allowlist, entitlement `FLOORPLAN_UNDERLAY`, Stripe recurring checkout, upgrade CTA in `FloorPlanUnderlayLoader`.
- Current billed amount in SSOT: **$11.00** in `lib/billing/floorplan-underlay-addon.ts` — **must change to $9.95**.
- REA host **not** in scrape allowlist yet (`lib/scraping/safe-fetch.ts`).

## Product outcomes

### A. Report-ready completeness (beats Encircle on claim defensibility)

1. **Ready panel** (tablet-friendly: bottom sheet or side rail)
   - Live checklist with pass / fail / soft-warn.
   - Each fail has a **Fix** action that selects the right tool or object.
2. **Critical gates** (block **Mark complete** until green)
   - Scale calibrated **or** RoomPlan / listing underlay provenance confirmed.
   - At least one **named** room.
   - No floating openings (every door/window/missing bound to a host wall/edge).
   - If any affected-area exists → ≥1 moisture pin **or** explicit “no readings / dry” acknowledgement persisted on the sketch.
3. **Soft warns** (do not block)
   - Water-affected room with zero equipment symbols.
   - Unlabeled long edges / missing orientation note.
4. **Report pack**
   - Sketch / claim PDF includes a **Floor plan readiness** (or scope summary) page: floor area, affected area, room list, equipment counts, moisture-room list, underlay provenance when present.
5. **Ease slice (so gates don’t feel slow)**
   - **Add adjoining room**: from a selected shared wall / edge, one tap places the next rectangular room snapped to that edge (typed L×W still available).

### B. Listing floor-plan underlay add-on ($9.95)

1. **SKU** remains `FLOORPLAN_UNDERLAY` / Stripe metadata `floorplan_underlay_addon`.
2. **Price SSOT** → `amount: 9.95` AUD, GST-inclusive; all CTAs and checkout `unit_amount` (**995 cents**) must match.
3. **Gate**
   - Entitlement required for outbound scrape / address search that hits listing sites.
   - Without entitlement → **402** + upgrade CTA (existing pattern); manual upload still works.
4. **Tech flow**
   - **URL path:** paste REA / Domain / OTH listing URL → fetch → if floor-plan image found, apply as canvas underlay with transform controls.
   - **Address path:** use job/claim address → search allowed hosts → show candidate list → tech **confirms** one listing → import if plan exists.
   - If no plan: honest empty state + keep manual upload / blank draw.
5. **Hosts**
   - Expand allowlist + parsers + tests for `realestate.com.au` / `www.realestate.com.au` alongside existing Domain + OnTheHouse.
6. **Provenance**
   - Persist source URL, host label, fetch time, and underlay-vs-measured flag so reports never imply the underlay is operator-measured geometry.
7. **Legal**
   - `NEXT_PUBLIC_UNDERLAY_URL_IMPORT` remains the launch switch; shipping code/tests must not assume production scrape is on.

## Non-goals

- Silent auto-pull when a job address is saved.
- Changing other add-on prices away from $11.
- Carrier estimate export (ESX/FML).
- Replacing blank-canvas / RoomPlan paths.
- Human Stickiness dashboard work (separate lane).

## Acceptance criteria (high level)

1. Mark complete cannot succeed while any **critical** readiness rule fails; Fix links are actionable on tablet.
2. Readiness / scope summary appears in exported sketch or claim PDF when a floor plan exists.
3. Adjoining-room one-tap creates a snapped room sharing the selected edge.
4. Checkout for `FLOORPLAN_UNDERLAY` charges **$9.95/mo AUD** inclusive; UI copy matches.
5. Entitled workspace can fetch from **REA, Domain, and OnTheHouse** URLs (when legal flag on); unentitled gets 402 and no outbound scrape.
6. Address search never applies an underlay without an explicit user confirmation of the listing match.
7. Manual upload works with or without the add-on.
8. Underlay provenance is visible in editor and carried into report metadata/chrome.

## Build lanes (implementation order)

1. **Price + copy** — SSOT $9.95, CTAs, tests.
2. **REA allowlist + fetch path** — safe-fetch hosts, scrape route validation, parser/provider tests (flag-gated).
3. **URL + address UX** — Start/underlay UI: URL field primary; address search + confirm secondary.
4. **Readiness engine** — pure rules + unit tests; panel + Mark complete wiring.
5. **Adjoining room** — geometry helper + canvas/editor action + tests.
6. **Report readiness page** — PDF/summary generation + smoke asserts.

## Risks

| Risk | Mitigation |
| --- | --- |
| Listing ToS / scrape fragility | Legal flag; honest failures; cache; no prod scrape without owner enable |
| Wrong-house address match | Always confirm listing before import |
| Techs blocked by readiness | Soft vs hard split; Fix deep-links; adjoining-room speed |
| Price drift across UI/Stripe | Single SSOT module + pricing integrity tests |

## Implementation status (2026-08-25)

**Shipped in code (lanes 1–3):**
- Add-on price **$9.95** SSOT + Stripe checkout cents (995) + upgrade CTA copy.
- Hosts: REA + Domain + OnTheHouse allowlist + parsers.
- Flow **C**: listing URL primary; address search returns **candidates** for confirm; then fetch → underlay.
- Local `.env`: `NEXT_PUBLIC_UNDERLAY_URL_IMPORT=1` (restart `next dev` required).
- Manual upload remains free without the add-on.

**Hardened (same pass):**
- `normalizeScrapeUrl` rejects credentials, http, non-443 ports, IP literals, lookalike hosts.
- Embedded floor-plan / photo URLs sanitized (no `javascript:` / metadata / localhost).
- Request body size cap, address/postcode clamps, fallback-source whitelist, HTML payload clamp.
- Server legal flag + entitlement fail-closed; client validates listing URL before POST.

**Auto-fetch (no Settings toggle):**
- `/dashboard/settings/floor-plan` redirects to Add-ons.
- Inspections auto-search listing floor plans when `FLOORPLAN_UNDERLAY` is owned + legal flag is on.


**To use:** workspace needs active `FeatureEntitlement` for `FLOORPLAN_UNDERLAY` (Stripe add-on checkout, or ops grant via `npm run script:upgrade-user -- email@…` which activates all add-on SKUs).
