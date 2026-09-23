/**
 * A room label edited in the selection panel writes `data` in place.
 * That edit must schedule a save, and must fire object:modified so the
 * canvas undo history records it — the same sequence as the voice
 * asbestos latch.
 *
 * Fabric's fire reads this.__eventListeners. A call detached from the
 * canvas throws, the listener never runs, and the save never starts.
 */
import { describe, expect, it, vi } from "vitest";
import { getEnv, Polygon, StaticCanvas, Text } from "fabric/node";
import { commitRoomPanelEdit } from "@/lib/sketch/room-panel-commit";
import { polygonAbsolutePoints } from "@/lib/sketch/fabric-absolute";
import { resizeRectRoomFromDims } from "@/lib/sketch/room-defaults";
import { serialiseSketchCanvas } from "@/lib/sketch/serialise-canvas";
import { rebuildRoomEdgeDimLabels } from "@/lib/sketch/rebuild-room-edge-dim-labels";

function roomOnCanvas() {
  // Fabric's node build asks jsdom for a 2d context. A stub element keeps
  // the real StaticCanvas and Polygon; this path does not draw.
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
  const canvas = new StaticCanvas(el as unknown as HTMLCanvasElement, {
    width: 800,
    height: 600,
    renderOnAddRemove: false,
  });
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
    id: "room-1",
    type: "room",
    label: "Room",
    material: "vinyl-tiles",
    waterCategory: "cat2",
  };
  canvas.add(room);
  return { canvas, room };
}

describe("commitRoomPanelEdit", () => {
  it("fires object:modified on the canvas and schedules a save", () => {
    const { canvas, room } = roomOnCanvas();
    const scheduleSave = vi.fn();
    const onModified = vi.fn();
    canvas.on("object:modified", onModified);
    (room as unknown as { data: { label: string } }).data.label =
      "Voice test room";

    expect(() =>
      commitRoomPanelEdit(canvas, room, scheduleSave),
    ).not.toThrow();
    expect(onModified).toHaveBeenCalledTimes(1);
    expect(onModified).toHaveBeenCalledWith(
      expect.objectContaining({ target: room }),
    );
    expect(scheduleSave).toHaveBeenCalledTimes(1);
    expect(
      (room as unknown as { data: { label: string } }).data.label,
    ).toBe("Voice test room");
    canvas.dispose();
  });

  it("schedules a save when an object:modified listener throws", () => {
    const { canvas, room } = roomOnCanvas();
    const scheduleSave = vi.fn();
    canvas.on("object:modified", () => {
      throw new Error("listener failed");
    });

    expect(() => commitRoomPanelEdit(canvas, room, scheduleSave)).toThrow(
      /listener failed/,
    );
    expect(scheduleSave).toHaveBeenCalledTimes(1);
    canvas.dispose();
  });
});

/**
 * Typing a room size (or accepting a voice suggestion) resizes the polygon
 * and fires object:modified. Per-edge dim labels must be rebuilt from the
 * geometry Fabric draws. Footprint labels have no dimFor and stay put.
 * Fabric 7 toJSON(["data"]) drops custom data; the save path uses
 * serialiseSketchCanvas.
 */
function installDimTextMeasureContext(): void {
  // fabric/node Text measures on a canvas context. Without native
  // node-canvas, getContext returns null and the constructor throws
  // "Cannot set properties of null (setting 'textBaseline')".
  const proto = getEnv().window.HTMLCanvasElement.prototype;
  const ctx = {
    measureText: () => ({ width: 12 }),
  };
  proto.getContext = () => ctx;
}

function makeEdgeText(text: string, x: number, y: number): Text {
  return new Text(text, {
    left: x,
    top: y,
    fontSize: 11,
    originX: "center",
    originY: "center",
    objectCaching: false,
  });
}

function seedEdgeLabels(
  canvas: StaticCanvas,
  text: string,
  roomId: string,
): Text[] {
  const labels: Text[] = [];
  for (let edgeIndex = 0; edgeIndex < 4; edgeIndex++) {
    const label = makeEdgeText(text, 20 + edgeIndex * 30, 20);
    (label as unknown as { data: Record<string, unknown> }).data = {
      type: "dim-label",
      dimFor: roomId,
      edgeIndex,
      metres: 3.86,
    };
    canvas.add(label);
    labels.push(label);
  }
  return labels;
}

function dimLabelTexts(
  canvas: StaticCanvas,
  roomId: string,
): string[] {
  return canvas
    .getObjects()
    .filter((obj) => {
      const data = (obj as { data?: { type?: string; dimFor?: string } }).data;
      return data?.type === "dim-label" && data.dimFor === roomId;
    })
    .map((obj) => (obj as Text).text ?? "");
}

