/**
 * RA-7611 — AI-suggested geometry must not reach billing until Confirm.
 *
 * Watched-red first: on main (70bce0d) the three quantity filters are
 * deny-lists that exclude only `underlay_reference`. A room tagged
 * `ai_suggested` therefore produces estimate lines and scope quantities.
 * After the allow-list change, the same fixtures yield zero until Confirm
 * promotes the room to `operator_measured`.
 *
 * This file imports only the three production filters so it can fail on
 * current main before the confirm helper exists.
 */
import { describe, expect, it } from "vitest";
import { extractSketchEstimate } from "@/lib/sketch-estimate-extractor";
import { extractRooms } from "../extract-rooms";
import {
  measuredSketchData,
  serverAuthoritativeFloors,
} from "../measured-sketch-data";
import { isMeasuredRoom } from "../room-area-from-geometry";
import {
  confirmAiSuggestedMeasurement,
  confirmSketchRoomMeasurement,
  isAiSuggestedPendingConfirm,
  recordAiSuggestedGeometryCorrection,
  resolveSketchRoomConfirmAttribution,
  resolveSketchRoomProvenance,
} from "../ai-suggested-confirm";
import { confirmRoomPlanMeasurement } from "../roomplan-correction";
import { extractRoomGraphNodes } from "../sync-room-graph";

const FLOOR_M2 = 9;
const CEILING_M = 2.7;

const AI_ROOM_POINTS = [
  { x: 0, y: 0 },
  { x: 300, y: 0 },
  { x: 300, y: 300 },
  { x: 0, y: 300 },
];

function aiSuggestedFabricRoom(overrides?: Record<string, unknown>) {
  return {
    type: "polygon",
    points: AI_ROOM_POINTS,
    data: {
      type: "room",
      id: "ai-room-1",
      label: "AI Lounge",
      provenance: "ai_suggested",
      captureAdapter: "cloud_ai",
      areaM2: FLOOR_M2,
      lengthM: 3,
      widthM: 3,
      ceilingHeightM: CEILING_M,
      originalAreaM2: FLOOR_M2,
      originalPoints: AI_ROOM_POINTS,
      originalLabel: "AI Lounge",
      correctionHistory: [],
      ...overrides,
    },
  };
}

function estimateFloors(
  objects: unknown[],
  savedRooms?: Array<Record<string, unknown>>,
) {
  return [
    {
      floorLabel: "Ground Floor",
      sketchData: {
        scaleConfig: { pxPerMetre: 100 },
        objects,
      },
      equipmentPoints: null,
      moisturePoints: null,
      savedRooms: savedRooms ?? null,
    },
  ];
}

const areaLines = (e: ReturnType<typeof extractSketchEstimate>) =>
  e.lineItems.filter((li) => typeof li.areaM2 === "number");

const NON_MEASURED_PROVENANCES = [
  "ai_suggested",
  "underlay_reference",
  "cloud_ai",
  "field_verified",
] as const;

describe("RA-7611 — ai_suggested is excluded from billed quantities", () => {
  it("measuredSketchData drops an ai_suggested room (filter 1)", () => {
    const blob = {
      objects: [aiSuggestedFabricRoom()],
    };
    const out = measuredSketchData(blob);
    expect(out.objects).toHaveLength(0);
  });

  it("roomsFromSavedGraph (extractor line 311) yields zero estimate lines for ai_suggested (filter 2)", () => {
    const estimate = extractSketchEstimate(
      estimateFloors([], [
        {
          name: "AI Lounge",
          areaM2: FLOOR_M2,
          perimeterM: 12,
          heightM: CEILING_M,
          provenance: "ai_suggested",
        },
      ]),
    );
    expect(areaLines(estimate)).toHaveLength(0);
    expect(estimate.totalRoomAreaM2).toBe(0);
  });

  it("isMeasuredRoom rejects ai_suggested (filter 3) so extractRooms yields zero scope quantities", () => {
    const obj = aiSuggestedFabricRoom();
    expect(isMeasuredRoom(obj)).toBe(false);
    const rooms = extractRooms({
      scaleConfig: { pxPerMetre: 100 },
      objects: [obj],
    });
    expect(rooms).toHaveLength(0);
  });

  it("an ai_suggested fabric room yields zero estimate lines through the extractor fabric path", () => {
    const estimate = extractSketchEstimate(
      estimateFloors([aiSuggestedFabricRoom()]),
    );
    expect(areaLines(estimate)).toHaveLength(0);
    expect(estimate.totalRoomAreaM2).toBe(0);
  });
});

