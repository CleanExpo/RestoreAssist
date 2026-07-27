# Native Apple RoomPlan/ARKit LiDAR capture — implementation plan (no Matterport)

**Status:** Plan for sign-off. **Hard gate: iOS/Swift resourcing decision** (hire/contract

- spend). Grounds the feature in the real codebase so execution starts the moment a Swift
  resource is allocated.

**Researched with:** ultrathink + an opus discovery agent. **Execution model:** Swift
(native, `ios/App`) + Opus 4.8 for the TS converter/wiring; TDD on the JS side; one PR per phase.

**Feature:** capture room geometry with Apple RoomPlan (LiDAR) on a supported iPhone/iPad,
convert it to editor geometry, and land it in Mapping V2 as `captureAdapter:"roomplan"`.

---

## 0. The decisive context

- **~70% of the web/data plumbing already exists.** `prisma/schema.prisma`
  `ClaimSketch.captureAdapter` already includes the literal `"roomplan"` value; the
  provenance firewall (`SketchElement.provenance`, `lib/sketch/measured-elements.ts`,
  `decompose-elements.ts`) is built and tested; geometry ingestion is defined
  (`ClaimSketch.sketchData` Fabric blob → `extract-rooms.ts`); the underlay layer exists.
- **The cost is entirely native:** the Swift RoomPlan capture session + a Capacitor custom
  plugin + a `CapturedRoom → Fabric.js` geometry converter. **No `.swift` file references
  RoomPlan/ARKit today** — only aspirational doc mentions.
- **Two mobile apps exist — pick the right one.** Production is **Capacitor 8** (`ios/App`,
  a WebView hosting `restoreassist.app`, where `SketchEditorV2` runs). A separate **Expo**
  app (`mobile/`) does **not** host the editor. **RoomPlan must target the Capacitor app.**
- **Bridge template exists:** `lib/capacitor-bluetooth-bridge.ts` surfaces a native-only
  capability (BLE) into the WebView — RoomPlan is the same shape (native-only → plugin → web).

---

## 1. Decisions for sign-off (recommendation leads each)

| #   | Decision                      | Recommendation                                                                                                     | Why                                                                                                    |
| --- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| R1  | Target app                    | **Capacitor `ios/App`** (custom `CAPPlugin`)                                                                       | The sketch editor only runs in the Capacitor WebView; the Expo app can't consume it                    |
| R2  | Provenance of RoomPlan output | **`operator_measured`, `captureAdapter:"roomplan"`**                                                               | IP brief treats independently-measured LiDAR as legitimately measured (unlike scraped/imported plans)  |
| R3  | **Resourcing (the gate)**     | **Allocate a Swift/ARKit Capacitor-plugin dev + a TS integration eng; scope a 2–3 week spike first**               | This is genuine native ARKit work, unlike all current thin-wrapper bridges — needs real Swift capacity |
| R4  | Device support                | **iOS 16+ LiDAR only; feature-detect (`RoomCaptureSession.isSupported`), hide UI elsewhere; Android out of scope** | RoomPlan is Apple-LiDAR-only; mirror the existing iOS-only BLE branch                                  |
| R5  | MVP capture flow              | **Capture → 2D polygons → land as measured rooms the tech confirms on site**                                       | Smallest end-to-end slice; richer 3D/object capture is a later phase                                   |

**Phase 0 gate:** R3 resourcing allocated + R1–R5 confirmed. Nothing below starts first.

---

## 2. Build phases (one PR per phase; TDD on the TS side)

### Phase 1 — Capacitor plugin scaffold (native)

- New Swift `CAPPlugin` `RoomPlanPlugin` in `ios/App` + TS plugin definition; expose
  `isSupported()` (wraps `RoomCaptureSession.isSupported`). Wire into `useCapacitor()` flags.
- Add ARKit world-sensing usage strings to `Info.plist`.
- **Verify:** `isSupported()` returns true on a LiDAR device, false on simulator/non-LiDAR.

### Phase 2 — RoomPlan capture session (native)

- `startCapture()` → presents `RoomCaptureView`, runs the session, returns the `CapturedRoom`
  (walls/openings/objects, metres) as JSON to JS. Handle cancel/error/permission-denied.
- **Verify:** a real scan returns structured room geometry to the WebView.

### Phase 3 — CapturedRoom → Fabric.js converter (TS, TDD)

- `lib/sketch/roomplan-to-fabric.ts`: map RoomPlan 3D surfaces (metres) → Fabric polygon JSON
  in the editor's coordinate/scale space; set `data.type="room"`, scale via `pxPerMetre`.
- **Tests:** known CapturedRoom fixture → expected polygons + areas (shoelace), pure + deterministic.

### Phase 4 — Editor ingestion

- `SketchEditorV2` receives converted geometry → adds rooms tagged
  `captureAdapter:"roomplan"` + provenance (R2) → persists via existing `enqueueSketchSave`
  / `/api/inspections/[id]/sketches`. No new save path.
