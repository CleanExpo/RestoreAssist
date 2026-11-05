/**
 * RA-8144 — the moisture legend and the "not shown" note must print in space
 * reserved below the floor-plan drawing, never on top of it.
 *
 * These tests read the real page geometry back out of the generated PDF: the
 * rectangle the plan image is drawn into, and the position and size of every
 * text run. A plan whose drawing fills the frame to its bottom edge is the case
 * that showed the defect, because the lowest room's wall ran through the text.
 */
import { describe, it, expect } from "vitest";
import {
  PDFDocument,
  PDFRawStream,
  StandardFonts,
  decodePDFRawStream,
} from "pdf-lib";
import { generateSketchPdf } from "@/lib/generate-sketch-pdf";
import { parseMoisturePins } from "@/lib/reports/moisture-map";
import { layoutMoistureStrip } from "@/lib/sketch/pdf-moisture-strip";

/** 17x13 opaque PNG. On the A4 page it is height-limited, so the drawing
 *  reaches the very bottom of the plan frame: the "room on the bottom edge". */
const PNG_17x13 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABEAAAANCAIAAADAGxJNAAAAFklEQVR42mO4srSEVMQwqmdUDx31AABidKmpPSOQawAAAABJRU5ErkJggg==";

const PAGE_W = 842;
const MARGIN = 36;
const FOOTER_H = 40;
/** Footer rule sits at MARGIN + FOOTER_H - 2; nothing in the strip may reach it. */
const FOOTER_TOP = MARGIN + FOOTER_H - 2;

type Floor = Parameters<typeof generateSketchPdf>[0]["floors"][number];

interface TextRun {
  text: string;
  x: number;
  y: number;
  size: number;
}
interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

type M = [number, number, number, number, number, number];
const IDENTITY: M = [1, 0, 0, 1, 0, 0];
const mul = (a: M, b: M): M => [
  a[0] * b[0] + a[1] * b[2],
  a[0] * b[1] + a[1] * b[3],
  a[2] * b[0] + a[3] * b[2],
  a[2] * b[1] + a[3] * b[3],
  a[4] * b[0] + a[5] * b[2] + b[4],
  a[4] * b[1] + a[5] * b[3] + b[5],
];

/** Walk the page content streams and return text runs + image rectangles. */
async function pageGeometry(
  bytes: Uint8Array,
): Promise<{ texts: TextRun[]; images: Rect[] }> {
  const doc = await PDFDocument.load(bytes);
  let raw = "";
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue;
    try {
      const s = Buffer.from(decodePDFRawStream(obj).decode()).toString(
        "latin1",
      );
      // Only content streams carry text or image painting operators.
      if (/\bTj\b|\bDo\b/.test(s)) raw += s + "\n";
    } catch {
      // Not decodable (an image) — nothing to read.
    }
  }
  const texts: TextRun[] = [];
  const images: Rect[] = [];
  const stack: M[] = [];
  let ctm: M = IDENTITY;
  let size = 0;
  let tm: M = IDENTITY;
  const operands: string[] = [];
  const tokens =
    raw.match(/<[0-9A-Fa-f]*>|\/[^\s/<>[\]()]+|[^\s<>/[\]()]+/g) ?? [];
  for (const tok of tokens) {
    switch (tok) {
      case "q":
        stack.push(ctm);
        break;
      case "Q":
        ctm = stack.pop() ?? IDENTITY;
        break;
      case "cm":
        ctm = mul(operands.slice(-6).map(Number) as M, ctm);
        break;
      case "Tf":
        size = Number(operands[operands.length - 1]);
        break;
      case "Tm":
        tm = operands.slice(-6).map(Number) as M;
        break;
      case "Tj": {
        const hex = operands[operands.length - 1].slice(1, -1);
        const m = mul(tm, ctm);
        texts.push({
          text: Buffer.from(hex, "hex").toString("latin1"),
          x: m[4],
          y: m[5],
          size,
        });
        break;
      }
      case "Do":
        if (operands[operands.length - 1].startsWith("/Image")) {
          images.push({ x: ctm[4], y: ctm[5], w: ctm[0], h: ctm[3] });
        }
        break;
      default:
        operands.push(tok);
        continue;
    }
    operands.length = 0;
  }
  return { texts, images };
}

