/**
 * RA-8237 — calibrated square and irregular room measurement.
 *
 * Fixtures are the two rooms named by the ticket, drawn on a floor whose
 * scale is not the 100 px/m default:
 *   square 3 m × 3 m           -> 9 m², perimeter 12 m
 *   L-shape (0,0)(4,0)(4,2)(2,2)(2,4)(0,4) m -> 12 m², perimeter 16 m
 * Its bounding box (4 × 4 = 16 m²) must never stand in for the L-room.
 */
import { describe, expect, it } from "vitest";
import {
  canonicalRoomAreaFields,
  confirmRoomAreaFields,
  resolveRoomAreaM2,
  resolveRoomPerimeterM,
  resolveRoomQuantities,
  resolveWallAreaM2,
} from "@/lib/sketch/room-area-from-geometry";
import { extractRoomGraphNodes } from "@/lib/sketch/sync-room-graph";
import { extractRooms } from "@/lib/sketch/extract-rooms";
import { extractSketchEstimate } from "@/lib/sketch-estimate-extractor";
import {
  reconcileRoomMeasurementEvidence,
  roomRevisionsFromSketchData,
} from "@/lib/sketch/room-measurement-evidence";
import { withCalibrationHistory } from "@/lib/sketch/scale-calibration";
import { scaleConfigFromStoredSketchData } from "@/lib/sketch/pending-sketch-load";
import { fabricObjectToSelected } from "@/lib/sketch/selected-object";

const SQUARE_M: Array<[number, number]> = [
  [0, 0],
  [3, 0],
  [3, 3],
  [0, 3],
];
const L_SHAPE_M: Array<[number, number]> = [
  [0, 0],
  [4, 0],
  [4, 2],
  [2, 2],
  [2, 4],
  [0, 4],
];
const SCALES = [100, 50] as const;

function px(vertsM: Array<[number, number]>, ppm: number) {
  return vertsM.map(([x, y]) => ({ x: x * ppm, y: y * ppm }));
}

function room(
  id: string,
  vertsM: Array<[number, number]>,
  ppm: number,
  data: Record<string, unknown> = {},
) {
  return {
    type: "polygon",
    points: px(vertsM, ppm),
    data: {
      type: "room",
      id,
      label: id,
      provenance: "operator_measured",
      ...data,
    },
  };
}

function sketch(ppm: number, objects: unknown[]) {
  return { scaleConfig: { pxPerMetre: ppm }, objects } as Record<
    string,
    unknown
  > & { objects: never[] };
}

