// @vitest-environment jsdom
import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRef } from "react";

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const fabricHarness = vi.hoisted(() => {
  const canvases: FakeCanvas[] = [];
  const imageLoads = new Map<string, Deferred<FakeImage>>();

  class FakeImage {
    width = 800;
    height = 600;
    values: Record<string, unknown> = {};

    constructor(readonly url: string) {}

    set(values: Record<string, unknown>) {
      this.values = { ...this.values, ...values };
    }
  }

  class FakeCanvas {
    backgroundImage: FakeImage | null = null;
    freeDrawingBrush = { color: "", width: 0 };
    isDrawingMode = false;
    selection = true;
    defaultCursor = "default";
    width = 1200;
    height = 800;
    disposed = false;

    constructor(
      _element: HTMLCanvasElement,
      options: { width: number; height: number },
    ) {
      this.width = options.width;
      this.height = options.height;
      canvases.push(this);
    }

    on() {}
    off() {}
    setZoom() {}
    getZoom() {
      return 1;
    }
    relativePan() {}
    getPointer() {
      return { x: 0, y: 0 };
    }
    setActiveObject() {}
    getActiveObject() {
      return null;
    }
    getObjects() {
      return [];
    }
    add() {}
    remove() {}
    renderAll() {}
    requestRenderAll() {}
    calcOffset() {}
    setDimensions(size: { width: number; height: number }) {
      this.width = size.width;
      this.height = size.height;
    }
    getWidth() {
      return this.width;
    }
    getHeight() {
      return this.height;
    }
    async loadFromJSON() {
      // Fabric restores the serialized background as part of JSON loading. The
      // current underlay prop must be applied after this replacement step.
      this.backgroundImage = null;
    }
    toJSON() {
      return { objects: [] };
    }
    toDataURL() {
      return "data:image/png;base64,test";
    }
    dispose() {
      this.disposed = true;
    }
  }

  return {
    canvases,
    imageLoads,
    Canvas: FakeCanvas,
    PencilBrush: class {
      color = "";
      width = 0;
      constructor(_canvas: FakeCanvas) {}
    },
    FabricImage: {
      fromURL: vi.fn((url: string) => {
        const load = imageLoads.get(url);
        if (!load) throw new Error(`Missing deferred image load for ${url}`);
        return load.promise;
      }),
    },
    FakeImage,
  };
});

vi.mock("fabric", () => ({
  Canvas: fabricHarness.Canvas,
  PencilBrush: fabricHarness.PencilBrush,
  FabricImage: fabricHarness.FabricImage,
}));

import SketchCanvas, { type FabricCanvasRef } from "../SketchCanvas";

const URL_A = "https://media.example/a.png";
const URL_B = "https://media.example/b.png";

function prepareImage(url: string) {
  const load = deferred<InstanceType<typeof fabricHarness.FakeImage>>();
  fabricHarness.imageLoads.set(url, load);
  return load;
}

async function resolveImage(
  load: Deferred<InstanceType<typeof fabricHarness.FakeImage>>,
  url: string,
) {
  await act(async () => {
    load.resolve(new fabricHarness.FakeImage(url));
    await load.promise;
  });
}

beforeEach(() => {
  fabricHarness.canvases.length = 0;
  fabricHarness.imageLoads.clear();
  fabricHarness.FabricImage.fromURL.mockClear();
});

describe("SketchCanvas background image lifecycle", () => {
  it("applies the initial background after persisted JSON restoration", async () => {
    const loadA = prepareImage(URL_A);

    render(
      <SketchCanvas
        initialData={{ objects: [{ type: "rect" }] }}
        backgroundImageUrl={URL_A}
      />,
    );

    await waitFor(() => expect(fabricHarness.canvases).toHaveLength(1));
    await resolveImage(loadA, URL_A);

    expect(fabricHarness.canvases[0].backgroundImage?.url).toBe(URL_A);
  });

  it("does not let a slower old URL overwrite a newer background", async () => {
    const loadA = prepareImage(URL_A);
    const loadB = prepareImage(URL_B);
    const view = render(<SketchCanvas backgroundImageUrl={URL_A} />);

    await waitFor(() =>
      expect(fabricHarness.FabricImage.fromURL).toHaveBeenCalledWith(
        URL_A,
        expect.anything(),
      ),
    );

    view.rerender(<SketchCanvas backgroundImageUrl={URL_B} />);
    await waitFor(() =>
      expect(fabricHarness.FabricImage.fromURL).toHaveBeenCalledWith(
        URL_B,
        expect.anything(),
      ),
    );

    await resolveImage(loadB, URL_B);
    await resolveImage(loadA, URL_A);

    expect(fabricHarness.canvases[0].backgroundImage?.url).toBe(URL_B);
  });

  it("does not resurrect a pending background after it is cleared", async () => {
    const loadA = prepareImage(URL_A);
    const view = render(<SketchCanvas backgroundImageUrl={URL_A} />);

    await waitFor(() =>
      expect(fabricHarness.FabricImage.fromURL).toHaveBeenCalledWith(
        URL_A,
        expect.anything(),
      ),
    );

    view.rerender(<SketchCanvas backgroundImageUrl={null} />);
    await waitFor(() =>
      expect(fabricHarness.canvases[0].backgroundImage).toBeNull(),
    );
    await resolveImage(loadA, URL_A);

    expect(fabricHarness.canvases[0].backgroundImage).toBeNull();
  });

  it("reapplies the authoritative background after imperative JSON restore", async () => {
    const loadA = prepareImage(URL_A);
    const canvasRef = createRef<FabricCanvasRef>();

    render(<SketchCanvas ref={canvasRef} backgroundImageUrl={URL_A} />);
    await waitFor(() => expect(fabricHarness.canvases).toHaveLength(1));
    await resolveImage(loadA, URL_A);

    await act(async () => {
      await canvasRef.current?.loadFromJSON({
        objects: [{ type: "rect" }],
        backgroundImage: { src: "https://media.example/stale.png" },
      });
    });

    expect(fabricHarness.canvases[0].backgroundImage?.url).toBe(URL_A);
  });
});
