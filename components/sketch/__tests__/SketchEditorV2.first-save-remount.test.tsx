// @vitest-environment jsdom
/**
 * RA-7677 — the first room on a brand-new floor must survive the first autosave.
 *
 * performSave replaces a local floor id (`${uid}-fN`) with the server sketch id.
 * The canvas used to be keyed on that id, so the save unmounted Fabric and the
 * new canvas came back empty. The floor id swap itself must still happen.
 *
 * next/dynamic is a thin loader here. The copy under test is the real
 * SketchEditorV2; only SketchCanvas is stubbed. The raw next/dynamic runtime
 * (outside the Next compiler) claims the canvas ref for its own retry handle,
 * which is not how the bundled editor behaves.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentType, ForwardedRef } from "react";
import type { FabricCanvasRef } from "../SketchCanvas";

type ProbeCanvas = FabricCanvasRef & { instanceId: number };

type Lifetime = {
  instanceId: number;
  canvas: ProbeCanvas;
  unmounted: boolean;
};

const probe = vi.hoisted(() => {
  let seq = 0;
  const lifetimes: Lifetime[] = [];
  return {
    lifetimes,
    mounts: 0,
    unmounts: 0,
    reset() {
      seq = 0;
      lifetimes.length = 0;
      this.mounts = 0;
      this.unmounts = 0;
    },
    nextId() {
      seq += 1;
      return seq;
    },
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
      const Dynamic = React.forwardRef(function DynamicSketch(
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
      return Dynamic;
    },
  };
});

vi.mock("../SketchCanvas", async () => {
  const React = await import("react");

  const SketchCanvas = React.forwardRef(function SketchCanvasStub(
    props: {
      onReady?: (canvas: FabricCanvasRef) => void;
      onModified?: () => void;
    },
    ref: React.ForwardedRef<FabricCanvasRef>,
  ) {
    const instanceId = React.useRef<number | null>(null);
    if (instanceId.current == null) {
      instanceId.current = probe.nextId();
    }
    const id = instanceId.current;

    React.useEffect(() => {
      const canvas: ProbeCanvas = {
        instanceId: id,
        toJSON: () => ({
          objects: [
            {
              type: "rect",
              data: { type: "room", id: `room-${id}` },
            },
          ],
        }),
        loadFromJSON: async () => {},
        toDataURL: () => "data:image/png;base64,stub",
        clear: () => {},
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
      };
      const lifetime: Lifetime = { instanceId: id, canvas, unmounted: false };
      probe.lifetimes.push(lifetime);
      probe.mounts += 1;
      if (ref && typeof ref !== "function") {
        ref.current = canvas;
      }
      props.onReady?.(canvas);
      return () => {
        lifetime.unmounted = true;
        probe.unmounts += 1;
        if (ref && typeof ref !== "function" && ref.current === canvas) {
          ref.current = null;
        }
      };
      // One onReady per mount, same as SketchCanvas.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return React.createElement(
      "div",
      {
        "data-testid": "sketch-canvas-stub",
        "data-canvas-instance": String(id),
      },
      React.createElement(
        "button",
        {
          type: "button",
          "data-testid": `mark-sketch-modified-${id}`,
          onClick: () => props.onModified?.(),
        },
        "Mark modified",
      ),
    );
  });

  return { default: SketchCanvas };
});

import { SketchEditorV2 } from "../SketchEditorV2";

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
      if (url.includes("/sketches") && method === "POST") {
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          floorNumber?: number;
          floorLabel?: string;
        };
        posts.push(body as Record<string, unknown>);
        const floorNumber = body.floorNumber ?? 0;
        return jsonResponse({
          id: floorNumber === 0 ? "srv-1" : `srv-${floorNumber + 1}`,
          floorNumber,
          floorLabel: body.floorLabel ?? "Floor",
        });
      }
      if (url.includes("/sketches") && method === "GET") {
        return jsonResponse({ sketches: [] });
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

async function nextMacrotask() {
  await act(async () => {
    await new Promise((resolve) => setImmediate(resolve));
  });
}

async function settle(ms = 0) {
  const postsBefore = posts.length;
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
  // scheduleSave fires `void performSave()`. Wait until that save's fetch
  // lands, or until the macrotask queue has gone quiet when no save was due.
  if (ms > 0) {
    for (let i = 0; posts.length === postsBefore && i < 40; i++) {
      await nextMacrotask();
    }
    await nextMacrotask();
    return;
  }
  await nextMacrotask();
}

function floorIds(): Array<string | null> {
  return [...document.querySelectorAll("[data-floor-id]")].map((el) =>
    el.getAttribute("data-floor-id"),
  );
}

async function renderNewJob() {
  render(<SketchEditorV2 inspectionId="job-new" />);
  await settle(0);
  expect(screen.getByTestId("sketch-canvas-stub")).toBeTruthy();
  expect(probe.mounts).toBe(1);
}

describe("SketchEditorV2 first save on a brand-new floor (RA-7677)", () => {
  beforeEach(() => {
    probe.reset();
    posts.length = 0;
    vi.useFakeTimers({
      toFake: [
        "setTimeout",
        "clearTimeout",
        "setInterval",
        "clearInterval",
        "Date",
      ],
    });
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
    vi.stubGlobal("indexedDB", {
      open() {
        throw new Error("IndexedDB disabled in this test");
      },
    });
    installFetch();
    return import("@/lib/sketch/ingest-roomplan");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("keeps the same canvas mounted when the first save swaps in the server id", async () => {
    await renderNewJob();
    const first = probe.lifetimes[0];

    fireEvent.click(screen.getByTestId("mark-sketch-modified-1"));
    await settle(1600);

    expect(posts).toHaveLength(1);
    // On main the floor id is the React key, so this save remounts the canvas.
    expect(probe.mounts).toBe(1);
    expect(probe.unmounts).toBe(0);
    expect(first.unmounted).toBe(false);
    expect(floorIds()).toEqual(["srv-1"]);

    first.canvas.toJSON = () => ({
      objects: [
        { type: "rect", data: { type: "room", id: "room-still-here" } },
      ],
    });
    fireEvent.click(screen.getByTestId("mark-sketch-modified-1"));
    await settle(1600);

    const latest = posts.at(-1) as {
      sketchData?: { objects?: Array<{ data?: { id?: string } }> };
    };
    expect(latest.sketchData?.objects?.[0]?.data?.id).toBe("room-still-here");
    expect(probe.mounts).toBe(1);
    expect(probe.lifetimes).toHaveLength(1);
    expect(probe.lifetimes[0].canvas).toBe(first.canvas);
  });

  it("does not remount the first floor when a second new floor is saved", async () => {
    await renderNewJob();
    const first = probe.lifetimes[0];

    fireEvent.click(screen.getByRole("button", { name: "Add floor" }));
    await settle(0);
    expect(probe.lifetimes.map((life) => life.instanceId)).toEqual([1, 2]);

    fireEvent.click(screen.getByTestId("mark-sketch-modified-2"));
    await settle(1600);

    expect(posts.map((body) => body.floorNumber)).toEqual([0, 1]);
    expect(first.unmounted).toBe(false);
    expect(
      probe.lifetimes.filter((life) => life.instanceId === 1),
    ).toHaveLength(1);
    expect(floorIds()).toEqual(["srv-1", "srv-2"]);
    expect(probe.mounts).toBe(2);
    expect(probe.unmounts).toBe(0);
  });
});