describe("RA-7611 — per-filter allow-list: only operator_measured bills", () => {
  it("measuredSketchData keeps only operator_measured", () => {
    const blob = {
      objects: NON_MEASURED_PROVENANCES.map((provenance, i) => ({
        type: "polygon",
        data: { type: "room", label: `n${i}`, provenance },
      })).concat([
        {
          type: "polygon",
          data: {
            type: "room",
            label: "Measured",
            provenance: "operator_measured",
          },
        },
      ]),
    };
    const out = measuredSketchData(blob);
    expect(out.objects).toHaveLength(1);
    expect(out.objects[0].data?.provenance).toBe("operator_measured");
  });

  it("saved-room extractor (line 311) keeps only operator_measured", () => {
    const saved = [
      ...NON_MEASURED_PROVENANCES.map((provenance, i) => ({
        name: `n${i}`,
        areaM2: FLOOR_M2,
        provenance: provenance,
      })),
      {
        name: "Measured",
        areaM2: FLOOR_M2,
        provenance: "operator_measured",
      },
    ];
    const estimate = extractSketchEstimate(estimateFloors([], saved));
    const floors = areaLines(estimate).filter(
      (li) => li.notes === "Floor area",
    );
    expect(floors).toHaveLength(1);
    expect(floors[0].description).toContain("Measured");
    expect(floors[0].areaM2).toBe(FLOOR_M2);
  });

  it("isMeasuredRoom is true only for operator_measured rooms", () => {
    for (const provenance of NON_MEASURED_PROVENANCES) {
      expect(
        isMeasuredRoom({
          type: "polygon",
          data: { type: "room", provenance },
        }),
        `isMeasuredRoom must reject ${String(provenance)}`,
      ).toBe(false);
    }
    expect(
      isMeasuredRoom({
        type: "polygon",
        data: { type: "room", provenance: "operator_measured" },
      }),
    ).toBe(true);
  });
});

