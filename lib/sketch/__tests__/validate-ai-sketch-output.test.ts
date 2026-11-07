/**
 * RA-8235 part A — strict validation of the AI floor plan reader's output.
 * Pure function, no network, no AI call.
 */
import { describe, expect, it } from "vitest";
import {
  SKETCH_READER_LIMITS,
  validateSketchReaderOutput,
} from "../validate-ai-sketch-output";

const square = (x = 0.1, y = 0.1, s = 0.3) => [
  { x, y },
  { x: x + s, y },
  { x: x + s, y: y + s },
  { x, y: y + s },
];
const room = (label = "Lounge", vertices: unknown = square()) => ({
  label,
  vertices,
});

function polygon(n: number) {
  // Regular n-gon inside [0,1]; simple and non-self-crossing.
  return Array.from({ length: n }, (_, i) => ({
    x: 0.5 + 0.4 * Math.cos((2 * Math.PI * i) / n),
    y: 0.5 + 0.4 * Math.sin((2 * Math.PI * i) / n),
  }));
}

describe("validateSketchReaderOutput: valid input", () => {
  it("accepts a valid room and tags it ai_suggested with no billable fields", () => {
    const out = validateSketchReaderOutput({
      rooms: [
        {
          ...room("Kitchen"),
          areaM2: 99,
          confirmed: true,
          provenance: "operator_measured",
          confirmedBy: "someone",
        },
      ],
    });
    expect(out.status).toBe("ok");
    if (out.status !== "ok") return;
    expect(out.manualDrawingFallback).toBe(false);
    expect(out.droppedCount).toBe(0);
    expect(out.proposals).toHaveLength(1);
    const p = out.proposals[0];
    expect(p.provenance).toBe("ai_suggested");
    expect(Object.keys(p).sort()).toEqual(["label", "provenance", "vertices"]);
    expect(p.vertices).toEqual(square());
  });

  it("accepts an L-shaped (concave) room and coordinates exactly on 0 and 1", () => {
    const l = [
      { x: 0, y: 0 },
      { x: 0.6, y: 0 },
      { x: 0.6, y: 0.3 },
      { x: 0.3, y: 0.3 },
      { x: 0.3, y: 1 },
      { x: 0, y: 1 },
    ];
    const out = validateSketchReaderOutput({ rooms: [room("L", l)] });
    expect(out.status).toBe("ok");
  });

  it("drops a repeated closing vertex instead of rejecting the room", () => {
    const closed = [...square(), { x: 0.1, y: 0.1 }];
    const out = validateSketchReaderOutput({ rooms: [room("Closed", closed)] });
    expect(out.status).toBe("ok");
    if (out.status === "ok") expect(out.proposals[0].vertices).toHaveLength(4);
  });

  it("uses a generic label for a blank or non-string label and trims long ones", () => {
    const out = validateSketchReaderOutput({
      rooms: [
        room("   "),
        { label: 42, vertices: square(0.5, 0.5, 0.2) },
        room("x".repeat(500), square(0.6, 0.1, 0.2)),
      ],
    });
    expect(out.status).toBe("ok");
    if (out.status !== "ok") return;
    expect(out.proposals[0].label).toBe("Room 1");
    expect(out.proposals[1].label).toBe("Room 2");
    expect(out.proposals[2].label.length).toBe(
      SKETCH_READER_LIMITS.MAX_LABEL_LENGTH,
    );
  });
});

