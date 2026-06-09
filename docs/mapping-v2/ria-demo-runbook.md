# RestoreAssist Mapping V2 — RIA Conference Demo Runbook

**Audience:** RIA Australasia attendees (restoration contractors, insurers).
**Promise:** an ANZ-native loss-documentation + scoping canvas — capture a property,
annotate damage against ANZ materials and standards, and produce an insurer-ready
scope. No North-American tool or data anywhere in the loop.

> Run this end-to-end on a tablet before the show. Each step lists what to do and
> what you should see. If a "should see" doesn't happen, it's not demo-ready.

---

## 0. Pre-flight (once, before the booth opens)

- Deployed build is current `main`; sketch editor opens without errors.
- DB seeded: the ANZ materials library is present (the picker also has an offline
  bundled fallback, so it works even with the venue Wi-Fi down).
- Have one real AU property page's HTML saved (for the property-parse step) and,
  for the NZ cut, set a sketch's jurisdiction to NZ.

## 1. Draw the property (offline-capable)

- Open an inspection → **Sketch**. Draw 2–3 rooms + a doorway; set dimensions in
  metres.
- **See:** rooms render with live areas; refresh the page → the rooms persist
  (saved to Supabase). Toggle the network off first to show it still draws and the
  material picker still lists Australian names.

## 2. Annotate against ANZ materials

- Select a room → **Material** dropdown.
- **See:** Australian vocabulary — Gyprock, fibro, weatherboard, Colorbond,
  brick veneer — not "drywall".

## 3. S500 water category + drying validation

- Drop a moisture pin in a wet room; enter a high reading (e.g. 30% WME) on a
  timber floor.
- **See:** the pin shows **NOT YET DRY** (red) against the S500 dry standard; lower
  the reading below the target → **DRY** (green).

## 4. WHS asbestos gate (the moat moment)

- Set a wall's material to **Fibro** on a pre-2004 property.
- **See:** a red **WHS — suspected asbestos (ACM)** banner; strip-out scope is
  **blocked** until a WHS pathway is recorded. Type a pathway note + **Record** →
  the block clears to "ACM pathway recorded — strip-out permitted."

## 5. Insurance pathway (AU vs NZ)

- **AU (default):** reinstatement cites the current **NCC** edition (+ linked
  Australian Standards, e.g. AS 3740 for wet areas).
- **NZ:** flip **Jurisdiction → NZ**, set a room's cause to **Flood** →
  **Building: Private insurer · Land: NHCover**; set **Earthquake** →
  **Building: NHCover** (NHI Act 2023 — cap NZ$300,000 + GST, $500 excess).

## 6. Property metadata (no re-keying)

- Open property parse, paste a real AU property page's HTML + its URL.
- **See:** real beds / baths / land-size / floor-area come back as structured data.

## 7. Produce the deliverables (one source, three forms)

- **PDF scope** — downloads with the floor plan + a Compliance Annex: materials,
  suspected-ACM/WHS block, S500 drying log, drying-equipment recommendation, and
  NCC references (AU) or an NHCover routing block (NZ).
- **Structured export** (`scope-export`) — versioned JSON contract (`schemaVersion`),
  the machine-readable twin of the PDF (our own ANZ contract — no ESX/Xactimate).
- **Scope-of-works narrative** (`scope-narrative`) — the plain-English document a
  restorer submits.
- **One call:** `scope-report` returns the structured contract + the narrative
  together. All three are generated from the same source, so they never disagree.

---

## Endpoints used (for the technical audience)

| Capability                        | Endpoint                                                    |
| --------------------------------- | ----------------------------------------------------------- |
| Materials library                 | `GET /api/materials`                                        |
| Save sketch + derive elements     | `POST /api/inspections/:id/sketches`                        |
| Moisture reading (S500 drying)    | `POST /api/inspections/:id/sketches/:sid/moisture-readings` |
| WHS hazard                        | `POST /api/inspections/:id/sketches/:sid/hazards`           |
| Insurance pathway                 | `POST /api/inspections/:id/sketches/:sid/insurance-context` |
| Property metadata (parse)         | `POST /api/property/parse`                                  |
| PDF scope                         | `POST /api/inspections/:id/sketches/pdf`                    |
| Structured contract               | `POST /api/inspections/:id/sketches/scope-export`           |
| Scope-of-works narrative          | `POST /api/inspections/:id/sketches/scope-narrative`        |
| Structured + narrative (one call) | `POST /api/inspections/:id/sketches/scope-report`           |

## Not in the demo (gated)

- **Existing-plan underlay import (Apify, BYOK)** — pending AU IP sign-off (spec §8.1).
- **RoomPlan LiDAR capture** — pending iOS/Swift resourcing.
- **Property auto-fetch** — needs a BYOK Apify token + Actor selection (spec §9);
  the parse endpoint (step 6) is the manual, ungated path.
