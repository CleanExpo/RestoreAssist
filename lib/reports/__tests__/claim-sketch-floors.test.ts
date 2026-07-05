import { describe, it, expect, vi } from "vitest";
import { claimSketchesToFloors } from "../claim-sketch-floors";

/** Minimal stand-in PNG bytes — content is irrelevant to the mapper. */
function pngBytes(marker: number): Uint8Array {
  return new Uint8Array([0x89, 0x50, 0x4e, 0x47, marker]);
}

/** Fake fetch keyed by URL. A "fail" value yields a non-ok response. */
function fakeFetch(map: Record<string, Uint8Array | "fail">) {
  return vi.fn(async (url: string) => {
    const v = map[url];
    if (!v || v === "fail") {
      return { ok: false, arrayBuffer: async () => new ArrayBuffer(0) };
    }
    return {
      ok: true,
      arrayBuffer: async () =>
        v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength),
    };
  });
}

describe("claimSketchesToFloors", () => {
  it("maps rendered sketches to floors as data URLs, sorted by floorNumber", async () => {
    const sketches = [
      {
        floorNumber: 2,
        floorLabel: "Level 1",
        renderedPngUrl: "https://x/2.png",
        sketchData: { a: 1 },
      },
      {
        floorNumber: 0,
        floorLabel: "Ground Floor",
        renderedPngUrl: "https://x/0.png",
        sketchData: { b: 2 },
      },
    ];
    const fetchImpl = fakeFetch({
      "https://x/2.png": pngBytes(2),
      "https://x/0.png": pngBytes(0),
    });

    const floors = await claimSketchesToFloors(sketches, fetchImpl as never);

    expect(floors.map((f) => f.label)).toEqual(["Ground Floor", "Level 1"]);
    expect(floors[0].pngDataUrl.startsWith("data:image/png;base64,")).toBe(true);
    expect(floors[0].fabricJson).toEqual({ b: 2 });
  });

  it("skips sketches without a renderedPngUrl", async () => {
    const sketches = [
      {
        floorNumber: 0,
        floorLabel: "Ground Floor",
        renderedPngUrl: null,
        sketchData: null,
      },
      {
        floorNumber: 1,
        floorLabel: "Level 1",
        renderedPngUrl: "https://x/1.png",
        sketchData: null,
      },
    ];
    const fetchImpl = fakeFetch({ "https://x/1.png": pngBytes(1) });

    const floors = await claimSketchesToFloors(sketches, fetchImpl as never);

    expect(floors).toHaveLength(1);
    expect(floors[0].label).toBe("Level 1");
    expect(floors[0].fabricJson).toBeNull();
  });

  it("skips a floor whose image fetch fails, keeps the rest", async () => {
    const sketches = [
      {
        floorNumber: 0,
        floorLabel: "Ground Floor",
        renderedPngUrl: "https://x/0.png",
        sketchData: null,
      },
      {
        floorNumber: 1,
        floorLabel: "Level 1",
        renderedPngUrl: "https://x/broken.png",
        sketchData: null,
      },
    ];
    const fetchImpl = fakeFetch({
      "https://x/0.png": pngBytes(0),
      "https://x/broken.png": "fail",
    });

    const floors = await claimSketchesToFloors(sketches, fetchImpl as never);

    expect(floors.map((f) => f.label)).toEqual(["Ground Floor"]);
  });

  it("returns [] for empty input", async () => {
    const floors = await claimSketchesToFloors([], fakeFetch({}) as never);
    expect(floors).toEqual([]);
  });

  // RA-120 §3 — the moisture overlay pins must ride the same rail as the
  // structural sketch so the moisture map reaches the report PDF.
  it("parses moisturePoints into typed pins on the floor", async () => {
    const sketches = [
      {
        floorNumber: 0,
        floorLabel: "Ground Floor",
        renderedPngUrl: "https://x/0.png",
        sketchData: null,
        moisturePoints: [
          { nx: 0.5, ny: 0.5, wme: 20 },
          { x: 10, y: 10, wme: 18 }, // legacy, no nx/ny — skipped
        ],
      },
    ];
    const fetchImpl = fakeFetch({ "https://x/0.png": pngBytes(0) });

    const floors = await claimSketchesToFloors(sketches, fetchImpl as never);

    expect(floors[0].moisturePins).toHaveLength(1);
    expect(floors[0].moisturePins?.[0]).toMatchObject({
      nx: 0.5,
      ny: 0.5,
      wme: 20,
      iicrClass: 2,
    });
  });

  it("yields an empty pin array when moisturePoints is absent", async () => {
    const sketches = [
      {
        floorNumber: 0,
        floorLabel: "Ground Floor",
        renderedPngUrl: "https://x/0.png",
        sketchData: null,
      },
    ];
    const fetchImpl = fakeFetch({ "https://x/0.png": pngBytes(0) });

    const floors = await claimSketchesToFloors(sketches, fetchImpl as never);

    expect(floors[0].moisturePins).toEqual([]);
  });
});
