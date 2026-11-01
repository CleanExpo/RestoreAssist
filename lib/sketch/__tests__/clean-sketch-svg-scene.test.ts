import { describe, expect, it } from "vitest";
import {
  Circle,
  FabricText,
  Group,
  Line,
  Path,
  Point,
  Polygon,
  Rect,
  Triangle,
  util,
} from "fabric/node";
import sharp from "sharp";
import { buildCleanSketchSvg } from "@/lib/sketch/clean-sketch-svg";

const SQUARE = [
  { x: 600, y: 100 },
  { x: 900, y: 100 },
  { x: 900, y: 400 },
  { x: 600, y: 400 },
];

/** What a save stores: the object's own toObject output, plus a domain tag. */
function saved(object: { toObject: () => object }) {
  return { ...object.toObject(), data: { type: "room" } };
}

function svgFor(...objects: unknown[]): string {
  return buildCleanSketchSvg({ objects }).toString("utf8");
}

/** Numbers from the first polygon's points attribute, as [x, y] pairs. */
function polygonPoints(svg: string): number[][] {
  const match = svg.match(/<polygon points="([^"]+)"/);
  if (!match) throw new Error(`no polygon in ${svg}`);
  return match[1].split(" ").map((pair) => pair.split(",").map(Number));
}

function bounds(points: number[][]) {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return {
    left: Math.min(...xs),
    right: Math.max(...xs),
    top: Math.min(...ys),
    bottom: Math.max(...ys),
  };
}