describe("RA-7611 — Confirm promotes AI-suggested rooms and bills the expected m2", () => {
  it("detects pending AI-suggested rooms", () => {
    expect(isAiSuggestedPendingConfirm({ provenance: "ai_suggested" })).toBe(
      true,
    );
    expect(
      isAiSuggestedPendingConfirm({ provenance: "operator_measured" }),
    ).toBe(false);
    expect(
      isAiSuggestedPendingConfirm({ provenance: "underlay_reference" }),
    ).toBe(false);
  });

  it("confirm on fabric data, with unchanged dimensions, bills exactly 9 m2", () => {
    const pending = aiSuggestedFabricRoom();
    expect(extractRooms({ objects: [pending] })).toHaveLength(0);

    const confirmed = {
      ...pending,
      data: confirmAiSuggestedMeasurement(pending.data, {
        by: "tech-1",
        at: "2026-09-21T00:00:00.000Z",
        areaM2: FLOOR_M2,
        lengthM: 3,
        widthM: 3,
      }),
    };

    expect(confirmed.data.provenance).toBe("operator_measured");
    expect(confirmed.data.confirmedAt).toBe("2026-09-21T00:00:00.000Z");
    expect(confirmed.data.confirmedBy).toBe("tech-1");
    const history = confirmed.data.correctionHistory as Array<{
      field: string;
    }>;
    expect(history.some((e) => e.field === "confirm")).toBe(true);
    expect(history.some((e) => e.field === "geometry")).toBe(false);

    const rooms = extractRooms({
      scaleConfig: { pxPerMetre: 100 },
      objects: [confirmed],
    });
    expect(rooms).toHaveLength(1);
    expect(rooms[0].areaM2).toBe(FLOOR_M2);

    const estimate = extractSketchEstimate(estimateFloors([confirmed]));
    const floor = areaLines(estimate).find((li) => li.notes === "Floor area");
    expect(floor?.areaM2).toBe(FLOOR_M2);
    expect(estimate.totalRoomAreaM2).toBe(FLOOR_M2);
  });

  it("SketchRoom confirm state (not SketchElement) promotes and keeps history", () => {
    const confirmed = confirmSketchRoomMeasurement(
      {
        name: "AI Lounge",
        areaM2: FLOOR_M2,
        perimeterM: 12,
        heightM: CEILING_M,
        provenance: "ai_suggested",
        confirmedAt: null,
        confirmedBy: null,
        correctionHistory: null,
        originalAreaM2: FLOOR_M2,
      },
      {
        by: "tech-1",
        at: "2026-09-21T00:00:00.000Z",
        areaM2: 12,
        note: "Corrected length on site",
      },
    );
    expect(confirmed.provenance).toBe("operator_measured");
    expect(confirmed.confirmedAt).toBe("2026-09-21T00:00:00.000Z");
    expect(confirmed.confirmedBy).toBe("tech-1");
    expect(confirmed.areaM2).toBe(12);
    expect(confirmed.originalAreaM2).toBe(FLOOR_M2);
    expect(confirmed.correctionHistory).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "geometry",
          after: expect.objectContaining({ areaM2: 12 }),
        }),
        expect.objectContaining({
          field: "confirm",
          before: "ai_suggested",
          after: "operator_measured",
        }),
      ]),
    );

    const estimate = extractSketchEstimate(
      estimateFloors([], [
        {
          name: confirmed.name,
          areaM2: confirmed.areaM2,
          perimeterM: confirmed.perimeterM,
          heightM: confirmed.heightM,
          provenance: confirmed.provenance,
        },
      ]),
    );
    const floor = areaLines(estimate).find((li) => li.notes === "Floor area");
    expect(floor?.areaM2).toBe(12);
  });

  it("RoomGraph copies confirmation fields onto the SketchRoom node", () => {
    const confirmed = {
      ...aiSuggestedFabricRoom(),
      data: confirmAiSuggestedMeasurement(aiSuggestedFabricRoom().data, {
        by: "tech-1",
        at: "2026-09-21T00:00:00.000Z",
        areaM2: FLOOR_M2,
      }),
    };
    const nodes = extractRoomGraphNodes({
      scaleConfig: { pxPerMetre: 100 },
      objects: [confirmed],
    });
    expect(nodes).toHaveLength(1);
    expect(nodes[0].provenance).toBe("operator_measured");
    expect(nodes[0].confirmedBy).toBe("tech-1");
    expect(nodes[0].confirmedAt?.toISOString()).toBe(
      "2026-09-21T00:00:00.000Z",
    );
    expect(nodes[0].originalAreaM2).toBe(FLOOR_M2);
    expect(Array.isArray(nodes[0].correctionHistory)).toBe(true);
  });
});

