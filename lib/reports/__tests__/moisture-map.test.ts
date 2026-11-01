import { describe, it, expect } from "vitest";
import {
  countUnplaceableMoisturePins,
  parseMoisturePins,
  placeMoisturePins,
  moistureLegendClasses,
} from "../moisture-map";

// RA-120 §3 — the moisture map must reach the report PDF, not just the DOM
// overlay. These cover the pure data-assembly + placement that the PDF
// generator consumes (the pdf-lib rasterisation itself is exercised by the
// route test end-to-end).

describe("parseMoisturePins", () => {
  it("keeps pins with numeric wme and scene x/y, deriving class + colour", () => {
    const pins = parseMoisturePins([
      { x: 250, y: 500, wme: 10 }, // class 1 (green)
      { x: 100, y: 100, wme: 20 }, // class 2 (yellow)
      { x: 900, y: 700, wme: 30 }, // class 3 (orange)
      { x: 500, y: 500, wme: 50 }, // class 4 (red)
    ]);
    expect(pins).toHaveLength(4);
    expect(pins.map((p) => p.iicrClass)).toEqual([1, 2, 3, 4]);
    expect(pins[0].color).toBe("#22c55e");
    expect(pins[3].color).toBe("#ef4444");
  });

  it("recomputes class from wme, ignoring any stored iicrClass", () => {
    const [pin] = parseMoisturePins([
      { x: 500, y: 500, wme: 45, iicrClass: 1 },
    ]);
    expect(pin.iicrClass).toBe(4);
    expect(pin.color).toBe("#ef4444");
  });

  it("skips pins with no scene position and counts them as not shown", () => {
    const raw = [
      { nx: 0.3, ny: 0.4, wme: 18 },
      { x: 120, y: 80, nx: 0.3, ny: 0.4, wme: 18 },
    ];
    const pins = parseMoisturePins(raw);
    expect(pins).toHaveLength(1);
    expect(pins[0].x).toBe(120);
    expect(countUnplaceableMoisturePins(raw)).toBe(1);
  });

  it("skips pins with missing/NaN wme or non-finite coordinates", () => {
    const pins = parseMoisturePins([
      { x: 500, y: 500 }, // no wme
      { x: Number.NaN, y: 500, wme: 20 },
      { x: 500, y: "1", wme: 20 },
      { x: 500, y: 500, wme: Number.NaN }, // NaN wme
    ]);
    expect(pins).toEqual([]);
  });

  it("does not count a pin with no value as not shown", () => {
    expect(countUnplaceableMoisturePins([{ nx: 0.5, ny: 0.5 }, null])).toBe(0);
    expect(countUnplaceableMoisturePins("x")).toBe(0);
  });

  it("returns [] for non-array / null input", () => {
    expect(parseMoisturePins(null)).toEqual([]);
    expect(parseMoisturePins(undefined)).toEqual([]);
    expect(parseMoisturePins({})).toEqual([]);
  });
});

describe("placeMoisturePins", () => {
  const img = { x: 100, y: 200, width: 400, height: 300 };

  it("divides scene position by the PNG frame, flipping Y to page space", () => {
    const pins = parseMoisturePins([
      { x: 600, y: 200, nx: 0.05, ny: 0.05, wme: 20 },
    ]);
    const [placed] = placeMoisturePins(pins, img, { width: 1200, height: 800 });
    // cx = 100 + (600/1200)*400 = 300; nx would have given 120
    expect(placed.cx).toBe(300);
    // cy = 200 + (1 - 200/800)*300 = 425
    expect(placed.cy).toBe(425);
    expect(placed.color).toBe("#eab308");
  });

  it("uses the frame it is given, not a fixed plan size", () => {
    const pins = parseMoisturePins([{ x: 600, y: 200, wme: 20 }]);
    const [placed] = placeMoisturePins(pins, img, { width: 2000, height: 1000 });
    // cx = 100 + (600/2000)*400 = 220; a fixed 1200 would have given 300
    expect(placed.cx).toBe(220);
    // cy = 200 + (1 - 200/1000)*300 = 440; a fixed 800 would have given 425
    expect(placed.cy).toBe(440);
  });

  it("leaves out a pin beyond the frame instead of drawing it off the plan", () => {
    const pins = parseMoisturePins([
      { x: 1300, y: 200, wme: 20 },
      { x: -5, y: 200, wme: 20 },
    ]);
    expect(placeMoisturePins(pins, img, { width: 1200, height: 800 })).toEqual([]);
  });
});

describe("moistureLegendClasses", () => {
  it("returns distinct present classes ordered 1..4", () => {
    const pins = parseMoisturePins([
      { x: 100, y: 100, wme: 50 }, // class 4
      { x: 200, y: 200, wme: 10 }, // class 1
      { x: 300, y: 300, wme: 12 }, // class 1 (dup)
    ]);
    const legend = moistureLegendClasses(pins);
    expect(legend.map((c) => c.class)).toEqual([1, 4]);
  });

  it("returns [] when there are no pins", () => {
    expect(moistureLegendClasses([])).toEqual([]);
  });
});
