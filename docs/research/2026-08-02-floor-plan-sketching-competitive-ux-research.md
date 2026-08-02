# Floor Plan Sketching Competitive UX Research

**Date:** 2026-08-02  
**Audience:** RestoreAssist product, design, and engineering  
**Focus:** Manual floor-plan sketching UX in US restoration / insurance inspection platforms  
**Related codebase:** `components/sketch/` (Fabric.js `SketchEditorV2` / `SketchCanvas`)

---

## 1. Executive summary

US restoration and insurance platforms have largely split into two sketching paradigms:

1. **Estimate-native manual sketch** — Xactimate Sketch and Cotality (Symbility) Claims Estimate remain the places where adjusters and estimators still *draw* rooms, walls, doors, windows, missing walls, and stairs as first-class geometry that drives quantities and line items.
2. **Scan-first, light-edit** — Encircle Floor Plan, DocuSketch, Hover Interiors, Mitigate Scan, Plnar, RocketSketch, and Matterport Property Layout prioritize capture (video, LiDAR, 360°, photos) and return a plan that users *correct* rather than draft from blank canvas.

For field restoration techs, the winning pattern is **not** desktop CAD fluency. Leaders make drawing fast by:

- Preferring **room primitives** over wall-by-wall drafting
- **Tap-to-place defaults** (e.g. Xactimate mobile’s one-tap ~12′8″ room)
- **Wall-attached openings** (doors/windows snap to walls; red handles for width)
- **Numeric dimension entry + lock** (magicplan) so assembly doesn’t destroy measurements
- **Green snap indicators** when joining rooms (magicplan)
- **Contextual bottom sheets** on touch (properties, rotate, camera) instead of dense ribbons
- **Moisture / equipment overlays** on the same plan used for scope (magicplan, Encircle Hydro, Mitigate)

RestoreAssist already has a strong restoration-shaped foundation (room/wall/door/window tools, snap, moisture pins, damage zones, RoomPlan ingest, underlays, touch dock). The competitive gap is less “add more CAD” and more **field speed + claim defensibility**: room templates with typed dimensions, wall-hosted openings with clearer affordances, dimension lock during edit, equipment symbols, room-cropped moisture maps, and a scan→confirm→annotate workflow that matches how US crews actually work.

**Evidence note:** This report is based on public product docs, help centers, marketing pages, training videos, and reviews. Interactive app sessions were not performed. Claims marked `[inferred]` are synthesis, not observed product behavior. `parallel-cli` was unavailable in this environment; research used web search + primary-page fetches.

---

## 2. Methodology & sources

| Method | Detail |
| --- | --- |
| Primary sources | Vendor help centers (Xactware, magicplan, Encircle, Matterport, Cotality/CoreLogic Freshdesk, Symbility Property Support, Hover Help) |
| Secondary | Vendor marketing pages, App Store listings, training/YouTube product walkthroughs, PR wires |
| Tertiary | Independent reviews (e.g. Contractor ToolStack DocuSketch review) — used sparingly |
| Codebase skim | RestoreAssist `components/sketch/*` for recommendation mapping only |
| Out of scope | Live product trials, paywalled training portals, non-public beta builds |

**Honesty about gaps**

- Encircle Quick Editor help article is thin on public UI detail (title + summary only).
- Cotality Mitigate marketing emphasizes LiDAR; public docs describe post-scan **Calibrate**, but a full manual-draw tool map was not found in open help.
- “Estimate Rocket” as commonly named in contractor CRM is not a floor-plan sketch product; **RocketPlan / RocketSketch** is the restoration sketch-adjacent product in this space.
- CompanyCam and JobNimbus: no native floor-plan sketcher found (photo markup / CRM + Xactimate attach only).

---

## 3. Per-product deep dives

### 3.1 Xactimate Sketch (Verisk) — **manual sketch gold standard**

**Sketch approach:** Full-featured 2D/3D estimate sketch. Geometry drives room variables and scoping.

**How users draw**

