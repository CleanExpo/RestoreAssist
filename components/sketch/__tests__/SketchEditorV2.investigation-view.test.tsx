// @vitest-environment jsdom
/**
 * RA-8372 — the Investigation toggle shows a read-only overlay built from the
 * floor's stored evidence, and switching back leaves the plan as it was.
 * Only SketchCanvas and next/dynamic are stubbed; the editor is real.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentType, ForwardedRef } from "react";
import type { FabricCanvasRef } from "../SketchCanvas";

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
    props: { onReady?: (canvas: FabricCanvasRef) => void },
    ref: React.ForwardedRef<FabricCanvasRef>,
  ) {
    React.useEffect(() => {
      const canvas = {
        toJSON: () => ({ objects: [] }),
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
      } as unknown as FabricCanvasRef;
      if (ref && typeof ref !== "function") ref.current = canvas;
      props.onReady?.(canvas);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return React.createElement("div", { "data-testid": "sketch-canvas-stub" });
  });
  return { default: SketchCanvas };
});

const toastFn = vi.hoisted(() =>
  Object.assign(() => {}, {
    error: () => {},
    success: () => {},
    loading: () => {},
    dismiss: () => {},
  }),
);
vi.mock("react-hot-toast", () => ({
  default: toastFn,
  toast: toastFn,
  Toaster: () => null,
}));

import { SketchEditorV2 } from "../SketchEditorV2";

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

async function settle() {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

describe("SketchEditorV2 investigation view (RA-8372)", () => {
  beforeEach(() => {
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
    vi.stubGlobal("indexedDB", {
      open() {
        throw new Error("IndexedDB disabled in this test");
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = (init?.method ?? "GET").toUpperCase();
        if (url.includes("/sketches") && method === "GET") {
          return jsonResponse({
            sketches: [
              {
                id: "srv-1",
                floorNumber: 0,
                floorLabel: "Ground Floor",
                sketchData: {
                  objects: [{ type: "rect", data: { type: "room", id: "r1" } }],
                  damageMarkers: [
                    {
                      id: "dm-1",
                      type: "water_cat1",
                      severity: "moderate",
                      room_label: "Bathroom",
                      x: 120,
                      y: 140,
                    },
                  ],
                },
              },
            ],
          });
        }
        if (url.includes("/photos")) return jsonResponse({ photos: [] });
        if (url.includes("/materials")) return jsonResponse({ materials: [] });
        return jsonResponse({});
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("toggles a read-only overlay built from the stored damage marker", async () => {
    render(<SketchEditorV2 inspectionId="job-iep" />);
    await settle();

    const toggle = screen.getByTestId("sketch-view-mode-toggle");
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    expect(screen.queryByTestId("sketch-investigation-layer")).toBeNull();

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    const items = screen.getAllByTestId("investigation-observation");
    expect(items.map((el) => el.getAttribute("data-observation-id"))).toEqual([
      "technician_marker:dm-1",
    ]);
    expect(items[0].getAttribute("aria-label")).toContain("in Bathroom");
    expect(screen.getByTestId("investigation-source").textContent).toMatch(
      /No source hypothesis recorded/,
    );

    fireEvent.click(toggle);
    expect(screen.queryByTestId("sketch-investigation-layer")).toBeNull();
    // The plan's own marker layer is untouched by the view switch.
    expect(screen.getByTestId("sketch-damage-marker-layer")).toBeTruthy();
  });
});
