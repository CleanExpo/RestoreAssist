// @vitest-environment jsdom
/**
 * RA-7656 (Codex round 3) — Clear Canvas is a deliberate removal of every room.
 *
 * The route keeps the stored drawing when a save arrives without rooms, because
 * a disposed or partly loaded canvas posts exactly that. Clear Canvas followed
 * by a freehand stroke posts the same shape on purpose, so the editor marks
 * that save with `userRemovedRooms: true`. The flag rides into the offline
 * queue unchanged and is dropped once a save carrying it is acknowledged.
 *
 * The copy under test is the real SketchEditorV2; only SketchCanvas is stubbed
 * (same harness as SketchEditorV2.first-save-remount.test.tsx).
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentType, ForwardedRef } from "react";
import type { FabricCanvasRef } from "../SketchCanvas";

const probe = vi.hoisted(() => ({
  json: { objects: [] } as Record<string, unknown>,
  canvas: null as FabricCanvasRef | null,
  postStatus: 201,
}));

const queue = vi.hoisted(() => ({
  enqueued: [] as Array<{ inspectionId: string; payload: Record<string, unknown> }>,
}));

vi.mock("@/lib/nir-sync-queue", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/nir-sync-queue")>();
  return {
    ...actual,
    enqueueSketchSave: vi.fn(async (inspectionId: string, payload: Record<string, unknown>) => {
      queue.enqueued.push({ inspectionId, payload });
      return "q1";
    }),
    getPendingEntries: vi.fn(async () => []),
    getFailedEntries: vi.fn(async () => []),
  };
});

vi.mock("next/dynamic", async () => {
  const React = await import("react");
  return {
    default: (
      loader: () => Promise<{ default: ComponentType<Record<string, unknown>> }>,
    ) => {
      let Loaded: ComponentType<Record<string, unknown>> | null = null;
      const pending = loader().then((mod) => {
        Loaded = (mod.default ?? mod) as ComponentType<Record<string, unknown>>;
      });
      return React.forwardRef(function DynamicSketch(
        props: Record<string, unknown>,
        ref: ForwardedRef<unknown>,
      ) {
        const [, setTick] = React.useState(0);
        React.useEffect(() => {
          let live = true;
          void pending.then(() => {
            if (live) setTick((n) => n + 1);
          });
          return () => {
            live = false;
          };
        }, []);
        if (!Loaded) return null;
        return React.createElement(Loaded, { ...props, ref });
      });
    },
  };
});

vi.mock("../SketchCanvas", async () => {
  const React = await import("react");
  const SketchCanvas = React.forwardRef(function SketchCanvasStub(
    props: { onReady?: (canvas: FabricCanvasRef) => void; onModified?: () => void },
    ref: React.ForwardedRef<FabricCanvasRef>,
  ) {
    React.useEffect(() => {
      const canvas = {
        toJSON: () => probe.json,
        loadFromJSON: async (data: Record<string, unknown>) => {
          probe.json = data;
        },
        toDataURL: () => "data:image/png;base64,stub",
        clear: () => {
          probe.json = { objects: [] };
        },
        getFabricCanvas: () => ({
          viewportTransform: [1, 0, 0, 1, 0, 0],
          getObjects: () => [],
        }),
        zoomBy: () => ({ zoom: 1, panX: 0, panY: 0 }),
        resetViewport: () => ({ zoom: 1, panX: 0, panY: 0 }),
        saveState: () => {},
        undo: () => {},
        redo: () => {},
        canUndo: false,
        canRedo: false,
        refreshWallBands: () => {},
      } as unknown as FabricCanvasRef;
      probe.canvas = canvas;
      if (ref && typeof ref !== "function") ref.current = canvas;
      props.onReady?.(canvas);
      return () => {
        if (ref && typeof ref !== "function" && ref.current === canvas) ref.current = null;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return React.createElement(
      "button",
      { type: "button", "data-testid": "draw-stroke", onClick: () => props.onModified?.() },
      "Draw",
    );
  });
  return { default: SketchCanvas };
});

import { SketchEditorV2 } from "../SketchEditorV2";

function room(id: string, label: string, x: number) {
  return {
    type: "polygon",
    left: x,
    top: 0,
    points: [
      { x, y: 0 },
      { x: x + 300, y: 0 },
      { x: x + 300, y: 300 },
      { x, y: 300 },
    ],
    data: { type: "room", id, label, provenance: "operator_measured" },
  };
}

const storedDrawing = { objects: [room("room-kitchen", "Kitchen", 0), room("room-laundry", "Laundry", 400)] };
const freehand = { type: "path", path: [["M", 0, 0], ["L", 50, 50]], data: { type: "freehand" } };

const posts: Array<Record<string, unknown>> = [];

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

function installFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      if (url.endsWith("/sketches") && method === "POST") {
        posts.push(JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);
        return jsonResponse({ id: "srv-1" }, probe.postStatus);
      }
      if (url.endsWith("/sketches") && method === "GET") {
        return jsonResponse({
          sketches: [
            { id: "srv-1", floorNumber: 0, floorLabel: "Ground Floor", sketchData: storedDrawing },
          ],
        });
      }
      if (url.includes("/photos")) return jsonResponse({ photos: [] });
      if (url.includes("/materials")) return jsonResponse({ materials: [] });
      return jsonResponse({});
    }),
  );
}

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

async function settle(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
  for (let i = 0; i < 20; i++) {
    await act(async () => {
      await new Promise((resolve) => setImmediate(resolve));
    });
  }
}

async function renderJobWithRooms() {
  render(<SketchEditorV2 inspectionId="job-1" />);
  await settle(0);
  expect(probe.canvas).not.toBeNull();
  expect(probe.json).toEqual(storedDrawing);
}

function lastPost() {
  return posts.at(-1) as {
    userRemovedRooms?: unknown;
    sketchData?: { objects?: unknown[] };
  };
}

describe("RA-7656 Clear Canvas intent (SketchEditorV2)", () => {
  beforeEach(() => {
    probe.json = { objects: [] };
    probe.canvas = null;
    probe.postStatus = 201;
    posts.length = 0;
    queue.enqueued.length = 0;
    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"],
    });
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
    installFetch();
    return import("@/lib/sketch/ingest-roomplan");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("RA-7656 Clear Canvas intent: Clear Canvas then a freehand stroke posts the stroke with userRemovedRooms", async () => {
    await renderJobWithRooms();

    fireEvent.click(screen.getByRole("button", { name: "Clear Canvas" }));
    probe.json = { objects: [freehand] };
    fireEvent.click(screen.getByTestId("draw-stroke"));
    await settle(1600);

    expect(posts).toHaveLength(1);
    expect(lastPost().sketchData?.objects).toEqual([freehand]);
    expect(lastPost().userRemovedRooms).toBe(true);
  });

  it("RA-7656 Clear Canvas intent: a bare Clear Canvas posts the empty floor, not the old rooms", async () => {
    await renderJobWithRooms();

    fireEvent.click(screen.getByRole("button", { name: "Clear Canvas" }));
    await settle(1600);

    expect(posts).toHaveLength(1);
    expect(lastPost().sketchData?.objects).toEqual([]);
    expect(lastPost().userRemovedRooms).toBe(true);
  });

  it("RA-7656 Clear Canvas intent: once acknowledged, the next save carries no intent; an ordinary edit never does", async () => {
    await renderJobWithRooms();

    fireEvent.click(screen.getByTestId("draw-stroke"));
    await settle(1600);
    expect(posts).toHaveLength(1);
    expect(lastPost().userRemovedRooms).toBeUndefined();

    fireEvent.click(screen.getByRole("button", { name: "Clear Canvas" }));
    probe.json = { objects: [freehand] };
    await settle(1600);
    expect(posts).toHaveLength(2);
    expect(lastPost().userRemovedRooms).toBe(true);

    fireEvent.click(screen.getByTestId("draw-stroke"));
    await settle(1600);
    expect(posts).toHaveLength(3);
    expect(lastPost().userRemovedRooms).toBeUndefined();
  });

  it("RA-7656 Clear Canvas intent: failed saves queue the intent, and every later save keeps it until one is acknowledged", async () => {
    await renderJobWithRooms();
    probe.postStatus = 503;

    fireEvent.click(screen.getByRole("button", { name: "Clear Canvas" }));
    probe.json = { objects: [freehand] };
    await settle(1600);

    expect(queue.enqueued).toHaveLength(1);
    expect(queue.enqueued[0].payload.userRemovedRooms).toBe(true);
    expect(
      (queue.enqueued[0].payload.sketchData as { objects: unknown[] }).objects,
    ).toEqual([freehand]);

    // Still offline: the next stroke's save replaces the queued one (coalesced
    // per floor), so it must carry the intent itself.
    probe.json = { objects: [freehand, freehand] };
    fireEvent.click(screen.getByTestId("draw-stroke"));
    await settle(1600);
    expect(queue.enqueued).toHaveLength(2);
    expect(queue.enqueued[1].payload.userRemovedRooms).toBe(true);

    // Back online: the acknowledged save still carries it; the one after does not.
    probe.postStatus = 201;
    fireEvent.click(screen.getByTestId("draw-stroke"));
    await settle(1600);
    expect(lastPost().userRemovedRooms).toBe(true);
    fireEvent.click(screen.getByTestId("draw-stroke"));
    await settle(1600);
    expect(lastPost().userRemovedRooms).toBeUndefined();
  });
});
