import { describe, it, expect } from "vitest";
import {
  FAB_EDGE_GAP,
  FAB_SIZE,
  clampFabPosition,
  parseFabPosition,
} from "../chatbot-position";

const viewport = { width: 390, height: 800 };

describe("clampFabPosition", () => {
  it("leaves a position that is on screen alone", () => {
    expect(clampFabPosition({ right: 100, bottom: 200 }, viewport)).toEqual({
      right: 100,
      bottom: 200,
    });
  });

  it("keeps the whole button on screen at every edge", () => {
    const off = clampFabPosition({ right: -500, bottom: 5000 }, viewport);
    expect(off.right).toBe(FAB_EDGE_GAP);
    expect(off.bottom).toBe(viewport.height - FAB_SIZE - FAB_EDGE_GAP);
    const far = clampFabPosition({ right: 5000, bottom: -5 }, viewport);
    expect(far.right).toBe(viewport.width - FAB_SIZE - FAB_EDGE_GAP);
    expect(far.bottom).toBe(FAB_EDGE_GAP);
  });

  it("never returns an offset below the edge gap on a tiny viewport", () => {
    const p = clampFabPosition({ right: 50, bottom: 50 }, { width: 40, height: 40 });
    expect(p).toEqual({ right: FAB_EDGE_GAP, bottom: FAB_EDGE_GAP });
  });
});

describe("parseFabPosition", () => {
  it("reads a saved position", () => {
    expect(parseFabPosition('{"right":20,"bottom":120}')).toEqual({
      right: 20,
      bottom: 120,
    });
  });

  it.each([
    ["nothing saved", null],
    ["empty", ""],
    ["not JSON", "left"],
    ["null", "null"],
    ["a string value", '{"right":"20","bottom":120}'],
    ["a missing field", '{"right":20}'],
    ["a non-finite number", '{"right":1e999,"bottom":120}'],
  ])("ignores %s", (_label, raw) => {
    expect(parseFabPosition(raw)).toBeNull();
  });
});