describe("clean render places saved Fabric objects at their scene position", () => {
  it("draws a fresh polygon where its points say", () => {
    expect(bounds(polygonPoints(svgFor(saved(new Polygon(SQUARE)))))).toEqual({
      left: 600,
      right: 900,
      top: 100,
      bottom: 400,
    });
  });

  it("follows a polygon the technician dragged", () => {
    const room = new Polygon(SQUARE);
    room.set({ left: 300, top: 300 });
    expect(bounds(polygonPoints(svgFor(saved(room))))).toEqual({
      left: 150,
      right: 450,
      top: 150,
      bottom: 450,
    });
  });

  it("follows a polygon the technician scaled", () => {
    const room = new Polygon(SQUARE);
    room.set({ scaleX: 2, scaleY: 0.5 });
    expect(bounds(polygonPoints(svgFor(saved(room))))).toEqual({
      left: 450,
      right: 1050,
      top: 175,
      bottom: 325,
    });
  });

  it("follows a polygon the technician rotated", () => {
    const room = new Polygon(SQUARE);
    room.set({ angle: 90 });
    const box = bounds(polygonPoints(svgFor(saved(room))));
    expect(box.left).toBeCloseTo(600);
    expect(box.right).toBeCloseTo(900);
    expect(box.top).toBeCloseTo(100);
    expect(box.bottom).toBeCloseTo(400);
  });

  it("centres a centre-origin rect on its left and top", () => {
    const rect = new Rect({ left: 600, top: 100, width: 300, height: 200 });
    expect(bounds(polygonPoints(svgFor(saved(rect))))).toEqual({
      left: 450,
      right: 750,
      top: 0,
      bottom: 200,
    });
  });

  it("centres a centre-origin circle on its left and top", () => {
    const svg = svgFor(saved(new Circle({ left: 600, top: 100, radius: 50 })));
    expect(svg).toContain('<circle cx="600" cy="100" r="50"');
  });

  it("keeps a moved line on its scene position", () => {
    const wall = new Line([100, 200, 500, 200]);
    wall.set({ left: 700, top: 500 });
    const svg = svgFor(saved(wall));
    expect(svg).toContain('x1="500" y1="500" x2="900" y2="500"');
  });

  it("draws an equipment group's circle and captions, not a bounding box", () => {
    const group = new Group(
      [
        new Circle({ left: 0, top: 0, radius: 20, originX: "center", originY: "center" }),
        new FabricText("DH", { left: 0, top: -3, fontSize: 13, originX: "center", originY: "center" }),
        new FabricText("Dehumidifier", { left: 0, top: 17, fontSize: 9, originX: "center", originY: "top" }),
      ],
      { left: 700, top: 500, originX: "center", originY: "center" },
    );
    const svg = buildCleanSketchSvg({
      objects: [{ ...group.toObject(), data: { type: "equipment" } }],
    }).toString("utf8");
    expect(svg).not.toContain("<polygon");
    const circle = svg.match(/<circle cx="([^"]+)" cy="([^"]+)" r="([^"]+)"/);
    // Fabric centres a group on all its children, so ask Fabric where the circle is.
    const truth = group.getObjects()[0].getCenterPoint();
    expect(Number(circle?.[1])).toBeCloseTo(truth.x, 1);
    expect(Number(circle?.[2])).toBeCloseTo(truth.y, 1);
    expect(Number(circle?.[3])).toBe(20);
    expect(svg).toContain(">DH</text>");
    expect(svg).toContain(">Dehumidifier</text>");
  });

  it("carries group children through a moved and scaled group", () => {
    const group = new Group(
      [new Circle({ left: 0, top: 0, radius: 20, originX: "center", originY: "center" })],
      { left: 700, top: 500, originX: "center", originY: "center" },
    );
    group.set({ left: 200, top: 300, scaleX: 2, scaleY: 2 });
    const svg = buildCleanSketchSvg({
      objects: [{ ...group.toObject(), data: { type: "equipment" } }],
    }).toString("utf8");
    const circle = svg.match(/<circle cx="([^"]+)" cy="([^"]+)" r="([^"]+)"/);
    expect(Math.abs(Number(circle?.[1]) - 200)).toBeLessThan(2);
    expect(Math.abs(Number(circle?.[2]) - 300)).toBeLessThan(2);
    expect(Number(circle?.[3])).toBe(40);
  });

  describe("matches Fabric's own geometry under every transform", () => {
    type Local = { x: number; y: number };
    const SHAPES: Record<string, () => { shape: Rect | Circle | Triangle | Polygon | Line | Path; local: () => Local[] }> = {
      circle: () => ({
        shape: new Circle({ left: 400, top: 300, radius: 40 }),
        local: () => [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({
          x: 40 * Math.cos((i * Math.PI) / 4),
          y: 40 * Math.sin((i * Math.PI) / 4),
        })),
      }),
      rect: () => ({
        shape: new Rect({ left: 400, top: 300, width: 80, height: 40 }),
        local: () => [
          { x: -40, y: -20 },
          { x: 40, y: -20 },
          { x: 40, y: 20 },
          { x: -40, y: 20 },
        ],
      }),
      triangle: () => ({
        shape: new Triangle({ left: 400, top: 300, width: 80, height: 60 }),
        local: () => [
          { x: 0, y: -30 },
          { x: 40, y: 30 },
          { x: -40, y: 30 },
        ],
      }),
      polygon: () => {
        const shape = new Polygon(SQUARE);
        return {
          shape,
          local: () =>
            SQUARE.map((p) => ({ x: p.x - shape.pathOffset.x, y: p.y - shape.pathOffset.y })),
        };
      },
      line: () => {
        const shape = new Line([300, 200, 400, 260]);
        return {
          shape,
          local: () => {
            const { x1, y1, x2, y2 } = shape.calcLinePoints();
            return [
              { x: x1, y: y1 },
              { x: x2, y: y2 },
            ];
          },
        };
      },
      path: () => {
        const shape = new Path("M 300 200 Q 300 300 400 300", { fill: "transparent" });
        return {
          shape,
          local: () =>
            [
              { x: 300, y: 200 },
              { x: 400, y: 300 },
            ].map((p) => ({ x: p.x - shape.pathOffset.x, y: p.y - shape.pathOffset.y })),
        };
      },
    };
    const FULL = { scaleX: 2, scaleY: 0.5, angle: 30, skewX: 20, skewY: 15 };
    const TRANSFORMS: Record<string, Record<string, number | boolean | string>> = {
      "left and top origin, fully transformed": { originX: "left", originY: "top", ...FULL },
      "right and bottom origin, fully transformed": { originX: "right", originY: "bottom", ...FULL },
      "uniform stroke, left and top origin": {
        originX: "left",
        originY: "top",
        strokeUniform: true,
        strokeWidth: 6,
        ...FULL,
      },
      "thick stroke, left and top origin": {
        originX: "left",
        originY: "top",
        strokeWidth: 6,
        ...FULL,
      },
      stretched: { scaleX: 2, scaleY: 0.5 },
      rotated: { angle: 30 },
      "stretched and rotated": { scaleX: 2, scaleY: 0.5, angle: 30 },
      flipped: { flipX: true, scaleX: 1.5, scaleY: 1.5 },
      "skewed on x": { skewX: 20 },
      "skewed on y": { skewY: 15, scaleX: 1.3 },
    };

    function expectDrawnAtTruth(svg: string, truth: Point[]) {
      const drawn = [...svg.matchAll(/ points="([^"]+)"/g)].flatMap((m) =>
        m[1].split(" ").map((pair) => pair.split(",").map(Number)),
      );
      for (const m of svg.matchAll(/<line x1="([^"]+)" y1="([^"]+)" x2="([^"]+)" y2="([^"]+)"/g)) {
        drawn.push([Number(m[1]), Number(m[2])], [Number(m[3]), Number(m[4])]);
      }
      const circles = [...svg.matchAll(/<circle cx="([^"]+)" cy="([^"]+)" r="([^"]+)"/g)].map((m) =>
        m.slice(1).map(Number),
      );
      for (const point of truth) {
        const onPoint = drawn.some(([x, y]) => Math.hypot(x - point.x, y - point.y) < 1);
        const onCircle = circles.some(
          ([x, y, r]) => Math.abs(Math.hypot(x - point.x, y - point.y) - r) < 1,
        );
        expect(onPoint || onCircle, `${point.x},${point.y} not in ${svg}`).toBe(true);
      }
    }

    const truthOf = (shape: { calcTransformMatrix: () => number[] }, local: Local[]) => {
      const matrix = shape.calcTransformMatrix() as never;
      return local.map((p) => util.transformPoint(new Point(p.x, p.y), matrix));
    };

    for (const [shapeName, make] of Object.entries(SHAPES)) {
      for (const [transformName, transform] of Object.entries(TRANSFORMS)) {
        it(`${transformName} ${shapeName}, on its own`, () => {
          const { shape, local } = make();
          shape.set(transform);
          const svg = svgFor({ ...shape.toObject(), data: { type: "equipment" } });
          expectDrawnAtTruth(svg, truthOf(shape, local()));
        });

        it(`${transformName} ${shapeName}, inside a group`, () => {
          const { shape, local } = make();
          const group = new Group([shape, new Rect({ left: 700, top: 500, width: 30, height: 30 })]);
          group.set(transform);
          const svg = svgFor({ ...group.toObject(), data: { type: "equipment" } });
          expectDrawnAtTruth(svg, truthOf(shape, local()));
        });
      }
    }
  });

  it("draws a door's swing arc as a curve at its true position, not a box", () => {
    const arc = new Path("M 300 200 Q 300 300 400 300", { fill: "transparent" });
    const door = new Group([
      new Line([300, 200, 400, 200]),
      new Line([300, 200, 300, 300]),
      arc,
    ]);
    const svg = buildCleanSketchSvg({
      objects: [{ ...door.toObject(), data: { type: "opening" } }],
    }).toString("utf8");
    expect(svg).not.toContain("<polygon");
    const match = svg.match(/<polyline points="([^"]+)" fill="none"/);
    const points = match![1].split(" ").map((pair) => pair.split(",").map(Number));
    const toTruth = (x: number, y: number) =>
      util.transformPoint(
        new Point(x - arc.pathOffset.x, y - arc.pathOffset.y),
        arc.calcTransformMatrix(),
      );
    const start = toTruth(300, 200);
    const end = toTruth(400, 300);
    expect(points[0][0]).toBeCloseTo(start.x, 1);
    expect(points[0][1]).toBeCloseTo(start.y, 1);
    expect(points[points.length - 1][0]).toBeCloseTo(end.x, 1);
    expect(points[points.length - 1][1]).toBeCloseTo(end.y, 1);
    // A straight chord would pass through the midpoint; the arc bows away from it.
    const middle = points[Math.floor(points.length / 2)];
    expect(Math.hypot(middle[0] - (start.x + end.x) / 2, middle[1] - (start.y + end.y) / 2))
      .toBeGreaterThan(10);
  });

  it("draws a triangle as a triangle", () => {
    const shape = new Triangle({ left: 500, top: 400, width: 100, height: 80 });
    const points = polygonPoints(svgFor(saved(shape)));
    expect(points).toEqual([
      [500, 360],
      [550, 440],
      [450, 440],
    ]);
  });

  it("reads a left and top origin as the box corner", () => {
    const rect = new Rect({
      left: 600,
      top: 100,
      width: 300,
      height: 200,
      strokeWidth: 0,
      originX: "left",
      originY: "top",
    });
    expect(bounds(polygonPoints(svgFor(saved(rect))))).toEqual({
      left: 600,
      right: 900,
      top: 100,
      bottom: 300,
    });
  });

  it("keeps a plain point bag with no origin as absolute points", () => {
    const svg = svgFor({
      type: "polygon",
      points: SQUARE,
      data: { type: "room" },
    });
    expect(bounds(polygonPoints(svg))).toEqual({
      left: 600,
      right: 900,
      top: 100,
      bottom: 400,
    });
  });
});

