import { describe, expect, it } from "vitest";
import { Circle, FabricText, Group, Line, Polygon, Rect } from "fabric/node";
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
