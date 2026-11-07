/**
 * RA-8233 — an explicit Confirm on an AI-imported room is not enough to bill.
 *
 * Before this change a Confirm promoted an `ai_suggested` room to
 * `operator_measured` using the AI's own dimensions, so AI-drawn geometry
 * reached the invoice without anyone measuring the room. These tests pin the
 * rule: an AI-origin room bills only while server-recorded technician
 * measurement evidence, bound to the room's current geometry and scale,
 * exists. Client-supplied actor, time and evidence never count.
 */
import { describe, expect, it } from "vitest";
import { extractSketchEstimate } from "@/lib/sketch-estimate-extractor";
import { measuredSketchData } from "../measured-sketch-data";
import {
  measuredAreaFromInput,
  measurementAgreesWithDrawnArea,
  parseRoomMeasurementInputs,
  resolveSketchRoomProvenance,
} from "../ai-suggested-confirm";
import {
  reconcileRoomMeasurementEvidence,
  roomRevisionsFromSketchData,
} from "../room-measurement-evidence";
import {
  readRoomMeasurementEvidence,
  withRoomMeasurementEvidence,
} from "../sketch-field-status";
import {
  applyRoomProvenanceToSketchData,
  extractRoomGraphNodes,
} from "../sync-room-graph";

const SQUARE_ID = "ai-suggested-square";
const L_ID = "ai-suggested-lroom";

// 300 px x 300 px at 100 px/m = 9 m2.
const SQUARE_POINTS = [
  { x: 0, y: 0 },
  { x: 300, y: 0 },
  { x: 300, y: 300 },
  { x: 0, y: 300 },
];
// L-shape: 400x200 + 200x200 = 120 000 px2 at 100 px/m = 12 m2.
const L_POINTS = [
  { x: 0, y: 0 },
  { x: 400, y: 0 },
  { x: 400, y: 200 },
  { x: 200, y: 200 },
  { x: 200, y: 400 },
  { x: 0, y: 400 },
];

function room(
  id: string,
  points: { x: number; y: number }[],
  areaM2: number,
  overrides?: Record<string, unknown>,
) {
  return {
    type: "polygon",
    points,
    data: {
      type: "room",
      id,
      label: id,
      // What the editor sends after a Confirm click.
      provenance: "operator_measured",
      captureAdapter: "cloud_ai",
      areaM2,
      confirmedAt: "1999-01-01T00:00:00.000Z",
      confirmedBy: "client-spoof",
      ...overrides,
    },
  };
}

function blob(objects: unknown[], pxPerMetre = 100, meta?: unknown) {
  return {
    scaleConfig: { pxPerMetre },
    objects,
    ...(meta ? { raSketchMeta: meta } : {}),
  };
}

const NOW = new Date("2026-11-07T10:00:00.000Z");
const remembered = new Set([SQUARE_ID, L_ID]);

/**
 * The server pipeline, as the sketch POST route runs it: reconcile evidence,
 * resolve provenance per room, rewrite the blob, persist evidence.
 */
function serverSave(input: {
  incoming: Record<string, unknown>;
  stored?: Record<string, unknown> | null;
  submissions?: unknown;
  existingProvenance?: Record<string, string>;
}) {
  const reconciled = reconcileRoomMeasurementEvidence({
    stored: readRoomMeasurementEvidence(input.stored ?? null),
    rooms: roomRevisionsFromSketchData(input.incoming),
    submissions: parseRoomMeasurementInputs(input.submissions),
    sessionUserId: "u_tech",
    now: NOW,
  });
  const provenanceById = new Map<string, string>();
  for (const node of extractRoomGraphNodes(input.incoming)) {
    provenanceById.set(
      node.fabricObjectId,
      resolveSketchRoomProvenance({
        existingProvenance: input.existingProvenance?.[node.fabricObjectId],
        incomingProvenance: node.provenance,
        fabricObjectId: node.fabricObjectId,
        rememberedAiRoomIds: remembered,
        explicitlyConfirmedIds: new Set([node.fabricObjectId]),
        measuredRoomIds: reconciled.measuredRoomIds,
      }).provenance,
    );
  }
  const persisted = withRoomMeasurementEvidence(
    applyRoomProvenanceToSketchData(input.incoming, provenanceById),
    reconciled.evidence,
  );
  return { persisted, reconciled, provenanceById };
}