- **Tests (jsdom):** ingested rooms carry `captureAdapter:"roomplan"` + correct provenance.

### Phase 5 — Device-gated UX + graceful absence

- Show the "Scan room (LiDAR)" entry only when supported; clean fallback message otherwise.

### Phase 6 — Field verification

- On-device field test (LiDAR iPhone/iPad): scan → rooms land → areas sane → feed S500/scope.
  3-line verification ledger.

---

## 3. Reuse map

| Need                             | Reuse                                                                        |
| -------------------------------- | ---------------------------------------------------------------------------- |
| Native capability bridge pattern | `lib/capacitor-bluetooth-bridge.ts`, `lib/capacitor.ts`, `CapacitorProvider` |
| Capture-adapter field            | `ClaimSketch.captureAdapter` (`"roomplan"` already present)                  |
| Provenance firewall              | `SketchElement.provenance`, `measured-elements.ts`, `decompose-elements.ts`  |
| Geometry ingestion + area        | `ClaimSketch.sketchData`, `extract-rooms.ts`, `enqueueSketchSave`            |
| iOS project                      | `ios/App/App.xcodeproj`, `CapApp-SPM/Package.swift`                          |

## 4. Do-NOT

- Do **not** build this in the Expo `mobile/` app — the editor isn't there (R1).
- Do **not** start native work before R3 resourcing is allocated.
- Do **not** ship without device feature-detection (RoomPlan crashes/absent on non-LiDAR).
- Do **not** assume Android — Apple-only; plan graceful absence.
- Do **not** introduce Matterport, its SDK, cloud processing, cameras, subscriptions, exports,
  account dependency, or data pipeline. The approved implementation is native Apple
  RoomPlan/ARKit LiDAR on supported iPhone/iPad hardware.
- Do **not** market RoomPlan output as survey-grade, millimetre-accurate, or a substitute for
  independently validated measurement. Preserve captured values, correction history, device
  metadata, and operator confirmation so the limitations remain visible.

---

## 5. July 2026 floor-plan findings added to the delivery scope

### Existing foundations to reuse

- `LidarScan` and `FloorPlan` data models already exist in `prisma/schema.prisma`.
- `lib/sketch/roomplan-to-fabric.ts` already provides the pure RoomPlan-to-editor conversion
  seam; extend and test it rather than creating a second converter.
- Floor-plan underlays, homeowner capture surfaces, `ClaimSketch.captureAdapter="roomplan"`,
  provenance controls, and the Capacitor iOS shell are present.
- The production surface is the Capacitor app under `ios/App`; the Expo `mobile/` app is not
  the Mapping V2 host.

### Missing product work

1. **Native Swift scanner:** implement the real `RoomCaptureSession`/`RoomCaptureView` flow,
   capability detection, camera permission handling, cancellation, interruptions, and structured
   error return on supported LiDAR-equipped Apple devices.
2. **Capacitor bridge:** expose support detection, capture lifecycle, progress, cancel, and final
   `CapturedRoom` payloads to the existing web editor without introducing a parallel save path.
3. **Offline-first custody:** persist the native capture, canonical JSON and export artefacts in an
   on-device queue; resume idempotent upload after connectivity returns; never treat a Data URL
   string hash as proof of final stored bytes.
4. **Technician correction workflow:** let the technician correct wall joins, dimensions, doors,
   windows, openings, room labels and excluded geometry before confirmation. Preserve original
   capture, corrections, operator identity, timestamps and revision history.
5. **Room-linked evidence:** bind photos, moisture readings, notes, hazards, equipment and scope
   items to stable room/surface identifiers so a floor plan is operational evidence, not a loose
   drawing.
6. **Report and portal rendering:** add consistent floor-plan views to inspection PDFs, claim
   exports and the customer/insurer portal, with legends, scale caveats, provenance and correction
   status.
7. **Manual fallback:** provide the same room/evidence workflow through manual drawing and entered
   measurements on non-LiDAR devices or failed scans; unsupported hardware must not dead-end an
   inspection.
8. **Accuracy validation:** run a bounded field study against independently measured rooms across
   representative layouts and materials before publishing accuracy claims or using scans for
   contractual quantities without operator confirmation.

### Evidence-integrity prerequisite

`RA-7090` is the prerequisite for stronger evidence claims. Before RoomPlan custody is represented
as tamper-evident, the implementation must hash the exact final stored bytes, upload the inspected
payload, verify any applicable signature, retain an auditable correction/deletion history, and
remove public copy that overstates universal Ed25519 signing. Native scanning and converter tests
may progress in parallel, but stronger custody claims fail closed until `RA-7090` is verified.

### Updated acceptance path

The end-to-end acceptance path is: supported-device check → native scan → durable offline queue →
canonical conversion → technician correction and confirmation → room-linked evidence → idempotent
upload → editable Mapping V2 floor plan → report/portal render → manual fallback verification. Test
on at least one supported LiDAR device and one unsupported device. Matterport must be absent from
dependencies, runtime traffic, documentation and acceptance evidence.