const ROOM_FABRIC = {
  objects: [
    {
      type: "polygon",
      stroke: "#3b82f6",
      points: [
        { x: 0, y: 0 },
        { x: 17, y: 0 },
        { x: 17, y: 13 },
        { x: 0, y: 13 },
      ],
      data: { type: "room", label: "Kitchen", provenance: "operator_measured" },
    },
  ],
};

/** One pin in each IICRC class (all inside the frame) plus one off the frame. */
const PINS_ALL_CLASSES = parseMoisturePins([
  { x: 2, y: 12, wme: 12 },
  { x: 6, y: 12, wme: 18 },
  { x: 10, y: 12, wme: 24 },
  { x: 14, y: 12, wme: 40 },
  { x: 900, y: 900, wme: 30 },
]);

const isMoistureText = (t: TextRun) =>
  t.text.startsWith("Moisture (WME %)") ||
  t.text.includes("not shown on this plan") ||
  /\(\d+(-\d+|\+)%\)$/.test(t.text);

async function render(floor: Floor) {
  return pageGeometry(await generateSketchPdf({ floors: [floor] }));
}

describe("RA-8144 — moisture legend sits in reserved space off the drawing", () => {
  it("reads page geometry at all (guards the assertions below)", async () => {
    const g = await render({ label: "Ground", pngDataUrl: PNG_17x13 });
    expect(g.images).toHaveLength(1);
    expect(g.images[0].w).toBeGreaterThan(100);
    expect(g.texts.some((t) => t.text === "Floor Plan")).toBe(true);
  });

  const cases: Array<{ name: string; floor: Floor; expectNote: boolean }> = [
    {
      name: "bottom-edge plan, every class present, one pin off the frame",
      floor: {
        label: "Ground",
        pngDataUrl: PNG_17x13,
        moisturePins: PINS_ALL_CLASSES,
      },
      expectNote: true,
    },
    {
      name: "bottom-edge plan beside the room legend column, many omitted",
      floor: {
        label: "Ground",
        pngDataUrl: PNG_17x13,
        fabricJson: ROOM_FABRIC,
        moisturePins: PINS_ALL_CLASSES,
        moisturePinsNotShown: 1234,
      },
      expectNote: true,
    },
    {
      name: "only a not-shown note, no placed pins",
      floor: {
        label: "Ground",
        pngDataUrl: PNG_17x13,
        moisturePinsNotShown: 2,
      },
      expectNote: true,
    },
    {
      name: "pins, nothing omitted",
      floor: {
        label: "Ground",
        pngDataUrl: PNG_17x13,
        moisturePins: PINS_ALL_CLASSES.slice(0, 4),
      },
      expectNote: false,
    },
  ];

  for (const c of cases) {
    it(`no moisture text overlaps the drawing: ${c.name}`, async () => {
      const boldFont = await (
        await PDFDocument.create()
      ).embedFont(StandardFonts.HelveticaBold);
      const { texts, images } = await render(c.floor);
      expect(images).toHaveLength(1);
      const img = images[0];
      const moisture = texts.filter(isMoistureText);
      expect(moisture.some((t) => t.text.startsWith("Moisture (WME %)"))).toBe(
        (c.floor.moisturePins ?? []).length > 0,
      );
      expect(
        moisture.some((t) => t.text.includes("not shown on this plan")),
      ).toBe(c.expectNote);
      for (const t of moisture) {
        // The whole glyph box (baseline + cap height, bounded by size) is
        // below the bottom of the drawing, and above the footer rule.
        expect(
          t.y + t.size,
          `"${t.text}" top vs plan bottom`,
        ).toBeLessThanOrEqual(img.y);
        expect(t.y - t.size * 0.25, `"${t.text}" descent`).toBeGreaterThan(
          FOOTER_TOP,
        );
        // Not shrunk to fit.
        expect(t.size, `"${t.text}" size`).toBeGreaterThanOrEqual(7);
        // Inside the printable width (bold width is the wider bound).
        expect(t.x).toBeGreaterThanOrEqual(MARGIN);
        expect(
          t.x + boldFont.widthOfTextAtSize(t.text, t.size),
          `"${t.text}" right edge`,
        ).toBeLessThanOrEqual(PAGE_W - MARGIN + 0.5);
      }
    });
  }

  it("control: with no moisture data the drawing keeps the full frame", async () => {
    const plain = await render({ label: "Ground", pngDataUrl: PNG_17x13 });
    const withPins = await render({
      label: "Ground",
      pngDataUrl: PNG_17x13,
      moisturePins: PINS_ALL_CLASSES,
    });
    expect(plain.texts.filter(isMoistureText)).toHaveLength(0);
    // The reserved strip only exists when there is something to put in it...
    expect(withPins.images[0].h).toBeLessThan(plain.images[0].h);
    // ...and costs no more than the strip, so the plan is not needlessly shrunk.
    expect(plain.images[0].h - withPins.images[0].h).toBeLessThanOrEqual(40);
  });
});