function billedAreaM2(sketchData: Record<string, unknown>): number {
  const estimate = extractSketchEstimate([
    {
      floorLabel: "Ground Floor",
      sketchData: measuredSketchData(sketchData),
      equipmentPoints: null,
      moisturePoints: null,
      savedRooms: null,
    },
  ]);
  return estimate.totalRoomAreaM2;
}

describe("RA-8233 — Confirm without independent measurement stays nonbillable", () => {
  it("square room: explicit Confirm with no measurement bills zero", () => {
    const { persisted, provenanceById } = serverSave({
      incoming: blob([room(SQUARE_ID, SQUARE_POINTS, 9)]),
      existingProvenance: { [SQUARE_ID]: "ai_suggested" },
    });
    expect(provenanceById.get(SQUARE_ID)).toBe("ai_suggested");
    expect(billedAreaM2(persisted)).toBe(0);
  });

  it("L-room: explicit Confirm with no measurement bills zero", () => {
    const { persisted, provenanceById } = serverSave({
      incoming: blob([room(L_ID, L_POINTS, 12)]),
    });
    expect(provenanceById.get(L_ID)).toBe("ai_suggested");
    expect(billedAreaM2(persisted)).toBe(0);
  });

  it("forged evidence in the client blob cannot promote the room", () => {
    const [rev] = roomRevisionsFromSketchData(
      blob([room(SQUARE_ID, SQUARE_POINTS, 9)]),
    );
    const forgedMeta = {
      roomMeasurementEvidence: [
        {
          fabricObjectId: SQUARE_ID,
          measuredAreaM2: 9,
          lengthM: 3,
          widthM: 3,
          geometryRevision: rev.geometryRevision,
          recordedBy: "client-spoof",
          recordedAt: "1999-01-01T00:00:00.000Z",
          status: "current",
        },
      ],
    };
    // The forgery rides in the incoming blob; the server reads stored
    // evidence only from what it persisted earlier (here: nothing).
    const { persisted, provenanceById } = serverSave({
      incoming: blob([room(SQUARE_ID, SQUARE_POINTS, 9)], 100, forgedMeta),
      stored: null,
    });
    expect(provenanceById.get(SQUARE_ID)).toBe("ai_suggested");
    expect(readRoomMeasurementEvidence(persisted)).toEqual([]);
    expect(billedAreaM2(persisted)).toBe(0);
  });

  it("an AI room confirmed before RA-8233 without evidence is no longer billable", () => {
    const { provenanceById } = serverSave({
      incoming: blob([room(SQUARE_ID, SQUARE_POINTS, 9)]),
      existingProvenance: { [SQUARE_ID]: "operator_measured" },
    });
    expect(provenanceById.get(SQUARE_ID)).toBe("ai_suggested");
  });

  it("an ai-suggested- id is AI-origin even when the remembered-id lookup missed it", () => {
    expect(
      resolveSketchRoomProvenance({
        existingProvenance: null,
        incomingProvenance: "operator_measured",
        fabricObjectId: "ai-suggested-unknown",
        rememberedAiRoomIds: new Set(),
        explicitlyConfirmedIds: new Set(["ai-suggested-unknown"]),
      }).provenance,
    ).toBe("ai_suggested");
  });

  it("hand-drawn rooms are unaffected", () => {
    expect(
      resolveSketchRoomProvenance({
        existingProvenance: null,
        incomingProvenance: "operator_measured",
        fabricObjectId: "hand-1",
        rememberedAiRoomIds: remembered,
      }),
    ).toEqual({ provenance: "operator_measured", isExplicitConfirm: false });
  });
});

