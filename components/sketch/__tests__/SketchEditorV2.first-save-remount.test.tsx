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

vi.mock("../SketchEvidenceLayer", () => ({
  SketchEvidenceLayer: ({ pins, existingPhotos, onPlace, onPlaceExisting }: {
    pins: unknown[];
    existingPhotos: unknown[];
    onPlace: (coords: { x: number; y: number; nx: number; ny: number; file: File }) => void;
    onPlaceExisting?: (coords: { x: number; y: number; nx: number; ny: number; photo: { id: string; url: string; mimeType: string } }) => void;
  }) => (
    <>
      <span data-testid="pin-count">{pins.length}</span>
      <span data-testid="existing-photo-count">{existingPhotos.length}</span>
      <button type="button" data-testid="place-pin-photo" onClick={() => onPlace({ x: 10, y: 20, nx: 0.1, ny: 0.2,
        file: new File([new Uint8Array([0xff, 0xd8, 0xff])], "room.jpg", { type: "image/jpeg" }) })}>
        Place synthetic photo
      </button>
      <button type="button" data-testid="place-existing-pin" onClick={() => onPlaceExisting?.({ x: 10, y: 20, nx: 0.1, ny: 0.2,
        photo: { id: "photo-existing", url: "signed-url", mimeType: "image/jpeg" } })}>
        Place existing synthetic photo
      </button>
    </>
  ),
}));

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

