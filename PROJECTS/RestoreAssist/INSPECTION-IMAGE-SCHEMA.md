# RestoreAssist — Inspection Image Labelling Schema

**Standard:** IICRC S500:2025
**Version:** 1.0
**Effective:** 2026-04-07
**Related issues:** RA-394, RA-396
**Flywheel target:** 2,000+ labelled images through pilot usage

---

## Purpose

This schema defines the metadata fields applied to every inspection photo uploaded to RestoreAssist. It ensures:

1. Every image is traceable to a specific S500:2025 section and damage classification
2. Australian material specificity is captured (brick veneer, slab-on-ground, fibre cement) — differentiating this dataset from US-trained generics
3. Photos collected organically through pilot usage can train future vision models without rework
4. Schema is complete before the first pilot inspection is captured

---

## Schema Fields

All fields are applied at AI analysis time (see [Labelling Integration Point](#labelling-integration-point) below).

### 1. Damage Category

Maps to IICRC S500:2025 §7.1 — Water Category Classification.

| Value     | Label      | Description                                                                                      |
| --------- | ---------- | ------------------------------------------------------------------------------------------------ |
| `cat1`    | Category 1 | Clean water — sanitary source (burst supply line, rainwater, tap overflow)                       |
| `cat2`    | Category 2 | Grey water — significant contamination (washing machine, dishwasher, toilet bowl without faeces) |
| `cat3`    | Category 3 | Black water — grossly contaminated (sewage, floodwater, seawater)                                |
| `unknown` | Unknown    | Cannot be determined from image alone                                                            |

### 2. Damage Class

Maps to IICRC S500:2025 §7.2 — Water Damage Classification.

| Value    | Label   | Description                                                                       |
| -------- | ------- | --------------------------------------------------------------------------------- |
| `class1` | Class 1 | Slow evaporation — minimal moisture absorption, limited to part of a room         |
| `class2` | Class 2 | Fast evaporation — entire room affected, moisture wicked up walls ≤60 cm          |
| `class3` | Class 3 | Fastest evaporation — moisture absorbed by ceilings, walls, insulation, carpet    |
| `class4` | Class 4 | Specialty drying — low evaporation materials (hardwood, plaster, concrete, brick) |

### 3. IICRC S500:2025 Section Reference

The primary section this image provides evidence for.

| Value      | Section                                  | When to use                                     |
| ---------- | ---------------------------------------- | ----------------------------------------------- |
| `s500_s3`  | §3 — Definitions                         | Not typically a primary section for images      |
| `s500_s6`  | §6 — Psychrometric principles            | Humidity/condensation evidence                  |
| `s500_s7`  | §7 — Water damage classification         | Classification evidence (visible damage extent) |
| `s500_s8`  | §8 — Inspection and moisture measurement | Moisture meter readings, inspection photos      |
| `s500_s9`  | §9 — Documentation                       | Evidence photos for documentation               |
| `s500_s10` | §10 — Safety                             | Hazard conditions (mould, sewage, structural)   |
| `s500_s11` | §11 — Occupant considerations            | Occupant-related conditions                     |
| `s500_s12` | §12 — Drying goals and standards         | Post-drying verification photos                 |
| `s500_s13` | §13 — Water extraction                   | Extraction process photos                       |
| `s500_s14` | §14 — Drying equipment                   | Equipment placement evidence                    |
| `s500_s15` | §15 — Evaporative drying                 | Active drying conditions                        |
| `s500_s16` | §16 — Restorative drying techniques      | Specialty drying evidence                       |

### 4. Room Type

| Value         | Label                         |
| ------------- | ----------------------------- |
| `living`      | Living / lounge / family room |
| `bedroom`     | Bedroom                       |
| `bathroom`    | Bathroom / ensuite            |
| `kitchen`     | Kitchen                       |
| `laundry`     | Laundry                       |
| `hallway`     | Hallway / passage             |
| `garage`      | Garage                        |
| `roof_cavity` | Roof cavity / ceiling space   |
| `subfloor`    | Subfloor / crawl space        |
| `exterior`    | Exterior / facade             |
| `other`       | Other (specify in notes)      |

### 5. Moisture Source

| Value          | Label                            | Notes                               |
| -------------- | -------------------------------- | ----------------------------------- |
| `pipe_burst`   | Pipe burst / supply line failure | Supply, hot water, drainage         |
| `roof_leak`    | Roof leak                        | Storm, age, maintenance failure     |
| `storm`        | Stormwater / flooding            | External inundation                 |
| `sewage`       | Sewage / black water             | Always Cat 3                        |
| `appliance`    | Appliance failure                | Dishwasher, washing machine, fridge |
| `groundwater`  | Groundwater / rising damp        | Slab moisture, subfloor flooding    |
| `condensation` | Condensation / HVAC              | Chronic moisture accumulation       |
| `unknown`      | Unknown                          | Cannot be determined                |

### 6. Affected Material — Australian-Specific

Captures the primary affected building material visible in the image. Australian construction differs significantly from US norms; this specificity drives dataset value.

| Value             | Label                         | AU Context                                                                            |
| ----------------- | ----------------------------- | ------------------------------------------------------------------------------------- |
| `brick_veneer`    | Brick veneer                  | Dominant external wall in QLD/NSW/VIC suburban builds                                 |
| `concrete_slab`   | Concrete slab-on-ground       | Standard floor system, moisture retention characteristics differ from timber subfloor |
| `fibre_cement`    | Fibre cement sheeting (FC)    | Common in wet areas, bathrooms, garages; brand names: Villaboard, Hardiflex, Scyon    |
| `timber_frame`    | Timber framing                | Structural — critical if wet >48h (S500:2025 §10)                                     |
| `plasterboard`    | Plasterboard / gyprock        | Most common internal wall; absorbs moisture rapidly                                   |
| `villaboard`      | Villaboard / compressed sheet | Wet area lining; more moisture-resistant than plasterboard                            |
| `terracotta_tile` | Terracotta / ceramic tile     | Floor and wall tiles — adhesive failure indicator                                     |
| `carpet`          | Carpet / underlay             | Cat/class assessment drives replace vs. restore decision                              |
| `timber_floor`    | Timber / hardwood flooring    | Class 4 drying scenario                                                               |
| `vinyl`           | Vinyl / LVT / linoleum        | Moisture trapped beneath — often missed                                               |
| `insulation`      | Insulation (batts / bulk)     | Above ceiling or in wall cavities                                                     |
| `other`           | Other                         | Specify in notes                                                                      |

### 7. Surface Orientation

| Value        | Label                                  |
| ------------ | -------------------------------------- |
| `floor`      | Floor / horizontal surface             |
| `wall`       | Wall / vertical surface                |
| `ceiling`    | Ceiling / overhead surface             |
| `structural` | Structural element (beam, joist, stud) |
| `multiple`   | Multiple surfaces visible              |

### 8. Damage Extent Estimate

| Value       | Label             | Description                      |
| ----------- | ----------------- | -------------------------------- |
| `localised` | Localised (<1 m²) | Small, contained area            |
| `moderate`  | Moderate (1–5 m²) | Single surface, significant area |
| `extensive` | Extensive (>5 m²) | Large area or multiple surfaces  |

### 9. Equipment Visible

| Value   | Label                      |
| ------- | -------------------------- |
| `true`  | Equipment visible in frame |
| `false` | No equipment visible       |

Captures whether drying/extraction equipment is present in the image — used to classify images as pre-drying evidence vs. equipment placement documentation.

### 10. Secondary Damage Indicators

Multi-select — all that apply.

| Value                    | Label                                                | S500:2025 Reference            |
| ------------------------ | ---------------------------------------------------- | ------------------------------ |
| `mould_visible`          | Mould visible                                        | §10.3 — microbiological growth |
| `efflorescence`          | Efflorescence / salt deposit                         | Chronic moisture indicator     |
| `staining`               | Water staining / tide marks                          | Historical moisture path       |
| `structural_deformation` | Structural deformation (buckling, swelling, warping) | §10.2 — structural safety      |
| `odour_noted`            | Odour noted (documented in accompanying note)        | Cat 2/3 indicator              |
| `none`                   | None of the above                                    |                                |

---

## Labelling Integration Point

### When Labels Are Applied

Labels are **not** applied at upload. They are applied at **AI analysis time** — when the image is processed by the Claude Vision endpoint (`POST /api/vision/extract-reading` or future `POST /api/vision/classify-damage`).

This approach:

- Does not slow the technician's photo capture flow in the field
- Allows batch labelling of previously uploaded images when the vision model improves
- Keeps the mobile UX fast (upload → confirmation only)

### Workflow

```
Field tech captures photo
        ↓
Photo uploads to Supabase Storage
(MediaAsset record created — no labels yet)
        ↓
Background job triggers vision classification
(fire-and-forget, does not block response)
        ↓
Labels written to MediaAsset.metadata JSON field
        ↓
Report generation reads labels for:
  - S500:2025 section citations
  - PDF evidence appendix
  - Insurer portal display
```

### Where Labels Are Surfaced

| Surface                           | Fields shown                                               |
| --------------------------------- | ---------------------------------------------------------- |
| Report PDF (§8 Moisture Readings) | damage_category, damage_class, s500_section                |
| Report PDF (§9 Documentation)     | room_type, surface_orientation, damage_extent              |
| Insurer portal                    | damage_category, damage_class, secondary_damage_indicators |
| Media Library grid                | room_type, affected_material, equipment_visible            |
| Admin dataset export              | All fields                                                 |

---

## Storage Format

Labels are stored in the `MediaAsset.seoJsonLd` field (existing JSON column) under a `iicrcLabels` key, pending a dedicated migration for a typed `labels` column.

```json
{
  "iicrcLabels": {
    "schemaVersion": "1.0",
    "labelledAt": "2026-04-07T00:00:00Z",
    "labelledBy": "claude-vision",
    "damageCategory": "cat2",
    "damageClass": "class2",
    "s500Section": "s500_s8",
    "roomType": "bathroom",
    "moistureSource": "appliance",
    "affectedMaterial": "plasterboard",
    "surfaceOrientation": "wall",
    "damageExtent": "moderate",
    "equipmentVisible": false,
    "secondaryDamageIndicators": ["staining"],
    "confidence": "high",
    "notes": null
  }
}
```

---

## 2,000+ Image Flywheel Roadmap

| Milestone                  | Target              | How                                                      |
| -------------------------- | ------------------- | -------------------------------------------------------- |
| Schema complete            | 0 images            | This document ✓                                          |
| Pilot launch (3 companies) | ~50 images/week     | Beyond Clean Group, Elite Restoration, CRSA              |
| 200 images                 | ~4 weeks post-pilot | Organic capture — no manual collection                   |
| 500 images                 | ~10 weeks           | Validates AU material distribution                       |
| 2,000 images               | ~40 weeks           | Sufficient for fine-tuning a damage classification model |

The Australian material specificity (brick veneer, slab-on-ground, fibre cement) is what makes this dataset valuable. US-trained models systematically under-classify Cat 2 damage in fibre cement walls because FC absorbs and releases moisture differently from US drywall. This schema captures that difference at the point of collection.

---

## Change Log

| Date       | Version | Change                  |
| ---------- | ------- | ----------------------- |
| 2026-04-07 | 1.0     | Initial schema — RA-394 |

---

_Related: RA-396 (voice copilot requirements — shares the same data capture schema design)_
