// @vitest-environment jsdom
/**
 * RA-7656 (Codex round 4) — a room that leaves the canvas because of a user
 * action is reported from one place: SketchCanvas's `onRoomsRemoved`.
 *
 * The route keeps the stored rooms when a save arrives without any, because a
 * disposed or partly loaded canvas posts exactly that. A user removing the
 * last room (undo, redo, delete, clear) posts the same shape on purpose, so
 * the canvas reports it and the editor marks the save. Loads are not user
 * removals: fabric's loadFromJSON clears the canvas first, which fires an
 * `object:removed` for every room, and none of that may report.
 *
 * Real SketchCanvas and real fabric 7 (jsdom + node-canvas); nothing stubbed.
 */
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRef } from "react";
import SketchCanvas, { type FabricCanvasRef } from "../SketchCanvas";

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

type FabricLike = {
  getObjects: () => Array<{ data?: { type?: string; id?: string } }>;
  add: (...o: unknown[]) => void;
  remove: (...o: unknown[]) => void;
};

function room(id: string, x: number) {
  return {
    type: "Polygon",
    left: x,
    top: 0,
    points: [
      { x, y: 0 },
      { x: x + 300, y: 0 },
      { x: x + 300, y: 300 },
      { x, y: 300 },
    ],
    data: { type: "room", id, label: id },
  };
}

const freehand = {
  type: "Path",
  path: [["M", 0, 0], ["L", 50, 50]],
  data: { type: "freehand" },
};

let onRoomsRemoved: ReturnType<typeof vi.fn>;

async function flush(times = 10) {
  for (let i = 0; i < times; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
  }
}

async function mount(initialData: Record<string, unknown> | null) {
  let ready: FabricCanvasRef | null = null;
  const ref = createRef<FabricCanvasRef>();
  const view = render(
    <SketchCanvas
      ref={ref}
      width={800}
      height={600}
      initialData={initialData}
      onReady={(c) => {
        ready = c;
      }}
      onRoomsRemoved={onRoomsRemoved}
    />,
  );
  for (let i = 0; i < 100 && !ready; i++) await flush(1);
  expect(ready).not.toBeNull();
  const handle = ready as unknown as FabricCanvasRef;
  const fc = handle.getFabricCanvas() as FabricLike;
  return { view, handle, ref, fc };
}

function roomsOn(fc: FabricLike) {
  return fc.getObjects().filter((o) => o.data?.type === "room").map((o) => o.data?.id);
}

async function enliven(json: Record<string, unknown>) {
  const fabric = await import("fabric");
  const [obj] = await fabric.util.enlivenObjects([json]);
  return obj;
}

describe("RA-7656 canvas room removal", () => {
  beforeEach(() => {
    onRoomsRemoved = vi.fn();
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("RA-7656 canvas room removal: loading initialData does not report", async () => {
    const { fc } = await mount({ objects: [room("room-kitchen", 0), room("room-laundry", 400)] });
    expect(roomsOn(fc)).toEqual(["room-kitchen", "room-laundry"]);
    expect(onRoomsRemoved).not.toHaveBeenCalled();
  });

  it("RA-7656 canvas room removal: removing a room object reports it (selection delete, any fc.remove)", async () => {
    const { fc } = await mount({ objects: [room("room-kitchen", 0), freehand] });
    const kitchen = fc.getObjects().find((o) => o.data?.id === "room-kitchen");
    act(() => fc.remove(kitchen));
    expect(onRoomsRemoved).toHaveBeenCalledTimes(1);
    expect(onRoomsRemoved.mock.calls[0][0]).toEqual(["room-kitchen"]);
  });

  it("RA-7656 canvas room removal: removing a non-room object does not report", async () => {
    const { fc } = await mount({ objects: [room("room-kitchen", 0), freehand] });
    const path = fc.getObjects().find((o) => o.data?.type === "freehand");
    act(() => fc.remove(path));
    expect(onRoomsRemoved).not.toHaveBeenCalled();
  });

  it("RA-7656 canvas room removal: clear() reports the rooms it removed", async () => {
    const { handle } = await mount({ objects: [room("room-kitchen", 0), freehand] });
    act(() => handle.clear());
    expect(onRoomsRemoved).toHaveBeenCalled();
    expect(onRoomsRemoved.mock.calls.flatMap((c) => c[0])).toContain("room-kitchen");
  });

  it("RA-7656 canvas room removal: an undo that drops the last room reports it", async () => {
    const { handle, fc } = await mount({ objects: [freehand] });
    const kitchen = await enliven(room("room-kitchen", 0));
    act(() => fc.add(kitchen));
    expect(roomsOn(fc)).toEqual(["room-kitchen"]);
    await act(async () => {
      await handle.undo();
    });
    await flush();
    expect(roomsOn(fc)).toEqual([]);
    expect(onRoomsRemoved).toHaveBeenCalledTimes(1);
    expect(onRoomsRemoved.mock.calls[0][0]).toEqual(["room-kitchen"]);
  });

  it("RA-7656 canvas room removal: an undo that leaves every room in place does not report", async () => {
    const { handle, fc } = await mount({ objects: [room("room-kitchen", 0)] });
    const path = await enliven(freehand);
    act(() => fc.add(path));
    await act(async () => {
      await handle.undo();
    });
    await flush();
    expect(roomsOn(fc)).toEqual(["room-kitchen"]);
    expect(onRoomsRemoved).not.toHaveBeenCalled();
  });

  it("RA-7656 canvas room removal: a redo that drops a room reports it; the undo that restored it does not", async () => {
    const { handle, fc } = await mount({ objects: [room("room-kitchen", 0), freehand] });
    const kitchen = fc.getObjects().find((o) => o.data?.id === "room-kitchen");
    act(() => fc.remove(kitchen));
    expect(onRoomsRemoved).toHaveBeenCalledTimes(1);
    await act(async () => {
      await handle.undo();
    });
    await flush();
    expect(roomsOn(fc)).toEqual(["room-kitchen"]);
    expect(onRoomsRemoved).toHaveBeenCalledTimes(1);
    await act(async () => {
      await handle.redo();
    });
    await flush();
    expect(roomsOn(fc)).toEqual([]);
    expect(onRoomsRemoved).toHaveBeenCalledTimes(2);
    expect(onRoomsRemoved.mock.calls[1][0]).toEqual(["room-kitchen"]);
  });

  it("RA-7656 canvas room removal: the onReady loadFromJSON handle does not report", async () => {
    const { handle, fc } = await mount({ objects: [room("room-kitchen", 0)] });
    await act(async () => {
      await handle.loadFromJSON({ objects: [freehand] });
    });
    await flush();
    expect(roomsOn(fc)).toEqual([]);
    expect(onRoomsRemoved).not.toHaveBeenCalled();
  });

  it("RA-7656 canvas room removal: the forwarded-ref loadFromJSON handle does not report", async () => {
    const { ref, fc } = await mount({ objects: [room("room-kitchen", 0)] });
    expect(ref.current).not.toBeNull();
    await act(async () => {
      await ref.current!.loadFromJSON({ objects: [freehand] });
    });
    await flush();
    expect(roomsOn(fc)).toEqual([]);
    expect(onRoomsRemoved).not.toHaveBeenCalled();
  });

  it("RA-7656 canvas room removal: unmount (dispose) does not report", async () => {
    const { view } = await mount({ objects: [room("room-kitchen", 0), room("room-laundry", 400)] });
    view.unmount();
    await flush();
    expect(onRoomsRemoved).not.toHaveBeenCalled();
  });
});
