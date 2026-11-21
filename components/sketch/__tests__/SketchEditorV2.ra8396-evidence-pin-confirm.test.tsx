// @vitest-environment jsdom
/**
 * RA-8396 — the red X on an evidence pin asks before it deletes.
 *
 * The real editor and the real SketchEvidenceLayer; only SketchCanvas and
 * next/dynamic are stubbed. Cancel must send no DELETE and leave the pin on
 * the plan; Remove pin must send exactly one DELETE.
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

const PIN = {
  id: "pin-1",
  kind: "photo",
  x: 120,
  y: 140,
  nx: 0.2,
  ny: 0.3,
  caption: "Swollen skirting",
  roomName: "Laundry",
  thumbnailUrl: null,
  fileUrl: null,
};

let fetchMock: ReturnType<typeof vi.fn>;

function deletes() {
  return fetchMock.mock.calls.filter(
    ([, init]) => ((init as RequestInit | undefined)?.method ?? "GET").toUpperCase() === "DELETE",
  );
}

async function openPinRemove() {
  render(<SketchEditorV2 inspectionId="job-pin" />);
  await settle();
  const advanced = screen.queryByRole("button", { name: "Advanced draw" });
  if (advanced) fireEvent.click(advanced);
  await settle();
  fireEvent.click(screen.getByRole("button", { name: /^Photo/ }));
  await settle();
  fireEvent.click(screen.getByRole("button", { name: "Remove evidence pin" }));
}

describe("SketchEditorV2 evidence pin remove asks first (RA-8396)", () => {
  beforeEach(() => {
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
    vi.stubGlobal("indexedDB", {
      open() {
        throw new Error("IndexedDB disabled in this test");
      },
    });
    fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      if (url.includes("/evidence-pins/") && method === "DELETE") {
        return jsonResponse({ ok: true });
      }
      if (url.includes("/evidence-pins") && method === "GET") {
        return jsonResponse({ pins: [PIN] });
      }
      if (url.endsWith("/sketches") && method === "GET") {
        return jsonResponse({
          sketches: [
            {
              id: "srv-1",
              floorNumber: 0,
              floorLabel: "Ground Floor",
              sketchData: { objects: [{ type: "rect", data: { type: "room", id: "r1" } }] },
            },
          ],
        });
      }
      if (url.includes("/photos")) return jsonResponse({ photos: [] });
      if (url.includes("/materials")) return jsonResponse({ materials: [] });
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("Cancel sends no DELETE and keeps the pin", async () => {
    await openPinRemove();
    const dialog = await screen.findByRole("alertdialog");
    const text = dialog.textContent ?? "";
    expect(text).toContain("Remove evidence pin?");
    expect(text).toContain("“Swollen skirting”");
    expect(text).toMatch(/link between that photo and this spot on the plan is lost/);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    await settle();
    expect(deletes()).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Remove evidence pin" })).toBeTruthy();
  });

  it("Remove pin sends exactly one DELETE for that pin", async () => {
    await openPinRemove();
    await screen.findByRole("alertdialog");
    fireEvent.click(screen.getByRole("button", { name: "Remove pin" }));
    await waitFor(() => expect(deletes()).toHaveLength(1));
    await settle();
    expect(deletes()).toHaveLength(1);
    expect(String(deletes()[0][0])).toBe(
      "/api/inspections/job-pin/sketches/srv-1/evidence-pins/pin-1",
    );
    expect(screen.queryByRole("button", { name: "Remove evidence pin" })).toBeNull();
  });
});