describe("clean render frame", () => {
  const FAR_ROOM = [
    { x: 1500, y: 900 },
    { x: 1800, y: 900 },
    { x: 1800, y: 1100 },
    { x: 1500, y: 1100 },
  ];

  async function pixelAt(png: Buffer, x: number, y: number) {
    const { data, info } = await sharp(png)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    return data[(y * info.width + x) * info.channels];
  }

  it("grows past 1200x800 and paints geometry that sits there", async () => {
    const damage = {
      ...new Polygon(FAR_ROOM).toObject(),
      data: { type: "damage" },
    };
    const png = await sharp(buildCleanSketchSvg({ objects: [damage] }))
      .png()
      .toBuffer();
    const meta = await sharp(png).metadata();
    expect(meta.width).toBeGreaterThanOrEqual(1800);
    expect(meta.height).toBeGreaterThanOrEqual(1100);
    // The red channel drops on the damage stroke; white paper reads 255 away from it.
    expect(await pixelAt(png, 1000, 1000)).toBe(255);
    expect(await pixelAt(png, 1650, 900)).toBeLessThan(240);
  });

  it("holds the 1200x800 minimum for small plans", async () => {
    const png = await sharp(
      buildCleanSketchSvg({
        objects: [saved(new Rect({ left: 100, top: 100, width: 50, height: 50 }))],
      }),
    )
      .png()
      .toBuffer();
    const meta = await sharp(png).metadata();
    expect([meta.width, meta.height]).toEqual([1200, 800]);
  });

  it("caps the frame at 4000", () => {
    const svg = svgFor(
      saved(new Rect({ left: 9000, top: 9000, width: 50, height: 50 })),
    );
    expect(svg).toContain('width="4000" height="4000"');
  });
});
