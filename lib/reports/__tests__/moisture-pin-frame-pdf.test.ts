import { describe, expect, it } from "vitest";
import { Polygon } from "fabric/node";
import { PDFDocument } from "pdf-lib";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import sharp from "sharp";
import { appendSketchPages } from "../append-sketch-pages";
import { parseMoisturePins } from "../moisture-map";
import { buildCleanSketchSvg } from "@/lib/sketch/clean-sketch-svg";
import { toNormalized } from "@/lib/sketch/pin-coords";

const LOUNGE = { left: 100, right: 500, top: 100, bottom: 400 };
const BEDROOM = { left: 640, right: 1040, top: 100, bottom: 400 };

function roomObject(box: typeof LOUNGE) {
  const room = new Polygon([
    { x: box.left, y: box.top },
    { x: box.right, y: box.top },
    { x: box.right, y: box.bottom },
    { x: box.left, y: box.bottom },
  ]);
  return { ...room.toObject(), data: { type: "room" } };
}

/** A pin as SketchMoistureLayer saves it: scene x,y, nx,ny against the panel. */
function savedPin(
  scene: { x: number; y: number },
  wme: number,
  panelWidth: number,
) {
  return {
    ...scene,
    ...toNormalized(scene.x, scene.y, panelWidth, 700),
    wme,
    material: "plasterboard",
  };
}

type Matrix = number[];
const multiply = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];

/** Reads the real bytes: where the plan image and each pin label landed. */
async function readPage(pdfBytes: Uint8Array) {
  const task = getDocument({
    data: new Uint8Array(pdfBytes),
    useSystemFonts: true,
  });
  const pdf = await task.promise;
  const page = await pdf.getPage(pdf.numPages);
  const ops = await page.getOperatorList();
  let current: Matrix = [1, 0, 0, 1, 0, 0];
  const stack: Matrix[] = [];
  let image: Matrix | null = null;
  ops.fnArray.forEach((fn: number, i: number) => {
    if (fn === OPS.save) stack.push(current);
    else if (fn === OPS.restore) current = stack.pop() ?? current;
    else if (fn === OPS.transform) {
      current = multiply(current, ops.argsArray[i] as Matrix);
    } else if (fn === OPS.paintImageXObject && !image) image = current;
  });
  if (!image) throw new Error("no image drawn on the page");
  const content = await page.getTextContent();
  const labels = new Map<string, { x: number; y: number }>();
  for (const item of content.items) {
    if (!("str" in item)) continue;
    labels.set(item.str, {
      x: item.transform[4] + item.width / 2,
      y: item.transform[5] + 2.5,
    });
  }
  await task.destroy();
  return { image: image as Matrix, labels };
}

/**
 * Walks out from a pixel to the nearest dark stroke on each side: the room
 * actually painted around that pixel, read from the image and not the input.
 */
function paintedRoomAround(
  raw: Buffer,
  width: number,
  channels: number,
  x: number,
  y: number,
) {
  const dark = (px: number) => raw[(y * width + px) * channels] < 128;
  let left = Math.round(x);
  while (left > 0 && !dark(left)) left -= 1;
  let right = Math.round(x);
  while (right < width - 1 && !dark(right)) right += 1;
  return { left, right };
}

async function printedRoomForPin(
  panelWidth: number,
  wme: number,
  scene: { x: number; y: number },
  rooms: (typeof LOUNGE)[] = [LOUNGE, BEDROOM],
) {
  const sketchData = { objects: rooms.map(roomObject) };
  const png = await sharp(buildCleanSketchSvg(sketchData)).png().toBuffer();
  const { data, info } = await sharp(png)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const base = await PDFDocument.create();
  base.addPage([200, 200]);
  const pdfBytes = await appendSketchPages(
    await base.save(),
    [
      {
        label: "Ground",
        pngDataUrl: `data:image/png;base64,${png.toString("base64")}`,
        fabricJson: null,
        moisturePins: parseMoisturePins([savedPin(scene, wme, panelWidth)]),
      },
    ],
    { reportNumber: "RPT-1" },
  );
  const { image, labels } = await readPage(pdfBytes);
  const label = labels.get(String(wme));
  if (!label) throw new Error(`pin ${wme} did not print`);
  const pixelX = ((label.x - image[4]) / image[0]) * info.width;
  const pixelY = (1 - (label.y - image[5]) / image[3]) * info.height;
  return {
    pixelX,
    pixelY,
    room: paintedRoomAround(data, info.width, info.channels, pixelX, Math.round(pixelY)),
  };
}

const near = (a: number, b: number) => Math.abs(a - b) <= 6;

describe("readings the plan cannot place", () => {
  it("prints how many were not shown, counting pins past an old 1200 frame", async () => {
    const png = await sharp(buildCleanSketchSvg({ objects: [] })).png().toBuffer();
    const base = await PDFDocument.create();
    base.addPage([200, 200]);
    const raw = [
      { x: 300, y: 250, wme: 66 },
      { x: 1500, y: 250, wme: 55 },
    ];
    const pdfBytes = await appendSketchPages(
      await base.save(),
      [
        {
          label: "Ground",
          pngDataUrl: `data:image/png;base64,${png.toString("base64")}`,
          fabricJson: null,
          moisturePins: parseMoisturePins(raw),
          moisturePinsNotShown: 1,
        },
      ],
      { reportNumber: "RPT-1" },
    );
    const { labels } = await readPage(pdfBytes);
    expect(labels.has("66")).toBe(true);
    expect(labels.has("55")).toBe(false);
    expect(
      [...labels.keys()].some((text) =>
        text.startsWith("2 moisture readings not shown on this plan"),
      ),
    ).toBe(true);
  });
});

describe("AC-F1 printed pins land in the room they were placed in", () => {
  it.each([1000, 1600])(
    "panel width %i: lounge pin prints inside the painted lounge",
    async (panelWidth) => {
      const printed = await printedRoomForPin(panelWidth, 77, { x: 300, y: 250 });
      expect(near(printed.pixelX, 300)).toBe(true);
      expect(near(printed.pixelY, 250)).toBe(true);
      expect(near(printed.room.left, LOUNGE.left)).toBe(true);
      expect(near(printed.room.right, LOUNGE.right)).toBe(true);
    },
  );

  it("a plan wider and taller than the old 1200x800 frame still places the pin", async () => {
    const far = { left: 1700, right: 2100, top: 900, bottom: 1200 };
    const printed = await printedRoomForPin(1000, 99, { x: 1900, y: 1050 }, [LOUNGE, far]);
    expect(near(printed.pixelX, 1900)).toBe(true);
    expect(near(printed.pixelY, 1050)).toBe(true);
    expect(near(printed.room.left, far.left)).toBe(true);
    expect(near(printed.room.right, far.right)).toBe(true);
  });

  it.each([1000, 1600])(
    "panel width %i: a bedroom pin fails the lounge assertion",
    async (panelWidth) => {
      const printed = await printedRoomForPin(panelWidth, 88, { x: 840, y: 250 });
      expect(near(printed.room.left, LOUNGE.left)).toBe(false);
      expect(near(printed.room.right, LOUNGE.right)).toBe(false);
      expect(near(printed.room.left, BEDROOM.left)).toBe(true);
      expect(near(printed.room.right, BEDROOM.right)).toBe(true);
    },
  );
});
