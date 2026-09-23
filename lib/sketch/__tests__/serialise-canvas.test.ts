/**
 * Fabric 7 drops custom `data` when a canvas is saved with toJSON(["data"]).
 * The save path and the undo-history path both call serialiseSketchCanvas.
 * A room drawn in the editor must still have data.id, data.type and
 * data.label after that call, and the voice asbestos latch must still be
 * readable from the same snapshot.
 */
import { describe, expect, it } from "vitest";
import { Polygon, StaticCanvas } from "fabric/node";
import {
  serialiseSketchCanvas,
  type SerialisedSketchCanvas,
} from "@/lib/sketch/serialise-canvas";
import {
  rememberVoiceAcmLatch,
  reapplyVoiceAcmLatch,
} from "@/lib/sketch/voice-acm-latch";
import { extractRoomGraphNodes } from "@/lib/sketch/sync-room-graph";
import { extractSketchEstimate } from "@/lib/sketch-estimate-extractor";
import { fabricJsonFromStoredSketchData } from "@/lib/sketch/pending-sketch-load";
import { fabricObjectToSelected } from "@/lib/sketch/selected-object";

const ROOM_ID = "room-voice";
const ROOM_LABEL = "Voice test room";
const ROOM_TOOL_FILL = "rgba(28,46,71,0.08)";
const ROOM_COLOR_FILL = "rgba(16,185,129,0.10)";
const DAMAGE_TINT_FILL = "rgba(37, 99, 235, 0.22)";
const NORTH_ARROW_FILL = "#1C2E47";

function stubCanvasElement() {
  // Fabric's node build asks jsdom for a 2d context. A stub element keeps
  // the real StaticCanvas and Polygon; serialisation does not draw.
  const noop = () => {};
  const ctx = new Proxy({}, { get: () => noop });
  return {
    getContext: () => ctx,
    hasAttribute: () => false,
    setAttribute: noop,
    removeAttribute: noop,
    classList: { add: noop, remove: noop },
    style: { cssText: "" },
    width: 800,
    height: 600,
  };
}

function makeCanvas() {
  return new StaticCanvas(
    stubCanvasElement() as unknown as HTMLCanvasElement,
    { width: 800, height: 600, renderOnAddRemove: false },
  );
}

function roomOnCanvas() {
  const canvas = makeCanvas();
  const room = new Polygon(
    [
      { x: 0, y: 0 },
      { x: 386, y: 0 },
      { x: 386, y: 386 },
      { x: 0, y: 386 },
    ],
    { fill: "rgba(28,46,71,0.08)", stroke: "#1C2E47" },
  );
  (room as unknown as { data: Record<string, unknown> }).data = {
    id: ROOM_ID,
    type: "room",
    label: ROOM_LABEL,
    material: "vinyl-tiles",
    waterCategory: "cat2",
    lengthM: 3.86,
    widthM: 3.86,
    areaM2: 14.9,
    provenance: "operator_measured",
    voiceRaisedAcm: true,
  };
  canvas.add(room);
  return canvas;
}

function roomFrom(snapshot: SerialisedSketchCanvas) {
  return snapshot.objects?.find((obj) => obj.data?.id === ROOM_ID);
}