describe("validateSketchReaderOutput: whole-result rejection", () => {
  it.each([
    ["rooms is a string", { rooms: "kitchen" }],
    ["rooms is an object", { rooms: { a: 1 } }],
    ["rooms is a number", { rooms: 3 }],
    ["result is null", null],
    ["result is a number", 7],
    ["result is an array", []],
    ["result is a string", "rooms"],
  ])("invalid when %s", (_name, input) => {
    const out = validateSketchReaderOutput(input);
    expect(out.status).toBe("invalid");
    expect(out.proposals).toEqual([]);
    expect(out.manualDrawingFallback).toBe(true);
    expect(out.message.length).toBeGreaterThan(10);
  });

  it.each([
    ["rooms is empty", { rooms: [] }],
    ["rooms is missing", {}],
    ["rooms is null", { rooms: null }],
  ])("no_plan when %s", (_name, input) => {
    const out = validateSketchReaderOutput(input);
    expect(out.status).toBe("no_plan");
    expect(out.proposals).toEqual([]);
    expect(out.manualDrawingFallback).toBe(true);
    expect(out.message).toMatch(/draw/i);
  });

  it("invalid when there are too many rooms, without inspecting them", () => {
    const rooms = Array.from(
      { length: SKETCH_READER_LIMITS.MAX_ROOMS + 1 },
      (_, i) => room(`R${i}`),
    );
    const out = validateSketchReaderOutput({ rooms });
    expect(out.status).toBe("invalid");
    expect(out.message).toMatch(/too many rooms/i);
  });

  it("accepts exactly MAX_ROOMS rooms", () => {
    const rooms = Array.from({ length: SKETCH_READER_LIMITS.MAX_ROOMS }, (_, i) =>
      room(`R${i}`),
    );
    const out = validateSketchReaderOutput({ rooms });
    expect(out.status).toBe("ok");
  });

  it("invalid (not no_plan) when every room is bad, with the drop count", () => {
    const out = validateSketchReaderOutput({
      rooms: [room("A", []), room("B", "nope")],
    });
    expect(out.status).toBe("invalid");
    expect(out.droppedCount).toBe(2);
    expect(out.manualDrawingFallback).toBe(true);
  });
});

