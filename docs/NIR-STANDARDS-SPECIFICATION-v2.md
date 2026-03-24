# NIR Standards Specification v2.0 — Standards Edition

> **Status:** Active  
> **Supersedes:** Original NIR concept document  
> **Critique basis:** NotebookLM analysis — *RestoreAssist marketing vs. Australian restoration standards*  
> **Date:** March 2026

## Overview

This specification documents the standards grounding behind the RestoreAssist National Inspection Report (NIR) system. It was rebuilt from scratch in response to a structured critique identifying eight gaps between the original marketing positioning and the verifiable standards required to support it.

**The core reframe:** Version 1 described what the NIR *would do* for the industry. Version 2 demonstrates what RestoreAssist *already knows* about the industry. The software is the output of expertise, not a promise of it.

---

## The 8 Critique Findings — Resolution Status

| # | Finding | Status | Implementation |
|---|---------|--------|----------------|
| C1 | Standards cited as badge, not engine logic | ✅ RESOLVED | `lib/nir-standards-mapping.ts` |
| C2 | Cost savings figures not sourced | ✅ RESOLVED | `lib/nir-evidence-architecture.ts` |
| C3 | State building codes treated as one | ✅ RESOLVED | `lib/nir-jurisdictional-matrix.ts` |
| C4 | Field conditions not in app design | ✅ RESOLVED | `lib/nir-field-reality-spec.ts` |
| C5 | No insurer engagement path | ✅ RESOLVED | `lib/nir-insurer-engagement.ts` |
| C6 | SEO runs ahead of standards proof | ✅ RESOLVED | `docs/CONTENT-GATE.md` |
| C7 | No structural competitive moat | ✅ RESOLVED | `docs/MOAT-ARCHITECTURE.md` |
| C8 | Financial projections lack assumptions | ✅ RESOLVED | `docs/FINANCIAL-MODEL-v2.md` |

---

## Standards Architecture

### S500 — Water Damage
See `lib/nir-standards-mapping.ts` → `S500_FIELD_MAP`

Every water damage field maps to a specific IICRC S500 clause. The engine interprets readings against thresholds defined in the standard, not against technician judgement. Key mappings:

- **Moisture content** → S500 §12.3 (material-specific thresholds: wood 16%, concrete 0.5%)
- **Water category** → S500 §7.1–7.3 (Cat 1/2/3 with time-degradation logic)
- **Water class** → S500 §8.1–8.4 (evaporation load drives equipment spec)
- **Photo documentation** → S500 §5.3 (auto-timestamp, geotag, sequential)

### S520 — Mould Remediation  
See `lib/nir-standards-mapping.ts` → `S520_FIELD_MAP`

- **Mould condition** → S520 §6 (Condition 1/2/3 classification)
- **Containment** → S520 §7.3 (area-based formula: <1m², 1–10m², >10m²)
- **Moisture source gate** → S520 §8.1 (MANDATORY — blocks scope without root cause)
- **Air quality testing** → S520 §9 (triggered by condition and area thresholds)

### S700 — Fire and Smoke
See `lib/nir-standards-mapping.ts` → `S700_FIELD_MAP`

- **Smoke residue type** → S700 §6 (wet/dry/protein/fuel oil — drives cleaning method)
- **Structural stability** → S700 §8 (mandatory gate before scope generation)

---

## Jurisdictional Matrix

See `lib/nir-jurisdictional-matrix.ts`

All 8 Australian states and territories are covered with jurisdiction-specific triggers:

| State | Key Triggers |
|-------|-------------|
| QLD | Flood zone (MP 3.5), pre-1990 asbestos, high-set subfloor, tropical humidity adjustment |
| NSW | Bushfire Prone Land (BAL), flood planning area, pre-1987 asbestos |
| VIC | Bushfire Management Overlay (BAL), cool climate drying extension |
| WA | Cyclone wind regions C/D (Pilbara/Kimberley), arid drying adjustment |
| SA | Heritage Register properties, standard triggers |
| TAS | Cool climate timber drying extension |
| NT | Cyclone wind regions C/D (all NT), tropical drying adjustment, 24hr reinspection cycle |
| ACT | Bushfire-prone fringe, BAL lookup |

**Maintenance:** Quarterly review against NCC amendment releases. Annual insurer protocol review.

---

## Evidence Architecture

See `lib/nir-evidence-architecture.ts`

Every quantitative claim is classified:

- **SOURCED** — External published data (ICA, APRA). Safe for all materials.
- **HYPOTHESIS** — Practitioner estimate with Phase 2 pilot measurement plan. NOT for customer-facing use until VALIDATED.
- **DERIVED** — Calculated from other inputs. Publish as scenario range with derivation disclosed.
- **VALIDATED** — Promoted from HYPOTHESIS after pilot measurement. Safe for all materials.

**Content gate:** See `docs/CONTENT-GATE.md` for gate rules before publishing any claim.

---

## Field Reality Requirements

See `lib/nir-field-reality-spec.ts`

**Non-negotiable requirements:**
- Offline-first (full functionality without connectivity)
- Auto-sync on restore (no manual sync)
- Bluetooth integration: Tramex MEP, Delmhorst BD-2100, Testo 605 (Phase 2)
- Glove-compatible (10mm × 10mm minimum tap targets)
- Sunlight readable (600 nits compatibility)
- One-handed operation (crawl space and confined space use)
- Tiered completion (critical fields gate submission; supplementary fields do not)
- Voice notes on all fields

---

## Insurer Engagement

See `lib/nir-insurer-engagement.ts`

**Priority 1 targets:** IAG (Guidewire), Suncorp (Majesco)  
**Entry point:** Claims Transformation teams — not IT procurement  
**API pathway:** Guidewire integration guide published as open docs (Phase 3)  
**ICA submission:** Phase 4 — formal voluntary standard proposal

---

## Next Actions (Phase 0 — Foundation)

- [ ] S500 standards mapping reviewed by WRT-certified technician
- [ ] S520 standards mapping reviewed by CMRS or ASD-certified technician  
- [ ] S700 field map completed (partially stubbed in current implementation)
- [ ] Zero unattributed claims remaining in any customer-facing material
- [ ] QLD jurisdictional matrix validated against current QBCC requirements
- [ ] IAG or Suncorp technical contact identified and briefed on NIR concept
- [ ] Guidewire integration spec drafted (even if not yet implemented)

---

*Standards version tracking: S500 7th Ed (2021), S520 3rd Ed (2015), S700 2nd Ed (2015), NCC 2022*  
*Next standards review due: Q2 2026*
