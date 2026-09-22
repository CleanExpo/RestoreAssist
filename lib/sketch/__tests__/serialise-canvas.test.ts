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

const ROOM_ID = "room-voice";
const ROOM_LABEL = "Voice test room";

function roomOnCanvas() {
  // Fabric's node build asks jsdom for a 2d context. A stub element keeps
  // the real StaticCanvas and Polygon; serialisation does not draw.
  const noop = () => {};
  const ctx = new Proxy({}, { get: () => noop });
  const el = {
    getContext: () => ctx,
    hasAttribute: () => false,
    setAttribute: noop,
    removeAttribute: noop,
    classList: { add: noop, remove: noop },
    style: { cssText: "" },
    width: 800,
    height: 600,
  };
  const canvas = new StaticCanvas(
    el as unknown as HTMLCanvasElement,
    { width: 800, height: 600, renderOnAddRemove: false },
  );
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