function installFetch(getSketches: () => Promise<Response> = async () => jsonResponse({ sketches: [] })) {
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
        return getSketches();
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

  it("does not open or save an empty floor after a failed sketch read, then retries", async () => {
    const getSketches = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ error: "temporary failure" }, 503))
      .mockResolvedValueOnce(jsonResponse({ sketches: [] }));
    installFetch(getSketches);
    render(<SketchEditorV2 inspectionId="job-new" />);
    await settle(0);

    expect(screen.getByRole("alert").textContent).toMatch(/Could not load this job’s floor plan/);
    expect(screen.queryByTestId("sketch-canvas-stub")).toBeNull();
    expect(screen.queryByRole("button", { name: "Add floor" })).toBeNull();
    expect(posts).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Retry floor plan" }));
    await settle(0);
    expect(getSketches).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("sketch-canvas-stub")).toBeTruthy();
  });

  it("treats a malformed successful sketch response as a read failure", async () => {
    installFetch(async () => jsonResponse({ error: "missing sketches" }));
    render(<SketchEditorV2 inspectionId="job-new" />);
    await settle(0);
    expect(screen.getByRole("alert").textContent).toMatch(/Could not load this job’s floor plan/);
    expect(screen.queryByTestId("sketch-canvas-stub")).toBeNull();
  });

  it("ignores an old job's delayed pin read after a new job's floor plan loads", async () => {
    let finishOldPins!: (response: Response) => void;
    const oldPins = new Promise<Response>((resolve) => { finishOldPins = resolve; });
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/inspections/job-a/sketches") return jsonResponse({ sketches: [{ id: "floor-a", floorNumber: 0, floorLabel: "Ground Floor", sketchData: null }] });
      if (url === "/api/inspections/job-a/sketches/floor-a/evidence-pins") return oldPins;
      if (url === "/api/inspections/job-b/sketches") return jsonResponse({ sketches: [] });
      if (url.endsWith("/photos")) return jsonResponse({ photos: [] });
      if (url === "/api/materials") return jsonResponse({ materials: [] });
      return jsonResponse({});
    }));
    const view = render(<SketchEditorV2 inspectionId="job-a" />);
    await settle(0);
    view.rerender(<SketchEditorV2 inspectionId="job-b" />);
    await settle(0);
    expect(screen.getByTestId("sketch-canvas-stub")).toBeTruthy();
    finishOldPins(jsonResponse({ pins: [] }));
    await settle(0);
    expect(screen.queryByText(/Loading floor plan/)).toBeNull();
    expect(screen.getByTestId("sketch-canvas-stub")).toBeTruthy();
  });

  it("clears old job photo choices before the new job's photo request finishes", async () => {
    let finishNewPhotos!: (response: Response) => void;
    const newPhotos = new Promise<Response>((resolve) => { finishNewPhotos = resolve; });
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/sketches")) return jsonResponse({ sketches: [] });
      if (url === "/api/inspections/job-a/photos") return jsonResponse({ photos: [{ id: "photo-a", url: "signed-a" }] });
      if (url === "/api/inspections/job-b/photos") return newPhotos;
      if (url === "/api/materials") return jsonResponse({ materials: [] });
      return jsonResponse({});
    }));
    const view = render(<SketchEditorV2 inspectionId="job-a" />);
    await settle(0);
    expect(screen.getByTestId("existing-photo-count").textContent).toBe("1");
    view.rerender(<SketchEditorV2 inspectionId="job-b" />);
    await settle(0);
    expect(screen.getByTestId("existing-photo-count").textContent).toBe("0");
    finishNewPhotos(jsonResponse({ photos: [] }));
    await settle(0);
    expect(screen.getByTestId("existing-photo-count").textContent).toBe("0");
  });

  it("retains an unverified pin photo and retries the same upload before showing a pin", async () => {
    await renderNewJob();
    fireEvent.click(screen.getByTestId("mark-sketch-modified-1"));
    await settle(1600);
    expect(floorIds()).toEqual(["srv-1"]);

    let photoPosts = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/photos") && init?.method === "POST") {
        photoPosts++;
        return photoPosts === 1
          ? jsonResponse({ error: "synthetic outage" }, 503)
          : jsonResponse({ photo: { id: "photo-1" } }, 201);
      }
      if (url.endsWith("/photos")) return jsonResponse({ photos: [{ id: "photo-1", url: "signed-url", mimeType: "image/jpeg" }] });
      if (url.endsWith("/evidence-pins") && init?.method === "POST") return jsonResponse({ pin: { id: "pin-1", inspectionPhotoId: "photo-1", kind: "photo", x: 10, y: 20 } }, 201);
      if (url.includes("/evidence-pins")) return jsonResponse({ pins: [] });
      return jsonResponse({});
    }));

    fireEvent.click(screen.getAllByTestId("place-pin-photo")[0]);
    await nextMacrotask();
    expect(screen.getByRole("alert").textContent).toMatch(/not both verified|synthetic outage/);
    expect(photoPosts).toBe(1);
    fireEvent.click(screen.getByRole("button", { name: "Retry photo pin" }));
    await nextMacrotask();
    expect(photoPosts).toBe(2);
    expect(screen.queryByRole("button", { name: "Retry photo pin" })).toBeNull();
  });

  it("blocks floor removal while a photo pin remains pending", async () => {
    await renderNewJob();
    fireEvent.click(screen.getByRole("button", { name: "Add floor" }));
    await settle(0);
    fireEvent.click(screen.getByRole("button", { name: "Ground Floor" }));
    await settle(0);
    fireEvent.click(screen.getByTestId("mark-sketch-modified-1"));
    await settle(1600);
    expect(floorIds()).toHaveLength(2);

    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/photos") && init?.method === "POST") return jsonResponse({ error: "synthetic outage" }, 503);
      if (url.endsWith("/photos")) return jsonResponse({ photos: [] });
      return jsonResponse({});
    }));
    fireEvent.click(screen.getAllByTestId("place-pin-photo")[0]);
    await nextMacrotask();
    expect(screen.getByRole("button", { name: "Retry photo pin" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Remove Ground Floor" }));
    expect(floorIds()).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Retry photo pin" })).toBeTruthy();
  });

  it("reconciles an uncertain existing-photo pin POST before repeating it", async () => {
    await renderNewJob();
    fireEvent.click(screen.getByTestId("mark-sketch-modified-1"));
    await settle(1600);
    let pinPosts = 0;
    let pinReads = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/evidence-pins") && init?.method === "POST") {
        pinPosts++;
        return jsonResponse({ error: "lost response" }, 503);
      }
      if (url.includes("/evidence-pins")) {
        pinReads++;
        return jsonResponse({ pins: pinReads === 1 ? [] : [{ id: "pin-existing", inspectionPhotoId: "photo-existing", x: 10, y: 20 }] });
      }
      if (url.endsWith("/photos")) return jsonResponse({ photos: [] });
      return jsonResponse({});
    }));
    fireEvent.click(screen.getByTestId("place-existing-pin"));
    await nextMacrotask();
    expect(pinPosts).toBe(1);
    expect(screen.getByRole("button", { name: "Retry existing photo pin" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry existing photo pin" }));
    await nextMacrotask();
    expect(pinPosts).toBe(1);
    expect(pinReads).toBe(2);
    expect(screen.queryByRole("button", { name: "Retry existing photo pin" })).toBeNull();
    expect(screen.getByTestId("pin-count").textContent).toBe("1");
  });

  it("retries an existing-photo pin with the same key and body after an exact empty readback", async () => {
    await renderNewJob();
    fireEvent.click(screen.getByTestId("mark-sketch-modified-1"));
    await settle(1600);
    const attempts: Array<{ key: string | null; body: string }> = [];
    const reads: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/evidence-pins") && init?.method === "POST") {
        attempts.push({ key: new Headers(init.headers).get("Idempotency-Key"), body: String(init.body) });
        return attempts.length === 1
          ? jsonResponse({ error: "lost response" }, 503)
          : jsonResponse({ pin: { id: "pin-existing", inspectionPhotoId: "photo-existing", x: 10, y: 20 } }, 201);
      }
      if (url.includes("/evidence-pins?")) {
        reads.push(url);
        return jsonResponse({ pins: [] });
      }
      if (url.endsWith("/photos")) return jsonResponse({ photos: [] });
      return jsonResponse({});
    }));
    fireEvent.click(screen.getByTestId("place-existing-pin"));
    await nextMacrotask();
    expect(attempts).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Retry existing photo pin" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry existing photo pin" }));
    await nextMacrotask();
    expect(attempts).toHaveLength(2);
    expect(attempts[0].key).toMatch(/^pin-/);
    expect(attempts[1]).toEqual(attempts[0]);
    expect(reads).toHaveLength(2);
    for (const read of reads) {
      const query = new URL(read, "http://localhost").searchParams;
      expect(query.get("inspectionPhotoId")).toBe("photo-existing");
      expect(query.get("x")).toBe("10");
      expect(query.get("y")).toBe("20");
    }
    expect(screen.getByTestId("pin-count").textContent).toBe("1");
  });

  it("uses a separate stable pin key after a fresh photo upload and uncertain pin POST", async () => {
    await renderNewJob();
    fireEvent.click(screen.getByTestId("mark-sketch-modified-1"));
    await settle(1600);
    const attempts: Array<{ key: string | null; body: string }> = [];
    let photoKey: string | null = null;
    const reads: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/photos") && init?.method === "POST") {
        photoKey = new Headers(init.headers).get("Idempotency-Key");
        return jsonResponse({ photo: { id: "photo-new" } }, 201);
      }
      if (url.endsWith("/photos")) return jsonResponse({ photos: [{ id: "photo-new", url: "signed-url", mimeType: "image/jpeg" }] });
      if (url.endsWith("/evidence-pins") && init?.method === "POST") {
        attempts.push({ key: new Headers(init.headers).get("Idempotency-Key"), body: String(init.body) });
        return attempts.length === 1
          ? jsonResponse({ error: "lost response" }, 503)
          : jsonResponse({ pin: { id: "pin-new", inspectionPhotoId: "photo-new", x: 10, y: 20 } }, 201);
      }
      if (url.includes("/evidence-pins?")) {
        reads.push(url);
        return jsonResponse({ pins: [] });
      }
      return jsonResponse({});
    }));
    fireEvent.click(screen.getByTestId("place-pin-photo"));
    await nextMacrotask();
    expect(attempts).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Retry photo pin" }));
    await nextMacrotask();
    expect(attempts).toHaveLength(2);
    expect(photoKey).toMatch(/^photo-/);
    expect(attempts[0].key).toBe(`pin-${photoKey}`);
    expect(attempts[1]).toEqual(attempts[0]);
    expect(reads).toHaveLength(1);
    const query = new URL(reads[0], "http://localhost").searchParams;
    expect(query.get("inspectionPhotoId")).toBe("photo-new");
    expect(query.get("x")).toBe("10");
    expect(query.get("y")).toBe("20");
    expect(screen.getByTestId("pin-count").textContent).toBe("1");
  });

  it("does not attach an old job's fresh pin after delayed retry readback", async () => {
    let finishOldPinRead!: (response: Response) => void;
    const oldPinRead = new Promise<Response>((resolve) => { finishOldPinRead = resolve; });
    let aPinReads = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/inspections/job-a/sketches") return jsonResponse({ sketches: [{ id: "floor-a", floorNumber: 0, floorLabel: "Ground Floor", sketchData: null }] });
      if (url === "/api/inspections/job-b/sketches") return jsonResponse({ sketches: [] });
      if (url === "/api/inspections/job-a/sketches/floor-a/evidence-pins" && init?.method === "POST") return jsonResponse({ error: "lost response" }, 503);
      if (url.startsWith("/api/inspections/job-a/sketches/floor-a/evidence-pins")) {
        aPinReads++;
        return aPinReads === 1 ? jsonResponse({ pins: [] }) : oldPinRead;
      }
      if (url === "/api/inspections/job-a/photos" && init?.method === "POST") return jsonResponse({ photo: { id: "photo-a" } }, 201);
      if (url === "/api/inspections/job-a/photos") return jsonResponse({ photos: [{ id: "photo-a", url: "signed-url" }] });
      if (url.endsWith("/photos")) return jsonResponse({ photos: [] });
      if (url === "/api/materials") return jsonResponse({ materials: [] });
      return jsonResponse({});
    }));
    const view = render(<SketchEditorV2 inspectionId="job-a" />);
    await settle(0);
    fireEvent.click(screen.getByTestId("place-pin-photo"));
    await nextMacrotask();
    expect(screen.getByRole("button", { name: "Retry photo pin" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry photo pin" }));
    await nextMacrotask();
    view.rerender(<SketchEditorV2 inspectionId="job-b" />);
    await settle(0);
    finishOldPinRead(jsonResponse({ pins: [{ id: "pin-a", inspectionPhotoId: "photo-a", x: 10, y: 20 }] }));
    await settle(0);
    expect(screen.getByTestId("pin-count").textContent).toBe("0");
    expect(screen.queryByRole("button", { name: "Retry photo pin" })).toBeNull();
    view.rerender(<SketchEditorV2 inspectionId="job-a" />);
    await settle(0);
    expect(screen.getByRole("button", { name: "Retry photo pin" })).toBeTruthy();
  });

  it("keeps a photo from a lost unsaved floor for backup instead of pinning stale coordinates", async () => {
    let photoPosts = 0;
    let pinPosts = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/sketches") && init?.method === "POST") return jsonResponse({ id: "floor-a", floorNumber: 0, floorLabel: "Ground Floor" }, 201);
      if (url.endsWith("/sketches")) return jsonResponse({ sketches: [] });
      if (url === "/api/inspections/job-a/photos" && init?.method === "POST") {
        photoPosts++;
        return photoPosts === 1 ? jsonResponse({ error: "temporary" }, 503) : jsonResponse({ photo: { id: "photo-a" } }, 201);
      }
      if (url === "/api/inspections/job-a/photos") return jsonResponse({ photos: [{ id: "photo-a", url: "signed-url" }] });
      if (url.endsWith("/photos")) return jsonResponse({ photos: [] });
      if (url.endsWith("/evidence-pins") && init?.method === "POST") {
        pinPosts++;
        return jsonResponse({ pin: { id: "pin-a", inspectionPhotoId: "photo-a", x: 10, y: 20 } }, 201);
      }
      if (url.includes("/evidence-pins")) return jsonResponse({ pins: [] });
      if (url === "/api/materials") return jsonResponse({ materials: [] });
      return jsonResponse({});
    }));
    const view = render(<SketchEditorV2 inspectionId="job-a" />);
    await settle(0);
    fireEvent.click(screen.getByTestId("place-pin-photo"));
    await nextMacrotask();
    expect(photoPosts).toBe(1);
    expect(screen.getByRole("button", { name: "Retry photo pin" })).toBeTruthy();
    view.rerender(<SketchEditorV2 inspectionId="job-b" />);
    await settle(0);
    expect(screen.queryByRole("button", { name: "Retry photo pin" })).toBeNull();
    view.rerender(<SketchEditorV2 inspectionId="job-a" />);
    await settle(0);
    expect(screen.getByRole("alert").textContent).toMatch(/original unsaved floor is no longer loaded/i);
    expect(screen.getByRole("button", { name: "Save original copy" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry photo pin" }));
    await nextMacrotask();
    expect(photoPosts).toBe(1);
    expect(pinPosts).toBe(0);
    expect(screen.getByRole("button", { name: "Retry photo pin" })).toBeTruthy();
  });

  it("keeps an existing-photo pin from a lost unsaved floor for deliberate re-placement", async () => {
    let pinPosts = 0;
    let sketchPosts = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/sketches") && init?.method === "POST") {
        sketchPosts++;
        return sketchPosts === 1
          ? jsonResponse({ error: "floor save failed" }, 503)
          : jsonResponse({ id: "floor-a", floorNumber: 0, floorLabel: "Ground Floor" }, 201);
      }
      if (url.endsWith("/sketches")) return jsonResponse({ sketches: [] });
      if (url.endsWith("/evidence-pins") && init?.method === "POST") {
        pinPosts++;
        return jsonResponse({ pin: { id: "pin-existing", inspectionPhotoId: "photo-existing", x: 10, y: 20 } }, 201);
      }
      if (url.includes("/evidence-pins")) return jsonResponse({ pins: [] });
      if (url.endsWith("/photos")) return jsonResponse({ photos: [] });
      if (url === "/api/materials") return jsonResponse({ materials: [] });
      return jsonResponse({});
    }));
    const view = render(<SketchEditorV2 inspectionId="job-a" />);
    await settle(0);
    fireEvent.click(screen.getByTestId("place-existing-pin"));
    await nextMacrotask();
    expect(screen.getByRole("button", { name: "Retry existing photo pin" })).toBeTruthy();
    view.rerender(<SketchEditorV2 inspectionId="job-b" />);
    await settle(0);
    expect(screen.queryByRole("button", { name: "Retry existing photo pin" })).toBeNull();
    view.rerender(<SketchEditorV2 inspectionId="job-a" />);
    await settle(0);
    expect(screen.getByRole("alert").textContent).toMatch(/original unsaved floor is no longer loaded/i);
    expect(screen.getByRole("button", { name: "Clear pending pin" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry existing photo pin" }));
    await nextMacrotask();
    expect(pinPosts).toBe(0);
    expect(screen.getByRole("button", { name: "Retry existing photo pin" })).toBeTruthy();
  });

  it("reconnects a pending pin to its exact server floor after local-to-persisted save", async () => {
    let aSketchReads = 0;
    let pinPosts = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/inspections/job-a/sketches" && init?.method === "POST") return jsonResponse({ id: "floor-a", floorNumber: 0, floorLabel: "Ground Floor" }, 201);
      if (url === "/api/inspections/job-a/sketches") {
        aSketchReads++;
        return jsonResponse({ sketches: aSketchReads === 1 ? [] : [{ id: "floor-a", floorNumber: 0, floorLabel: "Ground Floor", sketchData: null }] });
      }
      if (url === "/api/inspections/job-b/sketches") return jsonResponse({ sketches: [] });
      if (url === "/api/inspections/job-a/photos" && init?.method === "POST") return jsonResponse({ photo: { id: "photo-a" } }, 201);
      if (url === "/api/inspections/job-a/photos") return jsonResponse({ photos: [{ id: "photo-a", url: "signed-url" }] });
      if (url.endsWith("/photos")) return jsonResponse({ photos: [] });
      if (url.endsWith("/evidence-pins") && init?.method === "POST") {
        pinPosts++;
        return pinPosts === 1 ? jsonResponse({ error: "temporary" }, 503)
          : jsonResponse({ pin: { id: "pin-a", inspectionPhotoId: "photo-a", x: 10, y: 20 } }, 201);
      }
      if (url.includes("/evidence-pins")) return jsonResponse({ pins: [] });
      if (url === "/api/materials") return jsonResponse({ materials: [] });
      return jsonResponse({});
    }));
    const view = render(<SketchEditorV2 inspectionId="job-a" />);
    await settle(0);
    fireEvent.click(screen.getByTestId("place-pin-photo"));
    await nextMacrotask();
    expect(pinPosts).toBe(1);
    expect(screen.getByRole("button", { name: "Retry photo pin" })).toBeTruthy();
    view.rerender(<SketchEditorV2 inspectionId="job-b" />);
    await settle(0);
    view.rerender(<SketchEditorV2 inspectionId="job-a" />);
    await settle(0);
    fireEvent.click(screen.getByRole("button", { name: "Retry photo pin" }));
    await nextMacrotask();
    expect(pinPosts).toBe(2);
    expect(screen.queryByRole("button", { name: "Retry photo pin" })).toBeNull();
  });

  it("does not pin old coordinates onto a newly added floor with a reused local id", async () => {
    let pinPosts = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/sketches") && init?.method === "POST") return jsonResponse({ error: "floor save failed" }, 503);
      if (url.endsWith("/sketches")) return jsonResponse({ sketches: [] });
      if (url.endsWith("/evidence-pins") && init?.method === "POST") {
        pinPosts++;
        return jsonResponse({ pin: { id: "unexpected" } }, 201);
      }
      if (url.endsWith("/photos")) return jsonResponse({ photos: [] });
      if (url === "/api/materials") return jsonResponse({ materials: [] });
      return jsonResponse({});
    }));
    const view = render(<SketchEditorV2 inspectionId="job-a" />);
    await settle(0);
    fireEvent.click(screen.getByRole("button", { name: "Add floor" }));
    await settle(0);
    fireEvent.click(screen.getAllByTestId("place-existing-pin")[1]);
    await nextMacrotask();
    expect(screen.getByRole("button", { name: "Retry existing photo pin" })).toBeTruthy();
    view.rerender(<SketchEditorV2 inspectionId="job-b" />);
    await settle(0);
    view.rerender(<SketchEditorV2 inspectionId="job-a" />);
    await settle(0);
    fireEvent.click(screen.getByRole("button", { name: "Add floor" }));
    await settle(0);
    expect(screen.getByRole("alert").textContent).toMatch(/original unsaved floor is no longer loaded/i);
    fireEvent.click(screen.getByRole("button", { name: "Retry existing photo pin" }));
    await nextMacrotask();
    expect(pinPosts).toBe(0);
  });
});