describe("layoutMoistureStrip", () => {
  const measure = (text: string, size: number) => text.length * size * 0.6;
  const classes = [
    { label: "Class 1", color: "#22c55e", thresholdMin: 0, thresholdMax: 15 },
    { label: "Class 2", color: "#eab308", thresholdMin: 15, thresholdMax: 20 },
    { label: "Class 3", color: "#f97316", thresholdMin: 20, thresholdMax: 30 },
    {
      label: "Class 4",
      color: "#ef4444",
      thresholdMin: 30,
      thresholdMax: Infinity,
    },
  ];

  it("reserves nothing when there is no legend and no note", () => {
    const l = layoutMoistureStrip({
      classes: [],
      notShown: 0,
      width: 600,
      measure,
    });
    expect(l.height).toBe(0);
    expect(l.items).toHaveLength(0);
  });

  it("wraps a long legend onto more rows instead of running past the width", () => {
    const wide = layoutMoistureStrip({
      classes,
      notShown: 3,
      width: 1000,
      measure,
    });
    const narrow = layoutMoistureStrip({
      classes,
      notShown: 3,
      width: 120,
      measure,
    });
    expect(narrow.height).toBeGreaterThan(wide.height);
    for (const item of narrow.items) {
      // An item may only run past the width when it alone starts its row.
      if (item.x > 0) expect(item.x + item.width).toBeLessThanOrEqual(120);
    }
    const rows = [...new Set(narrow.items.map((i) => i.y))].sort(
      (a, b) => a - b,
    );
    expect(rows.length).toBeGreaterThan(2);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i] - rows[i - 1]).toBeGreaterThanOrEqual(narrow.fontSize);
    }
    // Every item sits inside the reserved height.
    for (const item of narrow.items) {
      expect(item.y).toBeGreaterThanOrEqual(0);
      expect(item.y + narrow.fontSize).toBeLessThanOrEqual(narrow.height);
    }
  });

  it("puts the not-shown note on its own row", () => {
    const l = layoutMoistureStrip({
      classes,
      notShown: 1,
      width: 2000,
      measure,
    });
    const note = l.items.find((i) => i.kind === "note");
    const header = l.items.find((i) => i.kind === "header");
    expect(note?.text).toBe(
      "1 moisture reading not shown on this plan: no position on the drawing.",
    );
    expect(note?.x).toBe(0);
    expect(note!.y).not.toBe(header!.y);
  });
});
