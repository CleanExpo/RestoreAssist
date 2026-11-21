// @vitest-environment jsdom
/**
 * RA-8197 — Reload, replay and conflict safety in SketchEditorV2.
 *
 * Item 5: an edit made in the 1.5 s before Reload schedules a save. It must
 * run under the editor session it was made in. Under the reloaded session it
 * would be dropped as superseded by the reloaded canvas's first save.
 * Item 6: after a revision conflict pauses saving on a floor, that floor is
 * read-only, because an edit there could be neither saved nor queued.
 *
 * The copy under test is the real SketchEditorV2; only SketchCanvas is stubbed
 * (same harness as SketchEditorV2.ra7656-clear-intent.test.tsx).
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentType, ForwardedRef } from "react";
import type { FabricCanvasRef } from "../SketchCanvas";

const probe = vi.hoisted(() => ({
  json: { objects: [] } as Record<string, unknown>,
  canvas: null as FabricCanvasRef | null,
  postStatus: 201,
  /** onReady calls that have returned (the editor's handler ran). */
  readyCalls: 0,
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
    props: {
      onReady?: (canvas: FabricCanvasRef) => void;
      onModified?: () => void;
      readonly?: boolean;
    },
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
      probe.readyCalls += 1;
      return () => {
        if (ref && typeof ref !== "function" && ref.current === canvas) ref.current = null;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return React.createElement(
      "button",
      {
        type: "button",
        "data-testid": "draw-stroke",
        "data-readonly": props.readonly ? "true" : "false",
        onClick: () => props.onModified?.(),
      },
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
        if (probe.postStatus === 409) {
          return jsonResponse({ conflict: "revision" }, 409);
        }
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

/**
 * Wait until `ready()` returns a value, flushing React and fake timers between
 * checks. Bounded by real time, not by a count of turns, so a cold or slow
 * runner cannot read the editor before it is ready.
 */
async function waitUntil<T>(
  ready: () => T | null | undefined | false,
  what: string,
  // Below vitest's 20 s testTimeout, so a stall reports this message.
  timeoutMs = 15_000,
): Promise<T> {
  const deadline = performance.now() + timeoutMs;
  for (;;) {
    const value = ready();
    if (value) return value;
    if (performance.now() > deadline) {
      throw new Error(`Timed out after ${timeoutMs} ms waiting for ${what}`);
    }
    await settle(0);
  }
}

async function renderJobWithRooms() {
  const view = render(<SketchEditorV2 inspectionId="job-1" />);
  await waitUntil(
    () =>
      probe.readyCalls > 0 &&
      JSON.stringify(probe.json) === JSON.stringify(storedDrawing) &&
      screen.queryByRole("button", { name: "Clear Canvas" }),
    "the editor's onReady to finish with the stored drawing loaded",
  );
  // Flush the state updates and effects the editor's onReady queued.
  await settle(0);
  expect(probe.canvas).not.toBeNull();
  expect(probe.json).toEqual(storedDrawing);
  return view;
}

/** Run the debounced autosave (1.5 s of fake time) and wait for its POST. */
async function nextSave() {
  const before = posts.length;
  await settle(1600);
  await waitUntil(() => posts.length > before, "the autosave POST");
}

/** Run the debounced autosave and wait for the failed save to be queued. */
async function nextQueuedSave() {
  const before = queue.enqueued.length;
  await settle(1600);
  await waitUntil(() => queue.enqueued.length > before, "the failed save to be queued");
}

function lastPost() {
  return posts.at(-1) as {
    userRemovedRooms?: unknown;
    sketchData?: { objects?: unknown[] };
  };
}

describe("RA-8197 reload and paused-floor safety (SketchEditorV2)", () => {
  beforeEach(() => {
    probe.json = { objects: [] };
    probe.canvas = null;
    probe.postStatus = 201;
    probe.readyCalls = 0;
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

  it("RA-8197 item 5: an edit made just before Reload saves under its own session, not the reloaded one", async () => {
    const view = await renderJobWithRooms();
    // Offline: every save is queued, so the queued payload shows its session.
    probe.postStatus = 503;

    // The session this editor loaded under.
    fireEvent.click(screen.getByTestId("draw-stroke"));
    await nextQueuedSave();
    const loadedSession = queue.enqueued[0].payload.editorSessionId;
    expect(typeof loadedSession).toBe("string");

    // Edit (a stroke on top of the rooms), then Reload before the 1.5 s
    // debounce fires.
    const edited = { objects: [...storedDrawing.objects, freehand] };
    probe.json = edited;
    fireEvent.click(screen.getByTestId("draw-stroke"));
    await settle(500);
    view.rerender(<SketchEditorV2 inspectionId="job-1" sketchReloadToken={1} />);
    await waitUntil(
      () => queue.enqueued.length > 1,
      "the pending edit's save to be queued",
    );

    const pendingEdit = queue.enqueued[1].payload;
    expect(
      (pendingEdit.sketchData as { objects: unknown[] }).objects,
    ).toEqual(edited.objects);
    expect(pendingEdit.editorSessionId).toBe(loadedSession);

    // The reloaded editor saves under a new session, so its first save cannot
    // supersede the edit queued above.
    await waitUntil(
      () => JSON.stringify(probe.json) === JSON.stringify(storedDrawing),
      "the reload to replace the canvas",
    );
    fireEvent.click(screen.getByTestId("draw-stroke"));
    await nextQueuedSave();
    expect(queue.enqueued.at(-1)?.payload.editorSessionId).not.toBe(loadedSession);
  });

  it("RA-8197 item 6: a floor paused by a revision conflict becomes read-only", async () => {
    await renderJobWithRooms();
    expect(screen.getByTestId("draw-stroke").dataset.readonly).toBe("false");
    expect(screen.queryByTestId("floor-paused-shield")).toBeNull();

    probe.postStatus = 409;
    fireEvent.click(screen.getByTestId("draw-stroke"));
    await nextQueuedSave();
    expect(queue.enqueued[0].payload.refusedAsConflict).toBe(true);

    await waitUntil(
      () => screen.queryByTestId("floor-paused-shield"),
      "the paused floor to be shielded",
    );
    expect(screen.getByTestId("draw-stroke").dataset.readonly).toBe("true");
    expect(screen.queryByRole("button", { name: "Clear Canvas" })).toBeNull();
  });
});