describe.each(SCALES)("RA-8237 at %s px/m", (ppm) => {
  it("square 3×3 resolves to 9 m² and 12 m from calibrated geometry", () => {
    const sq = room("sq", SQUARE_M, ppm, { areaSource: "geometry" });
    const q = resolveRoomQuantities(sq, ppm);
    expect(q.areaM2).toBeCloseTo(9, 6);
    expect(q.perimeterM).toBeCloseTo(12, 6);
    expect(q.source).toBe("geometry");
  });

  it("L-shape resolves to 12 m² and 16 m, never its 16 m² bounding box", () => {
    // Bounding-box L×W left on the room by an earlier rectangle edit.
    const l = room("l", L_SHAPE_M, ppm, { lengthM: 4, widthM: 4 });
    expect(resolveRoomAreaM2(l, ppm)).toBeCloseTo(12, 6);
    expect(resolveRoomPerimeterM(l, ppm)).toBeCloseTo(16, 6);
    const tagged = room("l2", L_SHAPE_M, ppm, {
      areaSource: "geometry",
      lengthM: 4,
      widthM: 4,
    });
    expect(resolveRoomAreaM2(tagged, ppm)).toBeCloseTo(12, 6);
  });

  it("perimeter honours the Fabric transform scale", () => {
    // Half-size points stretched ×2 by the object transform.
    const sq = {
      ...room("sq", SQUARE_M, ppm / 2, { areaSource: "geometry" }),
      scaleX: 2,
      scaleY: 2,
    };
    expect(resolveRoomPerimeterM(sq, ppm)).toBeCloseTo(12, 6);
    const nodes = extractRoomGraphNodes(sketch(ppm, [sq]));
    expect(nodes[0].areaM2).toBeCloseTo(9, 6);
    expect(nodes[0].perimeterM).toBeCloseTo(12, 6);
  });

  it("sync-room-graph uses the floor scale for both rooms", () => {
    const nodes = extractRoomGraphNodes(
      sketch(ppm, [
        room("sq", SQUARE_M, ppm),
        room("l", L_SHAPE_M, ppm, { lengthM: 4, widthM: 4 }),
      ]),
    );
    const byId = new Map(nodes.map((n) => [n.fabricObjectId, n]));
    expect(byId.get("sq")?.areaM2).toBeCloseTo(9, 6);
    expect(byId.get("sq")?.perimeterM).toBeCloseTo(12, 6);
    expect(byId.get("l")?.areaM2).toBeCloseTo(12, 6);
    expect(byId.get("l")?.perimeterM).toBeCloseTo(16, 6);
  });

  it("sync-room-graph never carries a non-positive claimed area", () => {
    const nodes = extractRoomGraphNodes(
      sketch(ppm, [room("sq", SQUARE_M, ppm, { areaM2: 0 })]),
    );
    expect(nodes[0].areaM2).toBeCloseTo(9, 6);
  });

  it("extractRooms and the estimate agree: 12 m² L floor, 43.2 m² L walls", () => {
    const l = room("Lounge", L_SHAPE_M, ppm, {
      lengthM: 4,
      widthM: 4,
      ceilingHeightM: 2.7,
    });
    expect(extractRooms(sketch(ppm, [l]))[0].areaM2).toBeCloseTo(12, 6);
    expect(resolveWallAreaM2(l, ppm)).toBeCloseTo(43.2, 6);
    const est = extractSketchEstimate([
      { floorLabel: "Ground", sketchData: sketch(ppm, [l]) },
    ]);
    expect(est.totalRoomAreaM2).toBeCloseTo(12, 6);
  });

  it("gross walls and affected floor stay separate from total floor", () => {
    const sq = room("Bedroom", SQUARE_M, ppm, {
      areaSource: "geometry",
      ceilingHeightM: 2.7,
    });
    // 2 m × 1 m affected zone inside the bedroom.
    const zone = {
      type: "polygon",
      points: px(
        [
          [0, 0],
          [2, 0],
          [2, 1],
          [0, 1],
        ],
        ppm,
      ),
      data: {
        type: "damage-zone",
        isDamageZone: true,
        provenance: "operator_measured",
      },
    };
    const est = extractSketchEstimate([
      { floorLabel: "Ground", sketchData: sketch(ppm, [sq, zone]) },
    ]);
    const floor = est.lineItems.find((li) => li.notes === "Floor area");
    const walls = est.lineItems.find((li) => li.notes?.startsWith("Wall area"));
    const damage = est.lineItems.filter((li) => li.category === "damage");
    expect(floor?.areaM2).toBeCloseTo(9, 6);
    expect(walls?.areaM2).toBeCloseTo(32.4, 6);
    expect(damage).toHaveLength(1);
    expect(damage[0].areaM2).toBeCloseTo(2, 6);
    expect(est.totalRoomAreaM2).toBeCloseTo(9, 6);
    expect(est.totalDamageAreaM2).toBeCloseTo(2, 6);
  });

  it("an imported room's area is computed at the floor scale and tagged", () => {
    const fields = canonicalRoomAreaFields(
      { type: "polygon", points: px(L_SHAPE_M, ppm), data: {} },
      ppm,
    );
    expect(fields).toEqual({ areaM2: 12, areaSource: "geometry" });
  });
});

describe("RA-8237 — Confirm cannot promote a rough hardcoded pixel area", () => {
  const PPM = 50;
  // What the import used to store on a 50 px/m floor: shoelace at 100 px/m.
  const ROUGH = (150 * 150) / (100 * 100); // 2.25

  function aiRoom(areaM2: number, extra: Record<string, unknown> = {}) {
    return room("ai-sq", SQUARE_M, PPM, {
      provenance: "ai_suggested",
      captureAdapter: "cloud_ai",
      areaM2,
      originalAreaM2: areaM2,
      ...extra,
    });
  }

  function measure(objects: unknown[]) {
    return reconcileRoomMeasurementEvidence({
      stored: [],
      rooms: roomRevisionsFromSketchData(sketch(PPM, objects)),
      submissions: [{ fabricObjectId: "ai-sq", lengthM: 3, widthM: 3 }],
      sessionUserId: "tech-1",
      now: new Date("2026-11-09T00:00:00Z"),
    });
  }

  it("the selection panel checks the measurement against the figure Confirm will send", () => {
    const sel = fabricObjectToSelected(aiRoom(ROUGH), PPM);
    expect(sel?.areaM2).toBe(9);
    // An operator room shows the area that bills.
    const drawn = room("op", L_SHAPE_M, PPM, { lengthM: 4, widthM: 4 });
    expect(fabricObjectToSelected(drawn, PPM)?.areaM2).toBeCloseTo(12, 6);
  });

  it("the rough figure on its own cannot be confirmed by a 3×3 measurement", () => {
    expect(measure([aiRoom(ROUGH)]).measuredRoomIds.has("ai-sq")).toBe(false);
  });

  it("Confirm canonicalises to 9 m² geometry, which the 3×3 measurement matches", () => {
    const rough = aiRoom(ROUGH);
    const canonical = canonicalRoomAreaFields(rough, PPM);
    expect(canonical).toEqual({ areaM2: 9, areaSource: "geometry" });
    const confirmed = { ...rough, data: { ...rough.data, ...canonical } };
    const result = measure([confirmed]);
    expect(result.measuredRoomIds.has("ai-sq")).toBe(true);
    // Source history survives canonicalisation.
    expect(confirmed.data.originalAreaM2).toBe(ROUGH);
    const node = extractRoomGraphNodes(sketch(PPM, [confirmed]))[0];
    expect(node.areaM2).toBeCloseTo(9, 6);
    expect(node.originalAreaM2).toBe(ROUGH);
  });
});