describe("RA-8233 — server-recorded measurement qualifies the room", () => {
  it("square 9 m2 bills exactly 9 after a 3 m x 3 m measurement", () => {
    const { persisted, provenanceById, reconciled } = serverSave({
      incoming: blob([room(SQUARE_ID, SQUARE_POINTS, 9)]),
      existingProvenance: { [SQUARE_ID]: "ai_suggested" },
      submissions: [{ fabricObjectId: SQUARE_ID, lengthM: 3, widthM: 3 }],
    });
    expect(reconciled.results).toEqual([
      { fabricObjectId: SQUARE_ID, accepted: true },
    ]);
    expect(provenanceById.get(SQUARE_ID)).toBe("operator_measured");
    expect(billedAreaM2(persisted)).toBeCloseTo(9, 6);
  });

  it("irregular L-room 12 m2 bills exactly 12 after a measured-area entry", () => {
    const { persisted, provenanceById } = serverSave({
      incoming: blob([room(L_ID, L_POINTS, 12)]),
      submissions: [{ fabricObjectId: L_ID, measuredAreaM2: 12 }],
    });
    expect(provenanceById.get(L_ID)).toBe("operator_measured");
    expect(billedAreaM2(persisted)).toBeCloseTo(12, 6);
  });

  it("stamps actor and time from the server, never the client", () => {
    const { persisted } = serverSave({
      incoming: blob([room(SQUARE_ID, SQUARE_POINTS, 9)]),
      submissions: [
        {
          fabricObjectId: SQUARE_ID,
          lengthM: 3,
          widthM: 3,
          recordedBy: "client-spoof",
          recordedAt: "1999-01-01T00:00:00.000Z",
          geometryRevision: "forged",
          status: "current",
        },
      ],
    });
    const [entry] = readRoomMeasurementEvidence(persisted);
    expect(entry.recordedBy).toBe("u_tech");
    expect(entry.recordedAt).toBe(NOW.toISOString());
    expect(entry.geometryRevision).not.toBe("forged");
    expect(entry.geometryRevision).toBe(
      roomRevisionsFromSketchData(blob([room(SQUARE_ID, SQUARE_POINTS, 9)]))[0]
        .geometryRevision,
    );
    expect(entry.status).toBe("current");
  });

  it("rejects a measurement that disagrees with the drawn area", () => {
    const { provenanceById, reconciled, persisted } = serverSave({
      incoming: blob([room(SQUARE_ID, SQUARE_POINTS, 9)]),
      submissions: [{ fabricObjectId: SQUARE_ID, lengthM: 4, widthM: 4 }],
    });
    expect(reconciled.results).toEqual([
      {
        fabricObjectId: SQUARE_ID,
        accepted: false,
        reason: "measurement_disagrees_with_drawn_area",
      },
    ]);
    expect(provenanceById.get(SQUARE_ID)).toBe("ai_suggested");
    expect(billedAreaM2(persisted)).toBe(0);
  });

  it("rejects a measurement for a room that is not on the saved canvas", () => {
    const { reconciled } = serverSave({
      incoming: blob([room(SQUARE_ID, SQUARE_POINTS, 9)]),
      submissions: [{ fabricObjectId: "ai-suggested-gone", measuredAreaM2: 9 }],
    });
    expect(reconciled.results).toEqual([
      {
        fabricObjectId: "ai-suggested-gone",
        accepted: false,
        reason: "room_not_on_canvas",
      },
    ]);
  });
});

