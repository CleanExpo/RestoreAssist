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
import { Polygon, StaticCanvas } from "fabric/node";
import { commitRoomPanelEdit } from "@/lib/sketch/room-panel-commit";

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