- **Desktop:** Room tool (`R`) is primary; Wall (`Shift+W`), Doorway (`D`), Window (`W`), Missing Wall (`M`), Staircase (`C`), Vertex (`V`), Break (`B`), Snap Line (`S`), Reference Block/Line/Area/Point, Snap to Grid (`Shift+P`). ([Sketch quick reference](https://xactware.helpdocs.io/l/enUS/article/kWHFcRnSRw-sketch-quick-reference))
- **Mobile:** Flyout menu → Sketch Room → drag diagonal for custom size **or single tap** to place a default **12′8″ × 12′8″** room. Walls show **red diamond** handles; drag wall to resize; “+” in expanded space can split into adjacent room. Doors/windows: tap wall for default width or drag for custom; red diamonds resize along wall. Stairs are placed as a **separate room**, not dropped inside an existing room. ([Create a sketch in Xactimate mobile](https://xactware.helpdocs.io/l/enUS/article/ksnxxsdrqe-how-to-create-a-sketch-in-xactimate-mobile))
- Industry training repeatedly advises: **use Room tool first**, not wall-by-wall drafting. ([DocuSketch how-to](https://www.docusketch.com/post/how-to-sketch-a-room-in-xactimate); [Pride Estimating tips](https://prideestimating.com/mastering-xactimate-sketching/))

**Workflow (new → finalize)** `[composite from docs]`

1. Open estimate → Sketch (`Ctrl+K` desktop; Estimate → Start Estimate mobile)
2. Place rooms (manual, Sketch AR, or Sketch Scan / LiDAR where available)
3. Add openings (doors, windows, missing walls), stairs, roofs as needed
4. Set properties (wall thickness, ceiling height, materials)
5. Optionally import underlays / images; attach photos to rooms
6. Scope line items against rooms; export / sync estimate

**UX patterns**

| Pattern | Evidence |
| --- | --- |
| Ribbon + keyboard on desktop | Quick reference shortcuts |
| Collapsed flyout (last-used tool) on mobile | Mobile create-sketch doc |
| Bottom contextual menu (Rotate, Flip, Properties, Camera, Copy, Delete) | Mobile create-sketch |
| Auto-snap near intersecting walls/fences | [What’s new for Xactimate mobile](https://xactware.helpdocs.io/l/enUS/article/d5wegz2dzo-whats-new-for-xactimate-mobile) |
| Multi-view: plan / elevation / 3D | [Sketch window overview](https://xactware.helpdocs.io/l/enUS/article/mlgDq1N8iH-sketch-window-overview) |
| Underlays + view toggles for measurements/annotations | Same overview |
| Sketch AR / Sketch Scan as alternatives to blank-canvas draw | Sketch AR + What’s new docs |

**Touch vs desktop**

- Desktop: dense Tools ribbon, keyboard, Properties window (`Ctrl+Enter`).
- Mobile: large flyout, bottom action strip, pinch zoom, red-handle editing, Sketch AR camera flow.
- Android mobile: Verisk announced discontinuation Q2 2027 (limited from Jan 2027) — iOS is the long-term mobile path. ([Mobile create-sketch](https://xactware.helpdocs.io/l/enUS/article/ksnxxsdrqe-how-to-create-a-sketch-in-xactimate-mobile))

**Restoration relevance:** Extremely high — de facto US insurance estimate sketch. Manual skill still required when imports fail or for partial losses. Partners (Encircle, DocuSketch, Hover, magicplan) optimize for **import into** Xactimate rather than replacing it.

**UI references**

- https://xactware.helpdocs.io/l/enUS/article/mlgDq1N8iH-sketch-window-overview
- https://xactware.helpdocs.io/l/enUS/article/ksnxxsdrqe-how-to-create-a-sketch-in-xactimate-mobile
- https://xactware.helpdocs.io/l/enUS/article/fgjhav5r4q-sketch-ar-in-xactimate-mobile

---

### 3.2 Cotality / Symbility Claims Estimate (+ Estimate iOS) — **manual shapes + LiDAR**

**Sketch approach:** Native diagramming for floorplans / roofs / exteriors; FML/XML import from partners; RoomPlan LiDAR on Pro devices.

**How users draw**

- **Desktop shortcuts:** Room `R`, Door `D`, Window `W`, Opening `O`, Stairs `C`, Freeform `F`, Missing wall `M`, Vertex `V`, Block `B`, text `T`, flip/rotate, join sub-rooms, wall/ceiling/stair editors. ([Shortcut keys guide](https://support.symbilityproperty.com/en/support/solutions/articles/6000125688-shortcut-keys-guide-for-claims-estimate))
- **Estimate iOS:** Manual = drop **predefined room shapes**, roofs, exterior structures; adjust dimensions; add doors/windows/openings/missing walls; pinch zoom. Scan = Apple RoomPlan via `Documentation > New Diagram > Floorplan > Scan`. ([Estimate iOS overview](https://support.symbilityproperty.com/en/support/solutions/articles/24000105058-estimate-ios-overview-and-user-guide))
- Training content (Symbility Module 2) shows **L-shaped room templates** with mirror/flip/rotate and careful opposite-wall dimension editing — shape templates over freehand. ([YouTube training transcript/source](https://www.youtube.com/watch?v=CkhoYRdvdm8))

**Workflow**

1. New Diagram → Floorplan (manual or Scan)
2. Place/edit rooms and openings offline-capable
3. Attach photos (orientation calibration), questionnaires, estimate items
4. Lock estimate / sync / release ownership to desktop

**Restoration relevance:** High for carriers/adjusters on Cotality Claims Connect / Mobile Claims. Contractors often export FML from magicplan / DocuSketch / Plnar into this ecosystem.

**UI references**

- https://support.symbilityproperty.com/en/support/solutions/articles/24000105058-estimate-ios-overview-and-user-guide
- https://support.symbilityproperty.com/en/support/solutions/articles/6000125688-shortcut-keys-guide-for-claims-estimate
- https://www.youtube.com/watch?v=CkhoYRdvdm8

---

### 3.3 magicplan — **best documented manual + restoration overlays**

**Sketch approach:** Mobile-first floor plans via Auto-Scan / Manual Scan (iOS), **Draw Room** / **Add Square Room** / image trace (esp. Android), then assemble rooms. Strong restoration object library + moisture mapping product surface.

**How users manually draw**

1. Floor level → `+ Insert` → Room → **Draw Room** → pick room type  
2. Tap corners on grid (metric: 1 tile ≈ 1 m²; imperial: 1 tile ≈ 9 ft²)  
3. Adjust wall dimensions (tap blue measurement / details sheet; scroll, Bluetooth laser, or drag)  
4. **Lock** dimensions when assembling so edits don’t cascade  
5. Add wall objects (doors/windows cut wall surface) and floor objects from 300+ library  
6. Assemble: drag rooms; **green indicators** snap connections; rotate via blue curved arrow  

Sources: [Draw Room](https://help.magicplan.app/create-a-room-with-the-define-corners-feature), [Android create options](https://help.magicplan.app/creating-floor-plans-in-magicplan-on-your-android-device), [Change dimensions](https://help.magicplan.app/change-dimensions-of-your-floor-plan), [Assemble rooms](https://help.magicplan.app/assemble-your-rooms-to-a-floor-plan), [Add objects](https://help.magicplan.app/add-furniture-objects).

**Restoration-specific**

- Moisture readings pinned on plan; color-coded wet/dry; day-over-day logs ([Moisture mapping](https://magicplan.app/product/moisture-mapping))
- Restoration objects: air movers, dehumidifiers, wall cavity dryers, humid zones, air scrubbers, etc. ([Equipment placement help](https://help.magicplan.app/restoration-equipment-placement))
- ESX (Xactimate) and CoreLogic FML export ([Xactimate integration](https://magicplan.app/integrations/xactimate), [CoreLogic blog](https://magicplan.app/blog/corelogic-claims-instant-sketches))
- Water mitigation solution page positions sketch + affected areas + scope as one field workflow ([Water mitigation](https://magicplan.app/solution/water-mitigation))

**Strengths:** Clearest public UX for *manual* drawing; dimension lock; room assembly snap; restoration symbology.  
**Weaknesses:** Encircle marketing claims full-house assembly is “clunky” vs video scan ([Encircle Floor Plan](https://www.getencircle.com/solutions/floor-plan/)) — treat as competitive claim, not independent UX study.  
**Touch:** Primary; tablet “i” details panel vs phone swipe-up sheet.

---

### 3.4 Encircle Floor Plan + Hydro — **scan-first; light manual edit; moisture maps**

**Sketch approach:** Smartphone **video walk** → processed 2D plan (avg ~2h, 6h guarantee per marketing) → Quick Editor for labels/measurement lines/text → Xactimate import. Not a blank-canvas CAD tool.

**Capture workflow (documented)**

1. Claim home → Add Floor Plans → scanning tips → record  
2. Prep: open doors/lights/blinds; walk forward at chest height; 5–11 ft from walls; don’t open doors mid-scan  
3. Multi-floor: continue walking stairs; start lowest floor  
4. Receive JPEG floor plan(s) per floor; optional Xactimate property data request  

Sources: [Adding a Floor Plan](https://help.encircleapp.com/hc/en-us/articles/11397605722253-Adding-a-Floor-Plan), [FAQ](https://help.encircleapp.com/hc/en-us/articles/12200869740557-Encircle-Floor-Plan-FAQ), [Marketing](https://www.getencircle.com/solutions/floor-plan/), [Scanner POV video](https://www.youtube.com/watch?v=mywBLwbwxM8).

**Manual / edit surface**

- Quick Editor (web): relabel rooms, add measurement lines, text, other light elements ([Quick Editor](https://help.encircleapp.com/hc/en-us/articles/12198894767629-Using-the-Quick-Editor); FAQ notes short exterior/interior walls may omit dimension labels for readability — users draw measurement lines as needed)
- Individual room sketches from floor plan for Hydro moisture maps ([FAQ](https://help.encircleapp.com/hc/en-us/articles/12200869740557-Encircle-Floor-Plan-FAQ))
- Moisture maps: crop room from floor plan with orange guides → freehand water → place moisture points; can take readings **before** plan returns and place later ([Moisture Maps help](https://help.encircleapp.com/hc/en-us/articles/18384800011021-Moisture-Maps-Moisture-Points); [readings while waiting](https://help.encircleapp.com/hc/en-us/articles/13472318967949-Can-I-take-material-readings-while-I-wait-for-my-floor-plan); [training video](https://www.youtube.com/watch?v=-HGZhbVrh4s))

**Restoration relevance:** Very high for US restorers who live in Encircle + Xactimate. Manual drawing is intentionally minimized.

**UI / example images**

- Example floor plan referenced in FAQ hubspot CDN (linked from FAQ page)  
- Marketing walkthrough: https://www.getencircle.com/solutions/floor-plan/  
- Training hub: https://hub.getencircle.com/learn/floor-plan/

---

### 3.5 DocuSketch — **360 capture → human/AI sketch service (no field CAD)**

**Sketch approach:** DS1 360° capture → request sketch → deliver `.ESX` / `.FML` with dimensions, cabinets, etc. Marketing explicitly contrasts with Xactimate’s *manual* built-in sketch. ([Restoration sketching software](https://www.docusketch.com/solutions/restoration-sketching-software))

**Manual drawing:** Not the primary product loop. Field users document; office/service produces sketch.

**Moisture:** Dedicated drying logs “planned for Summer 2026” per What’s New / launch FAQ; today moisture often via meter photos on tour + floor-plan test location numbering advice ([What’s New](https://www.docusketch.com/whats-new), [Drying log guide](https://www.docusketch.com/post/water-damage-drying-log)).

**Restoration relevance:** High for documentation → estimate handoff; low as a *manual sketch UX* reference.

---

### 3.6 Hover Interiors — **photo/LiDAR scan → measured floor plans**

**Sketch approach:** Interior scan (Universal or LiDAR) → processed measurements + 2D/3D sketches + Xactimate/Cotality import. Not marketed as freehand wall drawing. ([Hover for Interiors](https://help.hover.to/en/articles/7061443-hover-for-interiors), [Insurance FAQ](https://help.hover.to/en/articles/13995166-common-interior-scan-questions-from-insurance-pros))

**Deliverables include:** wall/floor/window/door/cabinet measurements, opening deductions, reference blocks for cabinets, floor plans by room. Works for partial structures / studs-up. Delivery “3 hours or less” for interiors package (help center).

**Manual edit depth:** Public help emphasizes scan quality and deliverables more than interactive wall editing. `[gap]`

---

### 3.7 Matterport Property Layout — **AI layout + desktop boundary editor**

**Sketch approach:** Capture digital twin → AI room segmentation + automated L/W/H/area → **Property Layout** editor to add/adjust solid walls, invisible walls, doors, openings, windows, room types/labels. ([Property Layout article](https://support.matterport.com/s/article/Automated-Rooms-Measurements-and-Property-Report?language=en_US))

**Manual draw details**

- Add wall: click start/end on grid  
- Invisible walls for open-concept segmentation  
- Selection tool: drag wall endpoints  
- Door / opening / window icons; floor-plan symbology: openings = 1 line, doors = 2, windows = 3  
- Wall thickness in sidebar  
- **Property Layout editing tools not available on mobile** (desktop only)

**Restoration relevance:** Medium — strong for documentation / as-built; less native moisture/equipment claim workflow than Encircle/magicplan/Mitigate.

**Demo / UI**

- Interactive demo linked from Matterport Property Layout support article  
- https://support.matterport.com/s/article/Automated-Rooms-Measurements-and-Property-Report?language=en_US

---

### 3.8 DASH + Mitigate (Next Gear / Cotality) — **job OS + mitigation sketch**

**DASH:** Restoration job management (CRM/ops). Not a sketch editor. ([DASH page](https://www.nextgearsolutions.com/solutions/job-management/dash-restoration-business-management/))

**Mitigate:** Water mitigation documentation (MICA lineage). **Mitigate Scan** uses iOS LiDAR to create scaled floor plans; **Calibrate** sets one wall exact length and proportionally updates other walls in that session. ([Mitigate product](https://www.nextgearsolutions.com/solutions/inspection-and-scoping/mitigate/), [LiDAR help](https://corelogic.freshdesk.com/support/solutions/articles/151000184221-lidar-scanning-in-mitigate), [Cotality Mitigate](https://www.cotality.com/products/restoration-mitigate))

**Case evidence:** Jarvis Restoration reported pre-Mitigate manual iPad grid sketching took 4–5 hours on large jobs; LiDAR reduced that to minutes. ([Jarvis case](https://www.cotality.com/resources/article/jarvis-restoration-leveraging-dash-and-mitigate-lidar-scan))

**Moisture:** App guides *where* to take moisture content readings; photo-guided consistent locations across drying days. Manual blank-canvas CAD details not public. `[gap]`

---

### 3.9 Plnar — **instant sketch partner into Cotality/Xactimate**

**Sketch approach:** Smartphone imagery / LiDAR Instant Sketch → structured diagrams into Xactimate or Cotality; eliminates manual tracing over CoreLogic sketches per 2022 integration announcement. ([Plnar Instant Sketch](https://plnar.ai/instant-sketch-for-water-mitigation-and-restoration/), [CoreLogic integration](https://plnar.ai/blog/corelogic-plnar/), [Symbility PLNAR article](https://support.symbilityproperty.com/en/support/solutions/articles/24000069278-plnar))

**Manual sketch UX:** Not the product; import partner.

---

### 3.10 RocketPlan / RocketSketch — **phone capture → floor plan + tour**

**Sketch approach:** Mobile capture → floor plan sketch + 3D virtual tour (~30 minutes claimed). ([RocketSketch](https://rocketplantech.com/rocketsketch/))  
**Manual CAD:** Not documented as a drawing suite. Restoration PM platform with IR (FLIR) photo organization.

---

### 3.11 CompanyCam — **no manual floor-plan sketch**

Photo documentation + annotations (draw on photos, arrows, text). Floor plans require third-party tools (e.g. magicplan Zapier sync, naturalForms sketches). ([Annotations](https://companycam.com/features/annotations), [Edit drawings help](https://help.companycam.com/en/articles/6828430-edit-and-add-drawings-to-your-photos), [magicplan integration](https://magicplan.app/integrations/companycam))

---

### 3.12 JobNimbus — **no native floor-plan sketch**

CRM / job management. XactAnalysis integration imports estimate financials; sketches live in Xactimate (or parallel tools like DocuSketch). ([What is Xactimate](https://support.jobnimbus.com/what-is-xactimate), [Xactimate integration](https://support.jobnimbus.com/how-do-i-use-the-xactimate-integration))

---

### 3.13 CoreLogic Sketch / ClaimXperience naming note

In market language, “CoreLogic Sketch” usually means **diagrams inside Claims Estimate / Claims Connect** (now Cotality branding) plus imported FML/XML — not a separate consumer sketch app. Partner sketches (magicplan, DocuSketch, Hover, Plnar) land via **Import Diagram**. Treat Symbility/Cotality Estimate as the CoreLogic sketch surface (§3.2).

---

## 4. Cross-cutting UX patterns

### 4.1 How users draw walls / rooms / openings

| Pattern | Who | Why it works for field users |
| --- | --- | --- |
| Room-first rectangles / templates | Xactimate, Symbility, magicplan Square Room | Faster than four walls; fewer unclosed polygons |
| Corner-tap polygons | magicplan Draw Room | Irregular rooms without CAD precision |
| Wall tool as secondary | Xactimate Wall / Break / Vertex | Refinement after room exists |
| Openings as wall-hosted objects | Xactimate, magicplan, Matterport, Symbility | Prevents floating doors; correct deductions |
| Missing wall / opening tool | Xactimate `M`, Symbility `O`/`M` | Pass-throughs, arches, half walls |
| Stairs as special rooms | Xactimate mobile | Avoid invalid nesting |

### 4.2 Dimensions, labels, symbols

- **On-canvas dimension labels** with tap-to-edit (magicplan blue dims; Xactimate view settings)
- **Selective labeling** for readability (Encircle hides short/interior wall dims; user adds measurement lines)
- **Room type taxonomy** (Matterport AI types + custom labels; magicplan room type at create; Xactimate room properties)
- **Claim symbology:** doors/windows/openings line conventions (Matterport 1/2/3 lines); restoration equipment icons (magicplan)
- **Reference blocks** for cabinets/fixtures in estimate imports (Encircle→Xactimate, Hover)

### 4.3 Snapping, zoom, navigation

- Grid snap + endpoint snap (Xactimate Snap to Grid; magicplan grid; Matterport grid-aligned wall placement)
- Intersection snap for walls (Xactimate mobile)
- Room-to-room green snap (magicplan assemble)
- Pinch zoom + pan; desktop zoom tools; 2D↔3D/dollhouse check (Matterport, Xactimate)
- Underlays / prior floor ghosting (Xactimate underlay; Symbility “superimpose” floors in training)

### 4.4 Toolbars & contextual menus

| Paradigm | Example |
| --- | --- |
| Desktop ribbon + shortcuts | Xactimate, Symbility |
| Collapsed last-used flyout | Xactimate mobile |
| Insert → Room → method | magicplan |
| Selection → bottom sheet actions | Xactimate mobile, magicplan details |
| Desktop-only layout editor | Matterport Property Layout |

### 4.5 Interactions that make non-technical users fast

1. One-tap default room size (Xactimate mobile)  
2. Drag wall with visible handles (red diamonds)  
3. Numeric dimension entry + Bluetooth laser (magicplan)  
4. Dimension lock during assemble  
5. Scan/capture first, edit second (Encircle, Hover, Mitigate, DocuSketch)  
6. Speech room labels while scanning (Encircle FAQ)  
7. Place moisture points without waiting for plan (Encircle)  
8. Single-wall calibrate scales whole scan (Mitigate)  
9. Room templates with mirror/flip/rotate (Symbility training)  
10. Keyboard shortcuts for power users; hidden from novices (desktop estimate tools)

---

## 5. Touch vs desktop

| Concern | Touch / field | Desktop / office |
| --- | --- | --- |
| Primary task | Capture, rough plan, moisture, photos | Finalize estimate geometry, imports, reports |
| Tool chrome | Flyouts, bottom sheets, large targets | Ribbons, property panes, shortcuts |
| Drawing precision | Snap + defaults + calibrate | Vertex/break/fine properties |
| Layout editing | magicplan/Xactimate mobile strong; Matterport **no** Property Layout on mobile | Matterport / X1 Sketch / Symbility desktop |
| Offline | Estimate iOS offline diagramming; Mitigate field capture | Sync/import when back |
| Dual-hand gestures | Pinch zoom, two-finger rotate preview | Mouse wheel + modifiers |

**Implication for RestoreAssist (web-first + Capacitor):** Treat tablet as primary canvas; keep 56px dock tools; prefer bottom/context sheets over hover-only menus; don’t put critical layout edit only on desktop.

---

## 6. Restoration-specific patterns

| Pattern | Leaders | Notes |
| --- | --- | --- |
| Moisture points on plan | magicplan, Encircle Hydro, Mitigate | Repeatable locations across drying days |
| Room-cropped moisture map from whole-house plan | Encircle | Orange crop guides |
| Freehand water / affected area | Encircle Hydro, magicplan affected areas | Visual extent of loss |
| Equipment placement icons | magicplan | Air movers, dehus, scrubbers… |
| Photo linked to room / opening | Xactimate mobile Camera on selection | Claim evidence locality |
| Estimate export ESX/FML | magicplan, DocuSketch, Encircle, Hover, Plnar | Sketch is worthless if it can’t enter carrier workflow |
| Scan while cluttered | Encircle claims “see through” furniture if floor-wall junction visible | Field reality |
| Readings before sketch ready | Encircle | Don’t block drying documentation on processing SLA |
| IICRC-ish drying narrative | Mitigate, magicplan moisture product | Plan is a drying instrument, not just a floor CAD |

---

## 7. Comparison table

| Product | Sketch approach | Strengths | Weaknesses | Restoration relevance |
| --- | --- | --- | --- | --- |
| **Xactimate Sketch** | Manual room/wall CAD + AR/Scan | Industry standard quantities; deep tools; mobile+desktop | Steep learning curve; Android sunset | **Critical** |
| **Cotality/Symbility Estimate** | Manual shapes + RoomPlan + FML import | Carrier-native; offline iOS; hotkeys | Manual still needed when imports fail | **High** |
| **magicplan** | Manual draw + AR scan + assemble | Best public manual UX; moisture + equipment; ESX/FML | Full-home assemble can feel slow vs video-scan rivals | **High** |
| **Encircle Floor Plan** | Video scan → plan + Quick Editor | Fast for techs; Hydro moisture; Xactimate import | Little true CAD; processing wait | **High** |
| **DocuSketch** | 360 → service sketch | Defensible ESX/FML; rich fixtures | Not interactive field sketch; cost/SLA variance `[mkt]` | **High (docs)** |
| **Hover Interiors** | Photo/LiDAR → measured plans | Carrier trust; cabinets/openings | Weak public manual-edit story | **High (claims)** |
| **Matterport Layout** | Twin → AI layout + desktop edit | Strong boundary editor UX; dollhouse check | Desktop-only edit; not mitigation-native | **Medium** |
| **Mitigate (+ DASH)** | LiDAR scan + calibrate; DASH = ops | Drying workflow; huge time save vs grid draw | Manual draw docs sparse; LiDAR Apple-only | **High (mitigation)** |
| **Plnar** | Instant scan → estimate import | Removes tracing | Not a sketcher UI | **Medium-High** |
| **RocketSketch** | Phone capture → plan/tour | Speed messaging | Thin public editor detail | **Medium** |
| **CompanyCam** | **No floor-plan sketch** | Great photo markup | No plan geometry | Photo-only |
| **JobNimbus** | **No native sketch** | CRM + XA financials | Attach external sketches | Ops-only |

---

## 8. Usability pitfalls leaders actively avoid

| Pitfall | How leaders avoid it |
| --- | --- |
| Wall-by-wall unclosed rooms | Push Room tool / templates first (Xactimate training) |
| Dimensions drift when assembling | magicplan **Lock** measurements |
| Floating doors/windows | Wall-hosted placement only |
| Dimension clutter | Encircle omits short/feature dims; optional measurement lines |
| Blocking drying docs on sketch SLA | Encircle place readings without map |
| Forcing CAD training on mitigation techs | Scan-first products (Encircle, Mitigate, DocuSketch) |
| Accidental scale errors after LiDAR | Mitigate single-wall **Calibrate** |
| Open concept mis-segmentation | Matterport **invisible walls** |
| Overlapping rooms breaking 3D | magicplan dotted-wall overlap warning |
| Duplicate estimate entry | Direct ESX/FML / property data import |
| Tiny touch targets / lost tools | Last-used flyout; bottom sheets; large handles |
| Mobile-only layout lockout | Matterport explicitly desktop for Property Layout — a cautionary pattern |

---

## 9. RestoreAssist mapping (verified from codebase skim)

Existing strengths in `components/sketch/`:

| Capability | Location / note |
| --- | --- |
| Tools: select, room, wall/line, door, window, damage, freehand, text, arrow, measure, moisture, photo, pan | `SketchDockToolbar`, `SketchCanvas` `ToolMode` |
| Grid + right-angle + endpoint snap (default on) | `SketchEditorV2` / `SketchCanvas` RA-6844 |
| Door/window snap to nearest wall | `SketchCanvas` |
| Moisture pin overlay | `SketchMoistureLayer` |
| Evidence pins / photo linkage | `SketchEvidenceLayer` |
| Scale calibration (2-click) | `SketchScaleModal` |
| Floor plan underlay + transform | `FloorPlanUnderlayLoader`, `UnderlayTransformControls` |
| Multi-floor tabs + auto-save / sync queue | `SketchFloorTabs`, NIR sync |
| RoomPlan LiDAR ingest + correction custody | Capacitor bridge + provenance (`underlay_reference` vs `operator_measured`) |
| Touch-first dock (56px), guided vs technician modes | `SketchDockToolbar` |
| Selection panel: room type/colors, materials, S500, WHS, provenance | `SketchSelectionPanel` |

Gaps vs leaders (product, not bugs): typed wall dimensions + lock; square-room one-tap defaults; room assembly snap affordances; equipment symbol library; room-crop moisture map workflow; richer wall-opening handles; estimate export (ESX/FML) if US claims expansion requires it.

---

## 10. Actionable recommendations for RestoreAssist

### P0 — Adopt soon (field speed & claim defensibility)

1. **Room-first defaults with typed dimensions**  
   - Mirror Xactimate mobile: tap-place rectangular room at a sensible default; immediately offer L×W numeric edit.  
   - Map to: `room` tool + `SketchSelectionPanel` / post-create modal.

2. **Wall-opening handles + host-wall binding UX polish**  
   - Show clear end handles when door/window selected; drag along wall to resize; keep host wall binding (already partially implemented).  
   - Avoid “floating” openings — leaders never allow this.

3. **Dimension labels on walls with edit + lock**  
   - magicplan pattern: visible dim → edit → lock so later nudges don’t cascade.  
   - Critical for tablet techs tracing underlays.

4. **Moisture workflow: place pins before / without perfect geometry**  
   - Encircle pattern: don’t block readings on underlay/RoomPlan confirmation.  
   - Keep pins; add “place existing” when room polygon arrives.

5. **Scan → confirm → annotate pipeline as the happy path**  
   - Market/product narrative: RoomPlan/underlay generates draft; tech confirms provenance (`operator_measured`); then damage/moisture/photos.  
   - Matches Mitigate/Encircle mental model; manual blank canvas remains fallback (Android / no LiDAR).

### P1 — Improve next

6. **Restoration equipment symbol set** (air mover, dehumidifier, air scrubber, cavity dryer) as placeable objects — magicplan parity for drying reports.  
7. **Room assembly / adjacency snap** with visible guides when two room polygons share a wall (green-indicator analogue).  
8. **Room templates** (rect, L, T) with flip/rotate — Symbility training pattern.  
9. **Missing wall / opening tool** distinct from door/window (Xactimate `M` / Symbility `O`).  
10. **Room-crop moisture map** for reports (export cropped room + pins + freehand water layer).  
11. **Bluetooth laser / numeric wall entry** where hardware available (magicplan).  
12. **Underlay dim readability rules** — auto-hide dims on short segments; allow measure-line tool (Encircle).

### P2 — Consider / avoid

13. **Consider:** ESX/FML or structured estimate export if targeting US carrier workflows.  
14. **Consider:** Speech-to-label rooms during capture (Encircle).  
15. **Avoid:** Desktop-only layout editing (Matterport’s mobile gap).  
16. **Avoid:** Forcing wall-by-wall CAD as the primary onboarding path.  
17. **Avoid:** Treating CompanyCam-style photo markup as a substitute for plan geometry.  
18. **Avoid:** Building a full Xactimate clone — partner/export or “good enough for mitigation scope” is the restoration sweet spot.  
19. **Avoid:** Blocking field work on cloud processing SLAs without offline/manual fallback.

---

## 11. Appendix: source links

### Xactimate / Verisk
- https://xactware.helpdocs.io/l/enUS/article/kWHFcRnSRw-sketch-quick-reference  
- https://xactware.helpdocs.io/l/enUS/article/mlgDq1N8iH-sketch-window-overview  
- https://xactware.helpdocs.io/l/enUS/article/ksnxxsdrqe-how-to-create-a-sketch-in-xactimate-mobile  
- https://xactware.helpdocs.io/l/enUS/article/fgjhav5r4q-sketch-ar-in-xactimate-mobile  
- https://xactware.helpdocs.io/l/enUS/article/d5wegz2dzo-whats-new-for-xactimate-mobile  
- https://www.docusketch.com/post/how-to-sketch-a-room-in-xactimate  
- https://prideestimating.com/mastering-xactimate-sketching/

### magicplan
- https://help.magicplan.app/create-a-room-with-the-define-corners-feature  
- https://help.magicplan.app/creating-floor-plans-in-magicplan-on-your-android-device  
- https://help.magicplan.app/change-dimensions-of-your-floor-plan  
- https://help.magicplan.app/assemble-your-rooms-to-a-floor-plan  
- https://help.magicplan.app/add-furniture-objects  
- https://help.magicplan.app/restoration-equipment-placement  
- https://magicplan.app/product/moisture-mapping  
- https://magicplan.app/solution/water-mitigation  
- https://magicplan.app/integrations/xactimate  
- https://magicplan.app/blog/corelogic-claims-instant-sketches

### Encircle
- https://www.getencircle.com/solutions/floor-plan/  
- https://help.encircleapp.com/hc/en-us/articles/11397605722253-Adding-a-Floor-Plan  
- https://help.encircleapp.com/hc/en-us/articles/12200869740557-Encircle-Floor-Plan-FAQ  
- https://help.encircleapp.com/hc/en-us/articles/12198894767629-Using-the-Quick-Editor  
- https://help.encircleapp.com/hc/en-us/articles/18955629046797-Importing-an-Encircle-Floor-Plan-into-Xactimate  
- https://help.encircleapp.com/hc/en-us/articles/18384800011021-Moisture-Maps-Moisture-Points  
- https://help.encircleapp.com/hc/en-us/articles/13472318967949-Can-I-take-material-readings-while-I-wait-for-my-floor-plan  
- https://hub.getencircle.com/learn/floor-plan/  
- https://www.youtube.com/watch?v=mywBLwbwxM8  
- https://www.youtube.com/watch?v=-HGZhbVrh4s

### Cotality / Symbility / Mitigate / DASH
- https://support.symbilityproperty.com/en/support/solutions/articles/24000105058-estimate-ios-overview-and-user-guide  
- https://support.symbilityproperty.com/en/support/solutions/articles/6000125688-shortcut-keys-guide-for-claims-estimate  
- https://support.symbilityproperty.com/en/support/solutions/articles/24000069278-plnar  
- https://www.nextgearsolutions.com/solutions/inspection-and-scoping/mitigate/  
- https://www.nextgearsolutions.com/solutions/job-management/dash-restoration-business-management/  
- https://www.cotality.com/products/restoration-mitigate  
- https://corelogic.freshdesk.com/support/solutions/articles/151000184221-lidar-scanning-in-mitigate  
- https://www.cotality.com/resources/article/jarvis-restoration-leveraging-dash-and-mitigate-lidar-scan  
- https://www.youtube.com/watch?v=CkhoYRdvdm8

### DocuSketch / Hover / Matterport / Plnar / RocketPlan
- https://www.docusketch.com/solutions/restoration-sketching-software  
- https://www.docusketch.com/whats-new  
- https://www.docusketch.com/post/water-damage-drying-log  
- https://help.docusketch.com/docs/download-options  
- https://help.hover.to/en/articles/7061443-hover-for-interiors  
- https://help.hover.to/en/articles/12641171-hover-for-insurance  
- https://help.hover.to/en/articles/13995166-common-interior-scan-questions-from-insurance-pros  
- https://www.prnewswire.com/news-releases/hover-expands-capabilities-to-provide-measurements-and-floor-plans-of-property-interiors-301628254.html  
- https://support.matterport.com/s/article/Automated-Rooms-Measurements-and-Property-Report?language=en_US  
- https://support.matterport.com/s/article/Overview-of-Matterport-s-Editing-Features?language=en_US  
- https://support.matterport.com/s/article/AI-Enabled-Property-Intelligence-FAQs  
- https://plnar.ai/instant-sketch-for-water-mitigation-and-restoration/  
- https://plnar.ai/blog/corelogic-plnar/  
- https://rocketplantech.com/rocketsketch/

### Photo/CRM (no native sketch)
- https://companycam.com/features/annotations  
- https://help.companycam.com/en/articles/6828430-edit-and-add-drawings-to-your-photos  
- https://support.jobnimbus.com/what-is-xactimate  
- https://support.jobnimbus.com/how-do-i-use-the-xactimate-integration  
- https://www.jobnimbus.com/industries/restoration-software

### Secondary
- https://contractortoolstack.com/software/docusketch/

---

*End of report.*
