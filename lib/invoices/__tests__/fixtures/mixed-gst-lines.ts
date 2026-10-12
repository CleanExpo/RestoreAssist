/**
 * RA-7896 fixture: three saved invoice lines, two taxable at 10% and one
 * GST-free, as the invoice routes store them (integer cents). Worked by hand:
 *
 *   Labour            0.69 x $22.50 = $15.525 -> $15.53 ex, GST $1.55, $17.08 inc
 *   Dehumidifier hire 3 x $19.99    = $59.97 ex,  GST $6.00 (5.997), $65.97 inc
 *   Council permit    1 x $120.00   = $120.00 ex, GST-free,          $120.00 inc
 *   Totals                            $195.50 ex, GST $7.55,         $203.05 inc
 */
export const MIXED_GST_LINES = [
  {
    id: "line_labour",
    description: "Labour",
    category: "Labour",
    quantity: 0.69,
    unitPrice: 2250,
    subtotal: 1553,
    gstRate: 10,
    gstAmount: 155,
    total: 1708,
  },
  {
    id: "line_dehu",
    description: "Dehumidifier hire",
    category: "Equipment",
    quantity: 3,
    unitPrice: 1999,
    subtotal: 5997,
    gstRate: 10,
    gstAmount: 600,
    total: 6597,
  },
  {
    id: "line_permit",
    description: "Council permit (GST-free)",
    category: null,
    quantity: 1,
    unitPrice: 12000,
    subtotal: 12000,
    gstRate: 0,
    gstAmount: 0,
    total: 12000,
  },
];

export const MIXED_GST_TOTALS = {
  subtotalExGST: 19550,
  gstAmount: 755,
  totalIncGST: 20305,
};

/**
 * In a rendered table, the text under the "Ex GST" and "Inc GST" column
 * headers on the row containing `description`. Throws if either column is
 * missing, so a table without the two prices cannot pass.
 */
export function exIncCells(root: ParentNode, description: string): string[] {
  const cell = Array.from(root.querySelectorAll("td")).find(
    (td) => !td.querySelector("table") && td.textContent?.includes(description),
  );
  if (!cell) throw new Error(`no row for ${description}`);
  const row = cell.closest("tr")!;
  const table = row.closest("table")!;
  const headers = Array.from(table.querySelectorAll("thead th")).map((th) =>
    th.textContent!.trim().toLowerCase(),
  );
  const cells = Array.from(row.querySelectorAll("td"));
  return ["ex gst", "inc gst"].map((label) => {
    const i = headers.indexOf(label);
    if (i < 0) throw new Error(`no "${label}" column; headers: ${headers.join(" | ")}`);
    return cells[i].textContent!.trim();
  });
}

/**
 * On a form, the [Ex GST, Inc GST] pair each line's price block shows, in
 * line order (the `<dl>` rendered by LineExIncPrices).
 */
export function formLinePrices(root: ParentNode): string[][] {
  return Array.from(root.querySelectorAll("dl")).map((dl) => {
    const pairs = new Map(
      Array.from(dl.querySelectorAll("dt")).map((dt) => [
        dt.textContent!.trim(),
        dt.nextElementSibling!.textContent!.trim(),
      ]),
    );
    if (!pairs.has("Ex GST") || !pairs.has("Inc GST")) {
      throw new Error(`price block without both prices: ${[...pairs.keys()]}`);
    }
    return [pairs.get("Ex GST")!, pairs.get("Inc GST")!];
  });
}

/** "$1,234.56" -> 123456 integer cents, for summing what the page shows. */
export function shownCents(text: string): number {
  const m = /^-?\$([\d,]+)\.(\d{2})$/.exec(text.trim());
  if (!m) throw new Error(`not a money string: ${text}`);
  return Number(m[1].replace(/,/g, "")) * 100 + Number(m[2]);
}

/** The Ex GST and Inc GST strings each line must show, in line order. */
export const MIXED_GST_EXPECTED = [
  ["$15.53", "$17.08"],
  ["$59.97", "$65.97"],
  ["$120.00", "$120.00"],
];