describe("serialiseSketchCanvas", () => {
  it("keeps data.id, data.type and data.label on the save and undo serialiser", () => {
    const canvas = roomOnCanvas();
    const snapshot = serialiseSketchCanvas(canvas);
    expect(snapshot.objects?.length).toBeGreaterThan(0);
    const room = roomFrom(snapshot);
    expect(room?.data?.id).toBe(ROOM_ID);
    expect(room?.data?.type).toBe("room");
    expect(room?.data?.label).toBe(ROOM_LABEL);
    canvas.dispose();
  });

  it("keeps voiceRaisedAcm so the asbestos latch survives the same serialiser", () => {
    const canvas = roomOnCanvas();
    const snapshot = serialiseSketchCanvas(canvas);
    const room = roomFrom(snapshot);
    expect(room?.data?.voiceRaisedAcm).toBe(true);
    const raised = rememberVoiceAcmLatch(snapshot.objects ?? [], new Set());
    expect(raised.has(ROOM_ID)).toBe(true);
    const wiped = (snapshot.objects ?? []).map((obj) => ({
      data: obj.data ? { ...obj.data, voiceRaisedAcm: undefined } : undefined,
    }));
    reapplyVoiceAcmLatch(wiped, raised);
    expect(wiped.find((obj) => obj.data?.id === ROOM_ID)?.data?.voiceRaisedAcm).toBe(
      true,
    );
    canvas.dispose();
  });

  it("hands UI-drawn rooms to the room graph and the sketch estimate", () => {
    const canvas = roomOnCanvas();
    const snapshot = serialiseSketchCanvas(canvas);
    const nodes = extractRoomGraphNodes(snapshot);
    expect(nodes).toHaveLength(1);
    expect(nodes[0]?.fabricObjectId).toBe(ROOM_ID);
    expect(nodes[0]?.name).toBe(ROOM_LABEL);
    expect(nodes[0]?.materialSlug).toBe("vinyl-tiles");
    expect(nodes[0]?.waterCategory).toBe("cat2");

    const estimate = extractSketchEstimate([
      { floorLabel: "Ground", sketchData: snapshot },
    ]);
    const floorLine = estimate.lineItems.find(
      (line) => line.category === "room" && line.notes === "Floor area",
    );
    expect(floorLine?.description).toContain(ROOM_LABEL);
    canvas.dispose();
  });
});

type FabricJsonObject = {
  type?: string;
  fill?: string;
  data?: {
    id?: string;
    type?: string;
    detailsLost?: boolean;
    label?: string;
    [key: string]: unknown;
  };
  points?: unknown[];
};

function addTaggedPolygon(
  canvas: StaticCanvas,
  points: Array<{ x: number; y: number }>,
  props: ConstructorParameters<typeof Polygon>[1],
  data?: Record<string, unknown>,
) {
  const poly = new Polygon(points, props);
  if (data) {
    (poly as unknown as { data: Record<string, unknown> }).data = data;
  }
  canvas.add(poly);
  return poly;
}

function objectsByFill(objects: FabricJsonObject[] | undefined) {
  const list = objects ?? [];
  const find = (fill: string) => list.find((obj) => obj.fill === fill);
  return {
    toolRoom: find(ROOM_TOOL_FILL),
    colourRoom: find(ROOM_COLOR_FILL),
    damageTint: find(DAMAGE_TINT_FILL),
    northArrow: find(NORTH_ARROW_FILL),
  };
}

