# Plan — Make Floor Plan Underlay functional ($9.95 + REA + URL/address)

> Spec: `docs/superpowers/specs/2026-08-25-tablet-report-ready-floorplan-design.md`  
> Scope this pass: **lanes 1–3** (price, REA, URL+address UX). Readiness gate / adjoining room / PDF summary deferred.

## Tasks

1. SSOT price → `$9.95` (995¢); update CTAs + checkout tests.
2. Allowlist `realestate.com.au`; parsers + scrape route host checks via `isAllowedScrapeUrl`.
3. Address search returns **candidates** (no silent first-hit); client confirms → `url` fetch.
4. UI: listing URL primary + address fallback; `$9.95` upgrade copy; fallbacks `domain`+`realestate`.
5. Local: set `NEXT_PUBLIC_UNDERLAY_URL_IMPORT=1` so the fetch UI appears.
6. Focused vitest for safe-fetch, parser stubs, checkout amount, loader entitlement copy.