describe("RA-8237 — recalibration, undo/redo and reload", () => {
  const drawnAt100 = () =>
    room("sq", SQUARE_M, 100, { areaM2: 9, areaSource: "geometry" });

  it("recalibrating the floor re-derives a geometry room at the new scale", () => {
    // 300 px square: 3 m at 100 px/m, 6 m at 50 px/m.
    const r = drawnAt100();
    expect(resolveRoomAreaM2(r, 100)).toBeCloseTo(9, 6);
    expect(resolveRoomAreaM2(r, 50)).toBeCloseTo(36, 6);
    expect(resolveRoomPerimeterM(r, 50)).toBeCloseTo(24, 6);
    const node = extractRoomGraphNodes(sketch(50, [r]))[0];
    expect(node.areaM2).toBeCloseTo(36, 6);
  });

  it("recalibration invalidates the confirmed measurement bound to the old scale", () => {
    const r = room("ai-sq", SQUARE_M, 100, {
      provenance: "operator_measured",
      captureAdapter: "cloud_ai",
      areaM2: 9,
      areaSource: "geometry",
    });
    const first = reconcileRoomMeasurementEvidence({
      stored: [],
      rooms: roomRevisionsFromSketchData(sketch(100, [r])),
      submissions: [{ fabricObjectId: "ai-sq", measuredAreaM2: 9 }],
      sessionUserId: "tech-1",
    });
    expect(first.measuredRoomIds.has("ai-sq")).toBe(true);
    // Reload at the same scale keeps it.
    const reload = reconcileRoomMeasurementEvidence({
      stored: first.evidence,
      rooms: roomRevisionsFromSketchData(sketch(100, [r])),
      submissions: [],
      sessionUserId: "tech-1",
    });
    expect(reload.measuredRoomIds.has("ai-sq")).toBe(true);
    // Recalibrated to 50 px/m: stale, kept as history, not current.
    const recal = reconcileRoomMeasurementEvidence({
      stored: reload.evidence,
      rooms: roomRevisionsFromSketchData(sketch(50, [r])),
      submissions: [],
      sessionUserId: "tech-1",
    });
    expect(recal.measuredRoomIds.has("ai-sq")).toBe(false);
    expect(recal.evidence).toHaveLength(1);
    expect(recal.evidence[0].status).toBe("invalidated");
  });

  it("undo/redo of a geometry edit cannot leave a stale cached area", () => {
    // Undo restores an older object snapshot (cached areaM2 from the old
    // scale) while the floor keeps its new scale. Quantities follow the
    // geometry and the floor scale only, so undo and redo stay consistent.
    const before = drawnAt100();
    const snapshot = JSON.parse(JSON.stringify(before));
    const edited = room("sq", L_SHAPE_M, 100, {
      areaM2: 12,
      areaSource: "geometry",
    });
    for (const ppm of [100, 50]) {
      expect(resolveRoomAreaM2(snapshot, ppm)).toBeCloseTo(
        resolveRoomAreaM2(before, ppm) as number,
        6,
      );
    }
    expect(resolveRoomAreaM2(edited, 50)).toBeCloseTo(48, 6);
    expect(resolveRoomAreaM2(snapshot, 50)).toBeCloseTo(36, 6);
  });

  it("typed dimensions stay authoritative through recalibration until the shape changes", () => {
    const typed = room("typed", SQUARE_M, 100, {
      areaSource: "dimensions",
      dimensionsPxPerMetre: 100,
      lengthM: 3,
      widthM: 3,
      areaM2: 9,
    });
    expect(resolveRoomQuantities(typed, 50)).toMatchObject({
      areaM2: 9,
      perimeterM: 12,
      source: "dimensions",
    });
    // Resized evenly by its handles (same aspect): the typed 3 × 3 is stale.
    const resized = { ...typed, scaleX: 4 / 3, scaleY: 4 / 3 };
    expect(resolveRoomQuantities(resized, 100)).toMatchObject({
      source: "geometry",
    });
    expect(resolveRoomAreaM2(resized, 100)).toBeCloseTo(16, 6);
    // Reshaped by handles into an L: the typed rectangle no longer applies.
    const reshaped = { ...typed, points: px(L_SHAPE_M, 100) };
    expect(resolveRoomQuantities(reshaped, 100)).toMatchObject({
      source: "geometry",
    });
    expect(resolveRoomAreaM2(reshaped, 100)).toBeCloseTo(12, 6);
    expect(resolveRoomPerimeterM(reshaped, 100)).toBeCloseTo(16, 6);
  });

  // Codex round 1 (713833df): a tagged room whose polygon is malformed must
  // not fall back to a typed or cached figure.
  const pts = (xy: Array<[number, number]>) => xy.map(([x, y]) => ({ x, y }));
  const BOWTIE = pts([
    [0, 0],
    [300, 300],
    [0, 300],
    [300, 0],
  ]);
  const DUP_CORNER_TRIANGLE = pts([
    [0, 0],
    [300, 0],
    [300, 300],
    [300, 300],
  ]);

  it("typed L × W needs four distinct rectangle corners (duplicate-corner triangle)", () => {
    const tri = {
      type: "polygon",
      points: DUP_CORNER_TRIANGLE,
      data: {
        type: "room",
        provenance: "operator_measured",
        areaSource: "dimensions",
        dimensionsPxPerMetre: 100,
        lengthM: 3,
        widthM: 3,
        areaM2: 9,
      },
    };
    const q = resolveRoomQuantities(tri, 100);
    expect(q.source).toBe("geometry");
    expect(q.areaM2).toBeCloseTo(4.5, 6);
    const est = extractSketchEstimate([
      { floorLabel: "Ground", sketchData: sketch(100, [tri]) },
    ]);
    expect(est.totalRoomAreaM2).toBeCloseTo(4.5, 6);
  });

  it("typed L × W does not cover a four-sided non-rectangle in the same box", () => {
    const trapezoid = {
      type: "polygon",
      points: pts([
        [0, 0],
        [300, 0],
        [300, 300],
        [100, 300],
      ]),
      data: {
        type: "room",
        provenance: "operator_measured",
        areaSource: "dimensions",
        dimensionsPxPerMetre: 100,
        lengthM: 3,
        widthM: 3,
      },
    };
    expect(resolveRoomQuantities(trapezoid, 100)).toMatchObject({
      source: "geometry",
    });
    expect(resolveRoomAreaM2(trapezoid, 100)).toBeCloseTo(7.5, 6);
  });

  it.each(["geometry", "dimensions"])(
    "a self-crossing polygon tagged %s bills nothing, not its cached figure",
    (areaSource) => {
      const bow = {
        type: "polygon",
        points: BOWTIE,
        data: {
          type: "room",
          provenance: "operator_measured",
          areaSource,
          dimensionsPxPerMetre: 100,
          lengthM: 3,
          widthM: 3,
          areaM2: 9,
        },
      };
      expect(resolveRoomQuantities(bow, 100)).toEqual({
        areaM2: null,
        perimeterM: null,
        source: null,
      });
      const est = extractSketchEstimate([
        { floorLabel: "Ground", sketchData: sketch(100, [bow]) },
      ]);
      expect(est.totalRoomAreaM2).toBe(0);
      expect(extractRoomGraphNodes(sketch(100, [bow]))[0].areaM2).toBeNull();
      expect(canonicalRoomAreaFields(bow, 100)).toBeNull();
    },
  );

  it("Confirm on a malformed drawing tags it so its cached figure cannot bill", () => {
    const looped = {
      type: "polygon",
      points: pts([
        [0, 100],
        [300, 100],
        [300, 200],
        [100, 200],
        [100, 0],
        [200, 0],
        [200, 300],
        [0, 300],
      ]),
      data: {
        type: "room",
        id: "ai-loop",
        provenance: "operator_measured",
        captureAdapter: "cloud_ai",
        areaM2: 9,
      },
    };
    const fields = confirmRoomAreaFields(looped, 100);
    expect(fields).toEqual({ areaSource: "geometry" });
    const confirmed = { ...looped, data: { ...looped.data, ...fields } };
    expect(resolveRoomAreaM2(confirmed, 100)).toBeNull();
    expect(extractRoomGraphNodes(sketch(100, [confirmed]))[0].areaM2).toBeNull();
    // A valid drawing gets its calibrated area.
    expect(confirmRoomAreaFields(room("ok", SQUARE_M, 50), 50)).toEqual({
      areaM2: 9,
      areaSource: "geometry",
    });
  });

  it("a self-crossing polygon whose loops overlap is not billed by its shoelace", () => {
    // Winds twice round the centre square: shoelace would overstate it.
    const looped = {
      type: "polygon",
      points: pts([
        [0, 100],
        [300, 100],
        [300, 200],
        [100, 200],
        [100, 0],
        [200, 0],
        [200, 300],
        [0, 300],
      ]),
      data: { type: "room", provenance: "operator_measured", areaSource: "geometry" },
    };
    expect(resolveRoomAreaM2(looped, 100)).toBeNull();
  });

  it("an imported self-crossing polygon cannot be confirmed by any measurement", () => {
    const bow = {
      type: "polygon",
      points: BOWTIE,
      data: {
        type: "room",
        id: "ai-bow",
        provenance: "ai_suggested",
        captureAdapter: "cloud_ai",
        areaSource: "geometry",
        areaM2: 9,
      },
    };
    const result = reconcileRoomMeasurementEvidence({
      stored: [],
      rooms: roomRevisionsFromSketchData(sketch(100, [bow])),
      submissions: [{ fabricObjectId: "ai-bow", measuredAreaM2: 9 }],
      sessionUserId: "tech-1",
    });
    expect(result.measuredRoomIds.has("ai-bow")).toBe(false);
  });

  // Codex round 2 (921bffcd): a point list with a bad vertex is a malformed
  // polygon, never an absent one.
  const MALFORMED_POINT_LISTS: Array<[string, unknown]> = [
    ["a non-numeric vertex", [{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: "bad", y: 300 }]],
    ["a NaN vertex", [{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: Number.NaN, y: 300 }, { x: 0, y: 300 }]],
    ["a null vertex", [{ x: 0, y: 0 }, { x: 300, y: 0 }, null, { x: 0, y: 300 }]],
    ["only two vertices", [{ x: 0, y: 0 }, { x: 300, y: 0 }]],
    ["a non-array points value", { x: 0, y: 0 }],
  ];

  describe.each(MALFORMED_POINT_LISTS)("a room whose points have %s", (_label, points) => {
    const base = {
      type: "polygon",
      points,
      data: {
        type: "room",
        id: "bad-room",
        provenance: "operator_measured",
        dimensionsPxPerMetre: 100,
        lengthM: 3,
        widthM: 3,
        areaM2: 9,
      },
    } as unknown as Parameters<typeof resolveRoomQuantities>[0];

    it.each(["dimensions", "geometry"])("tagged %s bills nothing", (areaSource) => {
      const r = { ...base, data: { ...base.data, areaSource } };
      expect(resolveRoomQuantities(r, 100)).toEqual({
        areaM2: null,
        perimeterM: null,
        source: null,
      });
      expect(extractRoomGraphNodes(sketch(100, [r]))[0].areaM2).toBeNull();
      expect(
        extractSketchEstimate([{ floorLabel: "G", sketchData: sketch(100, [r]) }])
          .totalRoomAreaM2,
      ).toBe(0);
      expect(confirmRoomAreaFields(r, 100)).toEqual({ areaSource: "geometry" });
      const gate = reconcileRoomMeasurementEvidence({
        stored: [],
        rooms: roomRevisionsFromSketchData(sketch(100, [r])),
        submissions: [{ fabricObjectId: "bad-room", lengthM: 3, widthM: 3 }],
        sessionUserId: "tech-1",
      });
      expect(gate.measuredRoomIds.has("bad-room")).toBe(false);
    });

    it("untagged with no claim does not fall back to its L × W box", () => {
      const r = { ...base, data: { ...base.data, areaM2: undefined } };
      expect(resolveRoomAreaM2(r, 100)).toBeNull();
      expect(resolveRoomPerimeterM(r, 100)).toBeNull();
    });
  });

  it("an empty point list is no polygon: a typed rectangle still bills", () => {
    const r = {
      type: "rect",
      points: [],
      data: {
        type: "room",
        provenance: "operator_measured",
        areaSource: "dimensions",
        lengthM: 3,
        widthM: 3,
      },
    };
    expect(resolveRoomQuantities(r, 100)).toMatchObject({
      areaM2: 9,
      source: "dimensions",
    });
  });

  it("legacy untagged rooms keep their claimed area (RA-7572)", () => {
    const legacy = room("legacy", SQUARE_M, 1, { areaM2: 9 });
    expect(resolveRoomAreaM2(legacy, 100)).toBe(9);
    // Perimeter follows the same source: shape kept, scale from the claim.
    expect(resolveRoomPerimeterM(legacy, 100)).toBeCloseTo(12, 6);
  });

  it("recalibration keeps the previous calibration as history and reloads it", () => {
    const first = withCalibrationHistory(null, {
      pxPerMetre: 100,
      description: "Calibrated: 3.00 m = 300 px",
      realMetres: 3,
    }, "2026-11-09T00:00:00.000Z");
    expect(first.history).toEqual([]);
    expect(first.calibratedAt).toBe("2026-11-09T00:00:00.000Z");
    const second = withCalibrationHistory(first, {
      pxPerMetre: 50,
      description: "Calibrated: 3.00 m = 150 px",
      realMetres: 3,
    }, "2026-11-09T01:00:00.000Z");
    expect(second.pxPerMetre).toBe(50);
    expect(second.history).toHaveLength(1);
    expect(second.history[0]).toMatchObject({
      pxPerMetre: 100,
      calibratedAt: "2026-11-09T00:00:00.000Z",
    });
    expect("history" in second.history[0]).toBe(false);

    const reloaded = scaleConfigFromStoredSketchData(
      JSON.parse(JSON.stringify({ scaleConfig: second, objects: [] })),
    ) as typeof second;
    expect(reloaded.pxPerMetre).toBe(50);
    expect(reloaded.history).toHaveLength(1);
  });

  it("a stored scale with an unusable pxPerMetre does not reload", () => {
    for (const bad of [0, -50, Number.NaN, "50", null]) {
      expect(
        scaleConfigFromStoredSketchData({ scaleConfig: { pxPerMetre: bad } }),
      ).toBeNull();
    }
  });
});

