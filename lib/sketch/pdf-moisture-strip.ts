/**
 * RA-8144 — layout for the moisture legend and the "not shown" note on the
 * floor-plan PDF page.
 *
 * These lines used to be drawn inside the bottom-left of the plan image, so a
 * room whose wall reached the bottom of the plan ran through the text. The page
 * now reserves a strip below the drawing for them. This pure function decides
 * what goes in the strip and how tall it is; the caller takes that height off
 * the plan's frame before fitting the image, so the drawing never shares space
 * with the text and pin positions are unchanged (they scale with the image).
 */

export interface MoistureStripClass {
  label: string;
  color: string;
  thresholdMin: number;
  thresholdMax: number;
}

export interface MoistureStripItem {
  kind: "header" | "class" | "note";
  text: string;
  /** Left edge from the strip's left edge. For a class item this is the swatch. */
  x: number;
  /** Baseline height above the strip's bottom edge. */
  y: number;
  /** Full width of the item, swatch included. */
  width: number;
  /** Swatch colour, class items only. */
  color?: string;
}

export interface MoistureStripLayout {
  /** Height to reserve below the drawing. 0 when there is nothing to print. */
  height: number;
  fontSize: number;
  items: MoistureStripItem[];
}

/** Font size for every line in the strip. Never reduced to make text fit. */
export const MOISTURE_STRIP_FONT = 7;
/** Swatch circle plus its gap before the class text. */
export const MOISTURE_SWATCH_W = 9;
const ROW_H = 10;
const GAP_X = 12;
/** Clear space between the bottom of the drawing and the first row. */
const TOP_PAD = 6;
const BOTTOM_PAD = 2;

export const MOISTURE_LEGEND_HEADER = "Moisture (WME %):";

export function moistureClassText(c: MoistureStripClass): string {
  const range = c.thresholdMax === Infinity ? "+" : `-${c.thresholdMax}`;
  return `${c.label} (${c.thresholdMin}${range}%)`;
}

export function moistureNotShownText(n: number): string {
  return `${n} moisture ${n === 1 ? "reading" : "readings"} not shown on this plan: no position on the drawing.`;
}

/**
 * Lay out the legend (header + one item per class, flowing left to right and
 * wrapping to a new row when the next item would pass `width`) and the note
 * (its own row, word-wrapped). `measure(text, size)` is the bold font's width
 * for headers and notes and the regular font's width for class text; the
 * caller passes the wider of the two, so nothing measured here under-reserves.
 */
export function layoutMoistureStrip(input: {
  classes: MoistureStripClass[];
  notShown: number;
  width: number;
  measure: (text: string, size: number) => number;
}): MoistureStripLayout {
  const { classes, notShown, width, measure } = input;
  const size = MOISTURE_STRIP_FONT;
  const rows: Omit<MoistureStripItem, "y">[][] = [];

  if (classes.length > 0) {
    let row: Omit<MoistureStripItem, "y">[] = [];
    let cursor = 0;
    const place = (item: Omit<MoistureStripItem, "x" | "y">) => {
      if (row.length > 0 && cursor + item.width > width) {
        rows.push(row);
        row = [];
        cursor = 0;
      }
      row.push({ ...item, x: cursor });
      cursor += item.width + GAP_X;
    };
    place({
      kind: "header",
      text: MOISTURE_LEGEND_HEADER,
      width: measure(MOISTURE_LEGEND_HEADER, size),
    });
    for (const c of classes) {
      const text = moistureClassText(c);
      place({
        kind: "class",
        text,
        color: c.color,
        width: MOISTURE_SWATCH_W + measure(text, size),
      });
    }
    rows.push(row);
  }

  if (notShown > 0) {
    let line = "";
    for (const word of moistureNotShownText(notShown).split(" ")) {
      const next = line ? `${line} ${word}` : word;
      if (line && measure(next, size) > width) {
        rows.push([
          { kind: "note", text: line, x: 0, width: measure(line, size) },
        ]);
        line = word;
      } else {
        line = next;
      }
    }
    rows.push([{ kind: "note", text: line, x: 0, width: measure(line, size) }]);
  }

  if (rows.length === 0) return { height: 0, fontSize: size, items: [] };

  const height = TOP_PAD + rows.length * ROW_H + BOTTOM_PAD;
  const items: MoistureStripItem[] = [];
  rows.forEach((row, i) => {
    // Row 0 sits just under the drawing; later rows step down the page.
    const y = height - TOP_PAD - (i + 1) * ROW_H + (ROW_H - size);
    for (const item of row) items.push({ ...item, y });
  });
  return { height, fontSize: size, items };
}