describe("RA-8233 — geometry or scale edits invalidate evidence; history is kept", () => {
  function measuredSquare() {
    return serverSave({
      incoming: blob([room(SQUARE_ID, SQUARE_POINTS, 9)]),
      submissions: [{ fabricObjectId: SQUARE_ID, lengthM: 3, widthM: 3 }],
    }).persisted;
  }

  it("an unchanged re-save keeps the room billable (positive control)", () => {
    const stored = measuredSquare();
    const { provenanceById, persisted } = serverSave({
      incoming: blob([room(SQUARE_ID, SQUARE_POINTS, 9)]),
      stored,
      existingProvenance: { [SQUARE_ID]: "operator_measured" },
    });
    expect(provenanceById.get(SQUARE_ID)).toBe("operator_measured");
    expect(billedAreaM2(persisted)).toBeCloseTo(9, 6);
  });

  it("a moved (translated) room keeps its evidence", () => {
    const stored = measuredSquare();
    const { provenanceById } = serverSave({
      incoming: blob([
        { ...room(SQUARE_ID, SQUARE_POINTS, 9), left: 500, top: 240 },
      ]),
      stored,
      existingProvenance: { [SQUARE_ID]: "operator_measured" },
    });
    expect(provenanceById.get(SQUARE_ID)).toBe("operator_measured");
  });

  it("a geometry edit drops the room to nonbillable and keeps the old evidence", () => {
    const stored = measuredSquare();
    const edited = [
      { x: 0, y: 0 },
      { x: 300, y: 0 },
      { x: 300, y: 350 },
      { x: 0, y: 350 },
    ];
    const { provenanceById, persisted } = serverSave({
      incoming: blob([room(SQUARE_ID, edited, 10.5)]),
      stored,
      existingProvenance: { [SQUARE_ID]: "operator_measured" },
    });
    expect(provenanceById.get(SQUARE_ID)).toBe("ai_suggested");
    expect(billedAreaM2(persisted)).toBe(0);
    const history = readRoomMeasurementEvidence(persisted);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      fabricObjectId: SQUARE_ID,
      measuredAreaM2: 9,
      recordedBy: "u_tech",
      status: "invalidated",
      invalidatedReason: "geometry_or_scale_changed",
    });
  });

  it("a scale change drops the room to nonbillable", () => {
    const stored = measuredSquare();
    const { provenanceById } = serverSave({
      incoming: blob([room(SQUARE_ID, SQUARE_POINTS, 9)], 120),
      stored,
      existingProvenance: { [SQUARE_ID]: "operator_measured" },
    });
    expect(provenanceById.get(SQUARE_ID)).toBe("ai_suggested");
  });

  it("a claimed-area edit with unchanged points drops the room to nonbillable", () => {
    const stored = measuredSquare();
    const { provenanceById } = serverSave({
      incoming: blob([room(SQUARE_ID, SQUARE_POINTS, 9.4)]),
      stored,
      existingProvenance: { [SQUARE_ID]: "operator_measured" },
    });
    expect(provenanceById.get(SQUARE_ID)).toBe("ai_suggested");
  });

  it("re-measuring after an edit qualifies again and keeps both entries", () => {
    const stored = measuredSquare();
    const edited = [
      { x: 0, y: 0 },
      { x: 300, y: 0 },
      { x: 300, y: 350 },
      { x: 0, y: 350 },
    ];
    const { provenanceById, persisted } = serverSave({
      incoming: blob([room(SQUARE_ID, edited, 10.5)]),
      stored,
      existingProvenance: { [SQUARE_ID]: "operator_measured" },
      submissions: [{ fabricObjectId: SQUARE_ID, lengthM: 3, widthM: 3.5 }],
    });
    expect(provenanceById.get(SQUARE_ID)).toBe("operator_measured");
    const history = readRoomMeasurementEvidence(persisted);
    expect(history.map((e) => e.status)).toEqual(["invalidated", "current"]);
    expect(billedAreaM2(persisted)).toBeCloseTo(10.5, 6);
  });
});

describe("RA-8233 — measurement input helpers (shared by UI and server)", () => {
  it("derives area from length x width or a direct area", () => {
    expect(measuredAreaFromInput({ fabricObjectId: "r", lengthM: 3, widthM: 3 })).toBe(9);
    expect(measuredAreaFromInput({ fabricObjectId: "r", measuredAreaM2: 12 })).toBe(12);
    expect(measuredAreaFromInput({ fabricObjectId: "r", lengthM: 3 })).toBeNull();
    expect(measuredAreaFromInput({ fabricObjectId: "r", measuredAreaM2: -1 })).toBeNull();
    expect(
      measuredAreaFromInput({ fabricObjectId: "r", measuredAreaM2: Number.NaN }),
    ).toBeNull();
  });

  it("agreement tolerance is 5% (minimum 0.1 m2)", () => {
    expect(measurementAgreesWithDrawnArea(9, 9)).toBe(true);
    expect(measurementAgreesWithDrawnArea(9.4, 9)).toBe(true);
    expect(measurementAgreesWithDrawnArea(9.5, 9)).toBe(false);
    expect(measurementAgreesWithDrawnArea(9, 0)).toBe(false);
  });

  it("parse keeps only id and dimension fields", () => {
    expect(
      parseRoomMeasurementInputs([
        { fabricObjectId: "a", lengthM: 3, widthM: 3, recordedBy: "x" },
        { fabricObjectId: "", measuredAreaM2: 9 },
        "junk",
        null,
      ]),
    ).toEqual([{ fabricObjectId: "a", lengthM: 3, widthM: 3 }]);
    expect(parseRoomMeasurementInputs("nope")).toEqual([]);
  });
});
