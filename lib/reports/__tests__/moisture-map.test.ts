import { describe, it, expect } from "vitest";
import {
  parseMoisturePins,
  placeMoisturePins,
  moistureLegendClasses,
} from "../moisture-map";

// RA-120 §3 — the moisture map must reach the report PDF, not just the DOM
// overlay. These cover the pure data-assembly + placement that the PDF
// generator consumes (the pdf-lib rasterisation itself is exercised by the
// route test end-to-end).

describe("parseMoisturePins", () => {
  it("keeps pins with numeric wme and normalized nx/ny, deriving class + colour", () => {
    const pins = parseMoisturePins([
      { nx: 0.25, ny: 0.5, wme: 10 }, // class 1 (green)
      { nx: 0.1, ny: 0.1, wme: 20 }, // class 2 (yellow)
      { nx: 0.9, ny: 0.9, wme: 30 }, // class 3 (orange)
      { nx: 0.5, ny: 0.5, wme: 50 }, // class 4 (red)
    ]);
    expect(pins).toHaveLength(4);
    expect(pins.map((p) => p.iicrClass)).toEqual([1, 2, 3, 4]);
    expect(pins[0].color).toBe("#22c55e");
    expect(pins[3].color).toBe("#ef4444");
  });

  it("recomputes class from wme, ignoring any stored iicrClass", () => {
    const [pin] = parseMoisturePins([
      { nx: 0.5, ny: 0.5, wme: 45, iicrClass: 1 },
    ]);
    expect(pin.iicrClass).toBe(4);
    expect(pin.color).toBe("#ef4444");
  });

  it("skips legacy pins without normalized coordinates", () => {
    // pre-RA-6763 pins stored only absolute x/y — unmappable without canvas size
    const pins = parseMoisturePins([
      { x: 120, y: 80, wme: 18 },
      { nx: 0.3, ny: 0.4, wme: 18 },
    ]);
    expect(pins).toHaveLength(1);
    expect(pins[0].nx).toBe(0.3);
  });

  it("skips pins with missing/NaN wme or out-of-range coordinates", () => {
    const pins = parseMoisturePins([
      { nx: 0.5, ny: 0.5 }, // no wme
      { nx: 1.5, ny: 0.5, wme: 20 }, // nx out of range
      { nx: 0.5, ny: -0.1, wme: 20 }, // ny out of range
      { nx: 0.5, ny: 0.5, wme: Number.NaN }, // NaN wme
    ]);
    expect(pins).toEqual([]);
  });

  it("returns [] for non-array / null input", () => {
    expect(parseMoisturePins(null)).toEqual([]);
    expect(parseMoisturePins(undefined)).toEqual([]);
    expect(parseMoisturePins({})).toEqual([]);
  });
});

describe("placeMoisturePins", () => {
  it("maps normalized pins onto the image rect, flipping Y to page space", () => {
    const pins = parseMoisturePins([{ nx: 0.5, ny: 0.25, wme: 20 }]);
    const [placed] = placeMoisturePins(pins, {
      x: 100,
      y: 200,
      width: 400,
      height: 300,
    });
    // cx = 100 + 0.5*400 = 300
    expect(placed.cx).toBe(300);
    // cy = 200 + (1 - 0.25)*300 = 200 + 225 = 425  (top-down ny flipped)
    expect(placed.cy).toBe(425);
    expect(placed.color).toBe("#eab308");
  });
});

describe("moistureLegendClasses", () => {
  it("returns distinct present classes ordered 1..4", () => {
    const pins = parseMoisturePins([
      { nx: 0.1, ny: 0.1, wme: 50 }, // class 4
      { nx: 0.2, ny: 0.2, wme: 10 }, // class 1
      { nx: 0.3, ny: 0.3, wme: 12 }, // class 1 (dup)
    ]);
    const legend = moistureLegendClasses(pins);
    expect(legend.map((c) => c.class)).toEqual([1, 4]);
  });

  it("returns [] when there are no pins", () => {
    expect(moistureLegendClasses([])).toEqual([]);
  });
});