describe("room edge dimension labels after a panel resize", () => {
  it("rebuilds per-edge labels when object:modified commits a typed size", () => {
    installDimTextMeasureContext();
    const { canvas, room } = roomOnCanvas();
    const footprintW = makeEdgeText("3.86 m", 40, 400);
    const footprintH = makeEdgeText("3.86 m", 400, 40);
    (footprintW as unknown as { data: Record<string, unknown> }).data = {
      type: "dim-label",
    };
    (footprintH as unknown as { data: Record<string, unknown> }).data = {
      type: "dim-label",
    };
    canvas.add(footprintW, footprintH);
    seedEdgeLabels(canvas, "3.86 m", "room-1");

    const pts = polygonAbsolutePoints(room);
    const next = pts ? resizeRectRoomFromDims(pts, 4, 3.2, 100) : null;
    expect(next).not.toBeNull();
    room.set({ points: next! });
    room.setCoords();

    const scheduleSave = vi.fn();
    canvas.on("object:modified", (opt) => {
      const target = (opt as { target?: { data?: { type?: string } } })
        ?.target;
      if (target?.data?.type !== "room") return;
      rebuildRoomEdgeDimLabels(canvas, target, 100, makeEdgeText);
    });
    commitRoomPanelEdit(canvas, room, scheduleSave);

    expect(dimLabelTexts(canvas, "room-1")).toEqual([
      "4.00 m",
      "3.20 m",
      "4.00 m",
      "3.20 m",
    ]);
    expect(dimLabelTexts(canvas, "room-1")).not.toContain("3.86 m");
    expect(footprintW.text).toBe("3.86 m");
    expect(footprintH.text).toBe("3.86 m");
    expect(
      (footprintW as unknown as { data?: { dimFor?: string } }).data?.dimFor,
    ).toBeUndefined();
    expect(canvas.getObjects()).toContain(footprintW);
    expect(canvas.getObjects()).toContain(footprintH);

    const snapshot = serialiseSketchCanvas(canvas);
    const savedEdges = (snapshot.objects ?? []).filter(
      (obj) =>
        obj.data?.type === "dim-label" && obj.data.dimFor === "room-1",
    );
    expect(savedEdges.map((obj) => obj.text)).toEqual([
      "4.00 m",
      "3.20 m",
      "4.00 m",
      "3.20 m",
    ]);
    expect(savedEdges.map((obj) => obj.data)).toEqual([
      { type: "dim-label", dimFor: "room-1", edgeIndex: 0, metres: 4 },
      { type: "dim-label", dimFor: "room-1", edgeIndex: 1, metres: 3.2 },
      { type: "dim-label", dimFor: "room-1", edgeIndex: 2, metres: 4 },
      { type: "dim-label", dimFor: "room-1", edgeIndex: 3, metres: 3.2 },
    ]);
    const savedFootprint = (snapshot.objects ?? []).filter(
      (obj) => obj.data?.type === "dim-label" && obj.data.dimFor == null,
    );
    expect(savedFootprint.map((obj) => obj.text)).toEqual([
      "3.86 m",
      "3.86 m",
    ]);
    expect(scheduleSave).toHaveBeenCalledTimes(1);
    canvas.dispose();
  });

  it("reads scaled geometry so a mouse scale does not keep the old edge length", () => {
    installDimTextMeasureContext();
    const { canvas, room } = roomOnCanvas();
    seedEdgeLabels(canvas, "3.86 m", "room-1");
    // 386 px at 100 px/m is 3.86 m. Scaling the drawn rectangle to 4 x 3.2 m
    // leaves Fabric's local points at 386; only the transform changes.
    room.set({ scaleX: 4 / 3.86, scaleY: 3.2 / 3.86 });
    room.setCoords();

    canvas.on("object:modified", (opt) => {
      const target = (opt as { target?: { data?: { type?: string } } })
        ?.target;
      if (target?.data?.type !== "room") return;
      rebuildRoomEdgeDimLabels(canvas, target, 100, makeEdgeText);
    });
    commitRoomPanelEdit(canvas, room, () => {});

    expect(dimLabelTexts(canvas, "room-1")).toEqual([
      "4.00 m",
      "3.20 m",
      "4.00 m",
      "3.20 m",
    ]);
    expect(dimLabelTexts(canvas, "room-1")).not.toContain("3.86 m");
    canvas.dispose();
  });
});