describe("RA-7611 — untagged legacy rooms still bill (missing provenance = measured)", () => {
  const UNTAGGED_FLOOR_M2 = 12;

  it("measuredSketchData keeps a room with no provenance tag", () => {
    const blob = {
      objects: [
        {
          type: "polygon",
          data: { type: "room", label: "Legacy Lounge" },
        },
        {
          type: "polygon",
          data: { type: "room", label: "Null tag", provenance: null },
        },
        {
          type: "polygon",
          data: { type: "room", label: "Empty tag", provenance: "" },
        },
        { type: "polygon" },
        aiSuggestedFabricRoom(),
      ],
    };
    const out = measuredSketchData(blob);
    expect(out.objects).toHaveLength(4);
    expect(
      out.objects.map((o) => o.data?.label ?? o.type),
    ).toEqual(["Legacy Lounge", "Null tag", "Empty tag", "polygon"]);
  });

  it("extractor saved-room path bills untagged / null / empty and yields zero for ai_suggested", () => {
    const estimate = extractSketchEstimate(
      estimateFloors([], [
        {
          name: "Legacy Lounge",
          areaM2: UNTAGGED_FLOOR_M2,
        },
        {
          name: "Null tag",
          areaM2: UNTAGGED_FLOOR_M2,
          provenance: null,
        },
        {
          name: "Empty tag",
          areaM2: UNTAGGED_FLOOR_M2,
          provenance: "",
        },
        {
          name: "AI Lounge",
          areaM2: UNTAGGED_FLOOR_M2,
          provenance: "ai_suggested",
        },
      ]),
    );
    const floors = areaLines(estimate).filter(
      (li) => li.notes === "Floor area",
    );
    expect(floors).toHaveLength(3);
    expect(floors.map((li) => li.description).sort()).toEqual(
      [
        "Empty tag — Ground Floor",
        "Legacy Lounge — Ground Floor",
        "Null tag — Ground Floor",
      ].sort(),
    );
    expect(
      floors.every((li) => li.areaM2 === UNTAGGED_FLOOR_M2),
    ).toBe(true);
    expect(floors.some((li) => li.description.includes("AI"))).toBe(false);
  });

  it("isMeasuredRoom treats missing / null / empty provenance as measured", () => {
    expect(isMeasuredRoom({ data: { type: "room" } })).toBe(true);
    expect(isMeasuredRoom({ type: "polygon" })).toBe(true);
    expect(
      isMeasuredRoom({
        data: { type: "room", provenance: null as unknown as string },
      }),
    ).toBe(true);
    expect(
      isMeasuredRoom({ data: { type: "room", provenance: "" } }),
    ).toBe(true);
    expect(
      isMeasuredRoom({
        type: "polygon",
        data: { type: "room", provenance: "ai_suggested" },
      }),
    ).toBe(false);
  });

  it("serverAuthoritativeFloors keeps untagged rooms on a mixed floor and drops ai_suggested", () => {
    const rect = (w: number, h: number) => [
      { x: 0, y: 0 },
      { x: w, y: 0 },
      { x: w, y: h },
      { x: 0, y: h },
    ];
    const untagged = {
      type: "polygon",
      points: rect(300, 400),
      data: { type: "room", label: "Legacy" },
    };
    const tagged = {
      type: "polygon",
      points: rect(300, 300),
      data: {
        type: "room",
        label: "Tech",
        provenance: "operator_measured",
      },
    };
    const ai = {
      type: "polygon",
      points: rect(1000, 1000),
      data: {
        type: "room",
        label: "AI",
        provenance: "ai_suggested",
      },
    };
    const [f] = serverAuthoritativeFloors(
      [{ label: "GF", fabricJson: { objects: [] } }],
      [
        {
          floorLabel: "GF",
          sketchData: { objects: [untagged, tagged, ai] },
        },
      ],
    );
    const rooms = extractRooms(f.fabricJson);
    expect(rooms).toHaveLength(2);
    expect(rooms.map((r) => r.label).sort()).toEqual(["Legacy", "Tech"]);
    expect(rooms.some((r) => r.label === "AI")).toBe(false);
  });
});

describe("RA-7611 — RoomPlan confirm still promotes to operator_measured", () => {
  it("regression: confirmRoomPlanMeasurement still flips underlay_reference", () => {
    const next = confirmRoomPlanMeasurement(
      {
        type: "room",
        id: "r1",
        label: "Hall",
        provenance: "underlay_reference",
        captureAdapter: "roomplan",
        correctionHistory: [],
      },
      { by: "tech-1", at: "2026-09-21T00:00:00.000Z" },
    );
    expect(next.provenance).toBe("operator_measured");
    expect(next.confirmedAt).toBe("2026-09-21T00:00:00.000Z");
    expect(next.confirmedBy).toBe("tech-1");
  });
});