// RA-8237 K1 design (round 4): typed or cached figures may only bill when
// they agree with the drawing; a drawing with any invalid vertex is refused.
describe("RA-8237 K1 — typed and cached figures cannot bill more than the drawing", () => {
  type Room = Parameters<typeof resolveRoomQuantities>[0];
  const NONE = { areaM2: null, perimeterM: null, source: null };

  function billed(r: Room, ppm: number) {
    const sk = sketch(ppm, [r]);
    const node = extractRoomGraphNodes(sk)[0];
    return {
      resolver: resolveRoomQuantities(r, ppm),
      graph: node ? node.areaM2 : undefined,
      estimate: extractSketchEstimate([{ floorLabel: "G", sketchData: sk }])
        .totalRoomAreaM2,
      confirm: confirmRoomAreaFields(r, ppm),
    };
  }

  function gateAccepts(r: Room, ppm: number, measuredAreaM2: number) {
    const id = (r.data as { id: string }).id;
    return reconcileRoomMeasurementEvidence({
      stored: [],
      rooms: roomRevisionsFromSketchData(sketch(ppm, [r])),
      submissions: [{ fabricObjectId: id, measuredAreaM2 }],
      sessionUserId: "tech-1",
    }).measuredRoomIds.has(id);
  }

  function withPoints(points: unknown, data: Record<string, unknown>): Room {
    return {
      type: "polygon",
      points,
      data: {
        type: "room",
        id: "k1-room",
        provenance: "operator_measured",
        ...data,
      },
    } as unknown as Room;
  }

  const TYPED_3x3 = {
    areaSource: "dimensions",
    dimensionsPxPerMetre: 100,
    lengthM: 3,
    widthM: 3,
    areaM2: 9,
  };
  const ROOM_FORMS: Array<[string, Record<string, unknown>]> = [
    ["tagged dimensions (typed 3 × 3)", TYPED_3x3],
    ["tagged geometry with a cached 9 m²", { areaSource: "geometry", areaM2: 9 }],
    ["untagged with a claimed 9 m²", { areaM2: 9, lengthM: 3, widthM: 3 }],
    ["untagged with typed 3 × 3 and no claim", { lengthM: 3, widthM: 3 }],
  ];

  // Each bad coordinate replaces the x of the fourth corner of a 3 × 3 m
  // square at 100 px/m; the numeric coercion of every one of them is 0 or
  // finite, which would make the square whole again.
  const BAD_COORDS: Array<[string, unknown]> = [
    ["null", null],
    ['""', ""],
    ['"0"', "0"],
    ["false", false],
    ["true", true],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["-Infinity", Number.NEGATIVE_INFINITY],
    ["[] (empty array)", []],
  ];

  describe.each(BAD_COORDS)("a vertex coordinate of %s", (_label, bad) => {
    const objectForm = [
      { x: 0, y: 0 },
      { x: 300, y: 0 },
      { x: 300, y: 300 },
      { x: bad, y: 300 },
    ];
    const arrayForm = [
      [0, 0],
      [300, 0],
      [300, 300],
      [300, bad],
    ];
    it.each(ROOM_FORMS)("is refused, %s, object and [x, y] forms", (_f, data) => {
      for (const points of [objectForm, arrayForm]) {
        const r = withPoints(points, data);
        const b = billed(r, 100);
        expect(b.resolver).toEqual(NONE);
        expect(b.graph).toBeNull();
        expect(b.estimate).toBe(0);
        expect(b.confirm).toEqual({ areaSource: "geometry" });
        expect(gateAccepts(r, 100, 9)).toBe(false);
      }
    });
  });

  // Shapes inside the same 3 × 3 m box as the typed room, at 100 px/m.
  const pts = (xy: Array<[number, number]>) => xy.map(([x, y]) => ({ x, y }));
  const SHAPES: Array<[string, Array<[number, number]>, number | null]> = [
    ["a repeated corner", [[0, 0], [300, 0], [300, 300], [300, 300]], 4.5],
    ["a near-duplicate corner", [[0, 0], [300, 0], [300, 300], [299, 299]], 4.5],
    ["a self-crossing outline", [[0, 0], [300, 300], [0, 300], [300, 0]], null],
    // Pentagon whose bounding box is exactly 3 × 3 m.
    ["a non-rectangle in the same 3 × 3 box", [[0, 0], [300, 0], [300, 300], [150, 250], [0, 300]], 8.25],
    // Six-sided notch, every vertex on the box edges.
    ["an L inside the same 3 × 3 box", [[0, 0], [300, 0], [300, 150], [150, 150], [150, 300], [0, 300]], 6.75],
  ];

  it.each(SHAPES)("typed 3 × 3 over %s never bills 9 m²", (_label, xy, drawnM2) => {
    const r = withPoints(pts(xy), TYPED_3x3);
    const b = billed(r, 100);
    if (drawnM2 === null) {
      expect(b.resolver).toEqual(NONE);
      expect(b.graph).toBeNull();
      expect(b.estimate).toBe(0);
      expect(b.confirm).toEqual({ areaSource: "geometry" });
    } else {
      expect(b.resolver.source).toBe("geometry");
      expect(b.resolver.areaM2).toBeCloseTo(drawnM2, 6);
      expect(b.graph).toBeCloseTo(drawnM2, 6);
      expect(b.estimate).toBeCloseTo(drawnM2, 6);
      expect(b.confirm).toEqual({ areaM2: drawnM2, areaSource: "geometry" });
    }
    expect(gateAccepts(r, 100, 9)).toBe(false);
  });

  it("area alone is not agreement: a 4.5 × 2 m drawing keeps its own 13 m perimeter", () => {
    const r = withPoints(pts([[0, 0], [450, 0], [450, 200], [0, 200]]), TYPED_3x3);
    expect(resolveRoomQuantities(r, 100)).toMatchObject({ source: "geometry" });
    expect(resolveRoomPerimeterM(r, 100)).toBeCloseTo(13, 6);
  });

  it("perimeter alone is not agreement: a 4 × 2 m drawing bills 8 m², not the typed 9", () => {
    const r = withPoints(pts([[0, 0], [400, 0], [400, 200], [0, 200]]), TYPED_3x3);
    const b = billed(r, 100);
    expect(b.resolver).toMatchObject({ source: "geometry" });
    expect(b.resolver.areaM2).toBeCloseTo(8, 6);
    expect(b.estimate).toBeCloseTo(8, 6);
  });

  it("agreement is within 2%: a drawing 3% larger than typed bills its own area", () => {
    const r = withPoints(pts([[0, 0], [300, 0], [300, 309], [0, 309]]), TYPED_3x3);
    expect(resolveRoomQuantities(r, 100)).toMatchObject({ source: "geometry" });
    expect(resolveRoomAreaM2(r, 100)).toBeCloseTo(9.27, 6);
    const within = withPoints(pts([[0, 0], [300, 0], [300, 303], [0, 303]]), TYPED_3x3);
    expect(resolveRoomQuantities(within, 100)).toMatchObject({
      areaM2: 9,
      perimeterM: 12,
      source: "dimensions",
    });
  });

  it("a closing vertex that repeats the first is the same square, not a malformed one", () => {
    const closed = withPoints(
      pts([[0, 0], [300, 0], [300, 300], [0, 300], [0, 0]]),
      { areaSource: "geometry" },
    );
    expect(resolveRoomQuantities(closed, 100)).toMatchObject({
      areaM2: 9,
      perimeterM: 12,
      source: "geometry",
    });
  });

  it("a room without points is judged by its width × height box", () => {
    const box = (width: unknown, height: unknown) =>
      ({
        type: "rect",
        width,
        height,
        data: { type: "room", id: "k1-room", provenance: "operator_measured", ...TYPED_3x3 },
      }) as unknown as Room;
    expect(resolveRoomQuantities(box(300, 300), 100)).toMatchObject({
      areaM2: 9,
      source: "dimensions",
    });
    expect(resolveRoomQuantities(box(150, 300), 100)).toMatchObject({
      areaM2: 4.5,
      source: "geometry",
    });
    for (const [w, h] of [["bad", 300], [300, null], [0, 300], [300, undefined]] as const) {
      const r = box(w, h);
      expect(resolveRoomQuantities(r, 100)).toEqual(NONE);
      expect(billed(r, 100).estimate).toBe(0);
    }
  });

  describe.each(SCALES)("the RA-8237 rooms at %s px/m", (ppm) => {
    it("typed 3 × 3 over the drawn square bills 9 m² / 12 m everywhere", () => {
      const r = room("k1-room", SQUARE_M, ppm, {
        ...TYPED_3x3,
        dimensionsPxPerMetre: ppm,
      });
      const b = billed(r, ppm);
      expect(b.resolver).toMatchObject({ areaM2: 9, perimeterM: 12, source: "dimensions" });
      expect(b.graph).toBeCloseTo(9, 6);
      expect(b.estimate).toBeCloseTo(9, 6);
      expect(b.confirm).toEqual({ areaM2: 9, areaSource: "dimensions" });
      expect(gateAccepts(r, ppm, 9)).toBe(true);
    });

    it("typed 4 × 4 over the drawn L bills the L's 12 m² / 16 m, never 16 m²", () => {
      const r = room("k1-room", L_SHAPE_M, ppm, {
        areaSource: "dimensions",
        dimensionsPxPerMetre: ppm,
        lengthM: 4,
        widthM: 4,
        areaM2: 16,
      });
      const b = billed(r, ppm);
      expect(b.resolver.source).toBe("geometry");
      expect(b.resolver.areaM2).toBeCloseTo(12, 6);
      expect(b.resolver.perimeterM).toBeCloseTo(16, 6);
      expect(b.graph).toBeCloseTo(12, 6);
      expect(b.estimate).toBeCloseTo(12, 6);
      expect(b.confirm).toEqual({ areaM2: 12, areaSource: "geometry" });
      expect(gateAccepts(r, ppm, 16)).toBe(false);
      expect(gateAccepts(r, ppm, 12)).toBe(true);
    });
  });

  it("over many shapes in the typed box, a typed figure never exceeds the drawing by more than 2%", () => {
    // Deterministic sweep: quadrilaterals and pentagons with vertices on a
    // 25 px grid inside the 3 × 3 m box at 100 px/m.
    let seed = 8237;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const grid = () => Math.round(rand() * 12) * 25;
    const shapes: Array<Array<[number, number]>> = [
      // The typed square in every starting corner and both windings, plus
      // rectangles inside and just outside the 2% band: these reach the
      // typed branch, so the sweep cannot pass by never testing it.
      [[0, 0], [300, 0], [300, 300], [0, 300]],
      [[300, 0], [300, 300], [0, 300], [0, 0]],
      [[0, 0], [0, 300], [300, 300], [300, 0]],
      [[0, 300], [300, 300], [300, 0], [0, 0]],
      [[0, 0], [303, 0], [303, 300], [0, 300]],
      [[0, 0], [306, 0], [306, 300], [0, 300]],
    ];
    for (let i = 0; i < 400; i++) {
      const n = 4 + (i % 2);
      const xy: Array<[number, number]> = [];
      for (let k = 0; k < n; k++) xy.push([grid(), grid()]);
      shapes.push(xy);
    }
    let typedBranch = 0;
    for (const xy of shapes) {
      const q = resolveRoomQuantities(withPoints(pts(xy), TYPED_3x3), 100);
      if (q.source !== "dimensions") continue;
      typedBranch++;
      const drawn = resolveRoomQuantities(
        withPoints(pts(xy), { areaSource: "geometry" }),
        100,
      );
      expect(drawn.areaM2).not.toBeNull();
      expect(q.areaM2 as number).toBeLessThanOrEqual(
        (drawn.areaM2 as number) * 1.02 + 1e-9,
      );
      expect(q.perimeterM as number).toBeLessThanOrEqual(
        (drawn.perimeterM as number) * 1.02 + 1e-9,
      );
    }
    expect(typedBranch).toBeGreaterThanOrEqual(5);
  });
});