describe("validateSketchReaderOutput: per-room rejection", () => {
  const bad: [string, unknown, RegExp][] = [
    ["vertices not an array", "abc", /vertices/i],
    ["vertices null", null, /vertices/i],
    ["fewer than 3 points", [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }], /3 corners/i],
    [
      "3 points but only 2 distinct",
      [{ x: 0.1, y: 0.1 }, { x: 0.4, y: 0.4 }, { x: 0.1, y: 0.1 }],
      /3 corners|distinct/i,
    ],
    [
      "all points identical",
      [{ x: 0.2, y: 0.2 }, { x: 0.2, y: 0.2 }, { x: 0.2, y: 0.2 }, { x: 0.2, y: 0.2 }],
      /3 corners|distinct/i,
    ],
    [
      "zero area (collinear)",
      [{ x: 0.1, y: 0.1 }, { x: 0.3, y: 0.3 }, { x: 0.5, y: 0.5 }],
      /no area/i,
    ],
    [
      "bow-tie (self-crossing)",
      [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.5 }, { x: 0.5, y: 0.1 }, { x: 0.1, y: 0.5 }],
      /cross/i,
    ],
    [
      "figure with a vertex touching another edge",
      [
        { x: 0.1, y: 0.1 },
        { x: 0.5, y: 0.1 },
        { x: 0.5, y: 0.5 },
        { x: 0.3, y: 0.1 },
        { x: 0.1, y: 0.5 },
      ],
      /cross|touch/i,
    ],
    [
      "x is NaN",
      [{ x: Number.NaN, y: 0.1 }, { x: 0.5, y: 0.1 }, { x: 0.5, y: 0.5 }],
      /number|range/i,
    ],
    [
      "y is Infinity",
      [{ x: 0.1, y: Infinity }, { x: 0.5, y: 0.1 }, { x: 0.5, y: 0.5 }],
      /number|range/i,
    ],
    [
      "x is a string",
      [{ x: "0.1", y: 0.1 }, { x: 0.5, y: 0.1 }, { x: 0.5, y: 0.5 }],
      /number/i,
    ],
    [
      "x is null",
      [{ x: null, y: 0.1 }, { x: 0.5, y: 0.1 }, { x: 0.5, y: 0.5 }],
      /number/i,
    ],
    [
      "x above 1",
      [{ x: 1.2, y: 0.1 }, { x: 0.5, y: 0.1 }, { x: 0.5, y: 0.5 }],
      /outside|number/i,
    ],
    [
      "y below 0",
      [{ x: 0.1, y: -0.01 }, { x: 0.5, y: 0.1 }, { x: 0.5, y: 0.5 }],
      /outside|number/i,
    ],
    [
      "a vertex that is not an object",
      [null, { x: 0.5, y: 0.1 }, { x: 0.5, y: 0.5 }],
      /number|point/i,
    ],
    [
      "a speck smaller than the minimum area",
      [{ x: 0.1, y: 0.1 }, { x: 0.101, y: 0.1 }, { x: 0.101, y: 0.101 }],
      /small|no area/i,
    ],
  ];

  it.each(bad)("drops only the bad room: %s", (_name, vertices, reasonRe) => {
    const out = validateSketchReaderOutput({
      rooms: [room("Good", square(0.5, 0.5, 0.2)), room("Bad", vertices)],
    });
    expect(out.status).toBe("ok");
    if (out.status !== "ok") return;
    expect(out.proposals.map((p) => p.label)).toEqual(["Good"]);
    expect(out.droppedCount).toBe(1);
    expect(out.dropped).toHaveLength(1);
    expect(out.dropped[0].index).toBe(1);
    expect(out.dropped[0].reason).toMatch(reasonRe);
    expect(out.message).toMatch(/1 room/);
  });

  it("drops a room that is null or not an object", () => {
    const out = validateSketchReaderOutput({
      rooms: [room("Good"), null, 5, "x", []],
    });
    expect(out.status).toBe("ok");
    if (out.status === "ok") expect(out.droppedCount).toBe(4);
  });

  it("drops a room with too many vertices without walking them", () => {
    let touched = 0;
    const big = new Proxy(polygon(8), {
      get(t, p, r) {
        if (p !== "length") touched++;
        return Reflect.get(t, p, r);
      },
    });
    Object.defineProperty(big, "length", { value: 100000 });
    const out = validateSketchReaderOutput({
      rooms: [room("Good"), { label: "Huge", vertices: big }],
    });
    expect(out.status).toBe("ok");
    if (out.status !== "ok") return;
    expect(out.droppedCount).toBe(1);
    expect(out.dropped[0].reason).toMatch(/too many corners/i);
    expect(touched).toBe(0);
  });

  it("accepts exactly MAX_VERTICES_PER_ROOM and rejects one more", () => {
    const n = SKETCH_READER_LIMITS.MAX_VERTICES_PER_ROOM;
    const atLimit = validateSketchReaderOutput({ rooms: [room("A", polygon(n))] });
    expect(atLimit.status).toBe("ok");
    const over = validateSketchReaderOutput({ rooms: [room("A", polygon(n + 1))] });
    expect(over.status).toBe("invalid");
    expect(over.droppedCount).toBe(1);
  });

  it("never throws on hostile input", () => {
    const hostile: unknown[] = [
      undefined,
      { rooms: [{ label: {}, vertices: [{}, {}, {}] }] },
      { rooms: [{ vertices: [[0, 0], [1, 0], [1, 1]] }] },
      { rooms: new Array(3) },
      { rooms: [{ get label(): string { throw new Error("boom"); }, vertices: square() }] },
    ];
    for (const h of hostile) {
      expect(() => validateSketchReaderOutput(h)).not.toThrow();
    }
  });

  it("reports at most MAX_DROP_REPORTS drop entries but counts all", () => {
    const rooms = Array.from({ length: SKETCH_READER_LIMITS.MAX_ROOMS }, () =>
      room("Bad", []),
    );
    rooms[0] = room("Good");
    const out = validateSketchReaderOutput({ rooms });
    expect(out.status).toBe("ok");
    if (out.status !== "ok") return;
    expect(out.droppedCount).toBe(SKETCH_READER_LIMITS.MAX_ROOMS - 1);
    expect(out.dropped.length).toBeLessThanOrEqual(
      SKETCH_READER_LIMITS.MAX_DROP_REPORTS,
    );
  });
});