describe("RA-7611 — dimension corrections must be finite, positive, and actually change", () => {
  it("does not record geometry when Confirm is given the same dimensions", () => {
    const pending = aiSuggestedFabricRoom();
    const confirmed = confirmAiSuggestedMeasurement(pending.data, {
      by: "tech-1",
      at: "2026-09-21T00:00:00.000Z",
      areaM2: FLOOR_M2,
      lengthM: 3,
      widthM: 3,
    });
    const history = confirmed.correctionHistory as Array<{ field: string }>;
    expect(history.some((e) => e.field === "geometry")).toBe(false);
    expect(confirmed.areaM2).toBe(FLOOR_M2);
  });

  it("records geometry when Confirm applies a real positive finite change", () => {
    const pending = aiSuggestedFabricRoom();
    const confirmed = confirmAiSuggestedMeasurement(pending.data, {
      by: "tech-1",
      at: "2026-09-21T00:00:00.000Z",
      areaM2: 12,
      lengthM: 4,
      widthM: 3,
    });
    const history = confirmed.correctionHistory as Array<{
      field: string;
      after?: { areaM2?: number };
    }>;
    expect(history.some((e) => e.field === "geometry")).toBe(true);
    expect(confirmed.areaM2).toBe(12);
    expect(confirmed.lengthM).toBe(4);
    expect(confirmed.widthM).toBe(3);
  });

  it("rejects non-finite and non-positive dimension corrections", () => {
    const pending = aiSuggestedFabricRoom();
    for (const bad of [NaN, Infinity, -Infinity, 0, -3]) {
      const confirmed = confirmAiSuggestedMeasurement(pending.data, {
        by: "tech-1",
        at: "2026-09-21T00:00:00.000Z",
        areaM2: bad,
        lengthM: bad,
        widthM: bad,
      });
      expect(confirmed.areaM2).toBe(FLOOR_M2);
      expect(confirmed.lengthM).toBe(3);
      expect(confirmed.widthM).toBe(3);
      const history = confirmed.correctionHistory as Array<{ field: string }>;
      expect(
        history.some((e) => e.field === "geometry"),
        `must not record geometry for ${String(bad)}`,
      ).toBe(false);
    }
  });

  it("recordAiSuggestedGeometryCorrection skips invalid and unchanged values", () => {
    const data = aiSuggestedFabricRoom().data;
    const unchanged = recordAiSuggestedGeometryCorrection(data, {
      areaM2: FLOOR_M2,
      lengthM: 3,
      widthM: 3,
    });
    expect(unchanged.correctionHistory).toEqual([]);
    expect(unchanged.areaM2).toBe(FLOOR_M2);

    const invalid = recordAiSuggestedGeometryCorrection(data, {
      areaM2: 0,
      lengthM: NaN,
      widthM: -1,
    });
    expect(invalid.correctionHistory).toEqual([]);
    expect(invalid.areaM2).toBe(FLOOR_M2);

    const changed = recordAiSuggestedGeometryCorrection(data, {
      areaM2: 16,
      lengthM: 4,
      widthM: 4,
    });
    expect(changed.areaM2).toBe(16);
    expect(
      (changed.correctionHistory as Array<{ field: string }>).some(
        (e) => e.field === "geometry",
      ),
    ).toBe(true);
  });

  it("confirmSketchRoomMeasurement rejects non-positive area and skips unchanged area", () => {
    const base = {
      name: "AI Lounge",
      areaM2: FLOOR_M2,
      provenance: "ai_suggested" as const,
      originalAreaM2: FLOOR_M2,
    };
    const same = confirmSketchRoomMeasurement(base, {
      by: "tech-1",
      at: "2026-09-21T00:00:00.000Z",
      areaM2: FLOOR_M2,
    });
    expect(same.areaM2).toBe(FLOOR_M2);
    expect(
      same.correctionHistory.some((e) => e.field === "geometry"),
    ).toBe(false);

    const bad = confirmSketchRoomMeasurement(base, {
      by: "tech-1",
      at: "2026-09-21T00:00:00.000Z",
      areaM2: 0,
    });
    expect(bad.areaM2).toBe(FLOOR_M2);
    expect(bad.correctionHistory.some((e) => e.field === "geometry")).toBe(
      false,
    );
  });
});