describe("legacy data-less rooms (RA-7655)", () => {
  it("rehydrates only room polygons dropped by Fabric 7 toJSON()", async () => {
    const canvas = makeCanvas();
    addTaggedPolygon(
      canvas,
      [
        { x: 0, y: 0 },
        { x: 200, y: 0 },
        { x: 200, y: 160 },
        { x: 0, y: 160 },
      ],
      { fill: ROOM_TOOL_FILL, stroke: "#1C2E47" },
      { id: "will-be-dropped", type: "room", label: "Kitchen" },
    );
    addTaggedPolygon(
      canvas,
      [
        { x: 220, y: 0 },
        { x: 400, y: 0 },
        { x: 400, y: 160 },
        { x: 220, y: 160 },
      ],
      { fill: ROOM_COLOR_FILL, stroke: "#10b981" },
      { id: "also-dropped", type: "room" },
    );
    addTaggedPolygon(
      canvas,
      [
        { x: 0, y: 180 },
        { x: 80, y: 180 },
        { x: 80, y: 240 },
        { x: 0, y: 240 },
      ],
      {
        fill: DAMAGE_TINT_FILL,
        stroke: "rgba(37, 99, 235, 0.85)",
        strokeWidth: 1,
      },
      { id: "tint-1", type: "damage", role: "room-tint" },
    );
    addTaggedPolygon(
      canvas,
      [
        { x: 10, y: 10 },
        { x: 0, y: 30 },
        { x: 20, y: 30 },
      ],
      { fill: NORTH_ARROW_FILL, stroke: NORTH_ARROW_FILL, opacity: 0.85 },
    );

    // Real Fabric 7 toJSON() — no propertiesToInclude, so custom data is gone.
    const lost = canvas.toJSON() as { objects?: FabricJsonObject[] };
    canvas.dispose();
    const dropped = objectsByFill(lost.objects);
    expect(dropped.toolRoom).toBeDefined();
    expect(dropped.colourRoom).toBeDefined();
    expect(dropped.damageTint).toBeDefined();
    expect(dropped.northArrow).toBeDefined();
    expect(dropped.toolRoom?.data).toBeUndefined();
    expect(dropped.colourRoom?.data).toBeUndefined();
    expect(dropped.damageTint?.data).toBeUndefined();
    expect(dropped.northArrow?.data).toBeUndefined();
    expect(dropped.northArrow?.points?.length).toBe(3);

    const repaired = fabricJsonFromStoredSketchData(lost) as {
      objects?: FabricJsonObject[];
    } | null;
    expect(repaired).not.toBeNull();
    const byFill = objectsByFill(repaired?.objects);
    const rooms = [byFill.toolRoom, byFill.colourRoom];
    for (const room of rooms) {
      expect(room?.data?.type).toBe("room");
      expect(room?.data?.detailsLost).toBe(true);
      expect(typeof room?.data?.id).toBe("string");
      expect(room?.data?.id?.length).toBeGreaterThan(0);
      expect(room?.data).not.toHaveProperty("provenance");
    }
    expect(byFill.toolRoom?.data?.id).not.toBe(byFill.colourRoom?.data?.id);
    expect(byFill.damageTint?.data).toBeUndefined();
    expect(byFill.northArrow?.data).toBeUndefined();

    const loaded = makeCanvas();
    await loaded.loadFromJSON(repaired ?? {});
    const loadedObjs = loaded.getObjects() as Array<{
      fill?: string;
      data?: Record<string, unknown>;
    }>;
    const loadedByFill = {
      toolRoom: loadedObjs.find((obj) => obj.fill === ROOM_TOOL_FILL),
      colourRoom: loadedObjs.find((obj) => obj.fill === ROOM_COLOR_FILL),
      damageTint: loadedObjs.find((obj) => obj.fill === DAMAGE_TINT_FILL),
      northArrow: loadedObjs.find((obj) => obj.fill === NORTH_ARROW_FILL),
    };
    const selectedTool = fabricObjectToSelected(loadedByFill.toolRoom);
    const selectedColour = fabricObjectToSelected(loadedByFill.colourRoom);
    expect(selectedTool?.type).toBe("room");
    expect(selectedTool?.detailsLost).toBe(true);
    expect(selectedColour?.type).toBe("room");
    expect(selectedColour?.detailsLost).toBe(true);
    expect(selectedTool?.id).not.toBe(selectedColour?.id);
    expect(fabricObjectToSelected(loadedByFill.damageTint)).toBeNull();
    expect(fabricObjectToSelected(loadedByFill.northArrow)).toBeNull();

    const snapshot = serialiseSketchCanvas(loaded);
    const nodes = extractRoomGraphNodes(snapshot);
    expect(nodes).toHaveLength(2);
    expect(new Set(nodes.map((n) => n.fabricObjectId)).size).toBe(2);
    loaded.dispose();
  });

  it("leaves a current-format blob (objects already carrying data) unchanged", () => {
    const canvas = makeCanvas();
    addTaggedPolygon(
      canvas,
      [
        { x: 0, y: 0 },
        { x: 120, y: 0 },
        { x: 120, y: 90 },
        { x: 0, y: 90 },
      ],
      { fill: ROOM_TOOL_FILL, stroke: "#1C2E47" },
      {
        id: "room-current",
        type: "room",
        label: "Living",
        material: "carpet",
        waterCategory: "cat1",
        provenance: "operator_measured",
      },
    );
    const current = serialiseSketchCanvas(canvas);
    canvas.dispose();
    const room = (current.objects ?? []).find(
      (obj) => obj.data?.id === "room-current",
    );
    expect(room?.data?.type).toBe("room");
    expect(room?.data?.label).toBe("Living");

    const passed = fabricJsonFromStoredSketchData(current) as {
      objects?: FabricJsonObject[];
    } | null;
    const kept = (passed?.objects ?? []).find(
      (obj) => obj.data?.id === "room-current",
    );
    expect(kept?.data).toEqual(room?.data);
    expect(kept?.data).not.toHaveProperty("detailsLost");
  });
});
