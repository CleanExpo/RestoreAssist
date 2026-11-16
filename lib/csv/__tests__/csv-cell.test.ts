/**
 * RA-8401: the shared CSV cell owner.
 */
import { describe, expect, it } from "vitest";
import {
  csvField,
  csvRow,
  parseCsv,
  toCsv,
  unguardCsvCell,
} from "../csv-cell";
import {
  costLibraryItemsToCsv,
  parseCostLibraryCsv,
} from "../cost-library-csv";

const HOSE = '6" layflat hose, 20 m';

describe("csvField quoting", () => {
  it("doubles a quote and keeps a comma inside one cell", () => {
    expect(csvField(HOSE)).toBe('"6"" layflat hose, 20 m"');
  });

  it("writes null and undefined as an empty cell", () => {
    expect(csvField(null)).toBe("");
    expect(csvField(undefined)).toBe("");
  });

  it("keeps a line break inside one quoted cell", () => {
    const rows = parseCsv(toCsv([["a\nb", "c"]]));
    expect(rows).toEqual([["a\nb", "c"]]);
  });
});

describe("csvField formula guard", () => {
  it.each(["=", "+", "-", "@", "\t", "\r"])(
    "prefixes a text cell starting with %j so it opens as text",
    (lead) => {
      const value = `${lead}HYPERLINK("http://example.invalid","Open")`;
      const cell = parseCsv(csvRow([value, "x"]))[0][0];
      expect(cell).toBe(`'${value}`);
    },
  );

  it("guards the payments-page sample from the ticket", () => {
    expect(csvField('=HYPERLINK("http://example.invalid","Open")')).toBe(
      `"'=HYPERLINK(""http://example.invalid"",""Open"")"`,
    );
  });

  // Decision recorded for RA-8401: a plain decimal number is never prefixed,
  // whether it arrives as a number or as a .toFixed() string, so a refund of
  // -50.00 still opens in Excel as a number.
  it.each([-50, "-50.00", "+3", "-0.5", "-.5", 12.5])(
    "leaves the plain number %j unprefixed",
    (n) => {
      expect(csvField(n)).toBe(`"${String(n)}"`);
    },
  );

  it.each(["-1+2", "-50 refund", "+61 400 000 000", "-"])(
    "still guards %j, which is not a plain number",
    (s) => {
      expect(csvField(s)).toBe(`"'${s}"`);
    },
  );

  it("unguardCsvCell removes only the guard prefix", () => {
    expect(unguardCsvCell("'=SUM(A1)")).toBe("=SUM(A1)");
    expect(unguardCsvCell("'plain")).toBe("'plain");
    expect(unguardCsvCell("plain")).toBe("plain");
  });
});

describe("toCsv and parseCsv", () => {
  it("round-trips the hose item as four cells with the quote kept", () => {
    const csv = toCsv([["Hoses", HOSE, "12.50", "each"]]);
    expect(parseCsv(csv)).toEqual([["Hoses", HOSE, "12.50", "each"]]);
  });

  it("reads CRLF row ends and skips blank lines", () => {
    expect(parseCsv('"a","b"\r\n\r\n"c","d"\r\n')).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("joins rows with the requested line ending", () => {
    expect(toCsv([["a"], ["b"]], "\r\n")).toBe('"a"\r\n"b"');
  });
});

describe("cost library export then import", () => {
  it("returns the same category, description, unit and rate", () => {
    const items = [
      { category: "Hoses", description: HOSE, unit: "each", rate: 12.5 },
      { category: "Labour", description: "- misc, after hours", unit: "hr", rate: 95 },
      { category: "Credits", description: "=not a formula", unit: "ea", rate: -20 },
    ];
    const parsed = parseCostLibraryCsv(costLibraryItemsToCsv(items));
    expect(parsed).toEqual(items);
  });

  it("returns null when there is no data row", () => {
    expect(parseCostLibraryCsv("category,description,unit,rate\n")).toBeNull();
  });
});