describe("RA-7611 — server confirm attribution ignores client values", () => {
  const now = new Date("2026-09-21T12:00:00.000Z");

  it("stamps session user and server time on unconfirmed → confirmed", () => {
    const stamp = resolveSketchRoomConfirmAttribution({
      existingConfirmedAt: null,
      existingConfirmedBy: null,
      incomingConfirmedAt: "1999-01-01T00:00:00.000Z",
      incomingConfirmedBy: "client-spoof",
      sessionUserId: "session-tech",
      now,
    });
    expect(stamp.confirmedBy).toBe("session-tech");
    expect(stamp.confirmedAt?.toISOString()).toBe(now.toISOString());
  });

  it("keeps the original stamp once already confirmed", () => {
    const original = new Date("2026-09-20T08:00:00.000Z");
    const stamp = resolveSketchRoomConfirmAttribution({
      existingConfirmedAt: original,
      existingConfirmedBy: "original-tech",
      incomingConfirmedAt: "1999-01-01T00:00:00.000Z",
      incomingConfirmedBy: "client-spoof",
      sessionUserId: "session-tech",
      now,
    });
    expect(stamp.confirmedBy).toBe("original-tech");
    expect(stamp.confirmedAt?.toISOString()).toBe(original.toISOString());
  });

  it("leaves both null when the room is still unconfirmed", () => {
    const stamp = resolveSketchRoomConfirmAttribution({
      existingConfirmedAt: null,
      existingConfirmedBy: null,
      incomingConfirmedAt: null,
      incomingConfirmedBy: null,
      sessionUserId: "session-tech",
      now,
    });
    expect(stamp.confirmedAt).toBeNull();
    expect(stamp.confirmedBy).toBeNull();
  });

  it("RA-7617: explicit confirm stamps the session even when the client omits confirmedAt", () => {
    const stamp = resolveSketchRoomConfirmAttribution({
      existingConfirmedAt: null,
      existingConfirmedBy: null,
      incomingConfirmedAt: null,
      incomingConfirmedBy: null,
      sessionUserId: "session-tech",
      now,
      isExplicitConfirm: true,
    });
    expect(stamp.confirmedBy).toBe("session-tech");
    expect(stamp.confirmedAt?.toISOString()).toBe(now.toISOString());
  });
});

describe("RA-7617 — server-derived provenance", () => {
  const remembered = new Set(["ai-room-1"]);

  it("promotes an existing ai_suggested row only on operator_measured", () => {
    expect(
      resolveSketchRoomProvenance({
        existingProvenance: "ai_suggested",
        incomingProvenance: "operator_measured",
        fabricObjectId: "ai-room-1",
        rememberedAiRoomIds: remembered,
      }),
    ).toEqual({ provenance: "operator_measured", isExplicitConfirm: true });
  });

  it("keeps ai_suggested when the client sends any other tag", () => {
    expect(
      resolveSketchRoomProvenance({
        existingProvenance: "ai_suggested",
        incomingProvenance: "underlay_reference",
        fabricObjectId: "ai-room-1",
        rememberedAiRoomIds: remembered,
      }),
    ).toEqual({ provenance: "ai_suggested", isExplicitConfirm: false });
  });

  it("never downgrades operator_measured", () => {
    expect(
      resolveSketchRoomProvenance({
        existingProvenance: "operator_measured",
        incomingProvenance: "ai_suggested",
        fabricObjectId: "hand-1",
        rememberedAiRoomIds: remembered,
      }),
    ).toEqual({ provenance: "operator_measured", isExplicitConfirm: false });
  });

  it("first save of a remembered AI id cannot claim operator_measured", () => {
    expect(
      resolveSketchRoomProvenance({
        existingProvenance: null,
        incomingProvenance: "operator_measured",
        fabricObjectId: "ai-room-1",
        rememberedAiRoomIds: remembered,
      }),
    ).toEqual({ provenance: "ai_suggested", isExplicitConfirm: false });
  });
});
