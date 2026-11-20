import { describe, expect, it } from "vitest";

import { SENSOR_CSV_LIMITS, parseSensorCsv } from "../parse-sensor-csv";

function parsed(text: string) {
  const result = parseSensorCsv(text);
  if (!result.ok) throw new Error(`expected the file to parse, got ${result.code}`);
  return result;
}

describe("AC-1 reader", () => {
  it("reads quoted fields, doubled quotes, and commas and newlines inside quotes", () => {
    const result = parsed('a,b,c\n"x, y","say ""hi""","line1\nline2"\n7,8,9\n');
    expect(result.header).toEqual(["a", "b", "c"]);
    expect(result.rows).toEqual([
      { line: 2, cells: ["x, y", 'say "hi"', "line1\nline2"] },
      { line: 4, cells: ["7", "8", "9"] },
    ]);
  });

  it("keeps every cell as a string and does not trim cells", () => {
    const result = parsed("a,b\n 1 ,007\n");
    expect(result.rows[0].cells).toEqual([" 1 ", "007"]);
  });

  it("strips a leading byte order mark and trims header names", () => {
    expect(parsed("﻿ a , b \n1,2\n").header).toEqual(["a", "b"]);
  });

  it("accepts CRLF line endings and a last row with no line ending", () => {
    expect(parsed("a,b\r\n1,2\r\n3,4").rows).toEqual([
      { line: 2, cells: ["1", "2"] },
      { line: 3, cells: ["3", "4"] },
    ]);
  });

  it("ignores one trailing blank line", () => {
    expect(parsed("a,b\n1,2\n\n").rows).toHaveLength(1);
  });

  it("treats an empty quoted cell on its own line as a cell, not a blank line", () => {
    expect(parsed('a\n""\nx\n').rows).toEqual([
      { line: 2, cells: [""] },
      { line: 3, cells: ["x"] },
    ]);
  });

  it("refuses a blank line that is not the single trailing one", () => {
    expect(parseSensorCsv("a,b\n1,2\n\n3,4\n")).toEqual({ ok: false, code: "blank_line", line: 3 });
    expect(parseSensorCsv("a,b\n1,2\n\n\n")).toEqual({ ok: false, code: "blank_line", line: 3 });
  });

  it("refuses a missing header", () => {
    expect(parseSensorCsv("")).toEqual({ ok: false, code: "header_missing", line: 1 });
    expect(parseSensorCsv("\n1,2\n")).toEqual({ ok: false, code: "header_missing", line: 1 });
  });

  it("refuses an empty or repeated header name and says which column", () => {
    expect(parseSensorCsv("a, ,c\n1,2,3\n")).toEqual({
      ok: false,
      code: "header_empty_name",
      line: 1,
      headerIndex: 1,
    });
    expect(parseSensorCsv("a,b,a\n1,2,3\n")).toEqual({
      ok: false,
      code: "header_duplicate_name",
      line: 1,
      headerIndex: 2,
    });
  });

  it("refuses a quote that is never closed, or closed and then followed by text", () => {
    expect(parseSensorCsv('a,b\n1,2\n"x,2\n')).toEqual({ ok: false, code: "unterminated_quote", line: 3 });
    expect(parseSensorCsv('a,b\n"x"y,2\n')).toEqual({ ok: false, code: "unterminated_quote", line: 2 });
  });

  it("refuses a row with the wrong number of cells and gives both counts", () => {
    expect(parseSensorCsv("a,b\n1,2,3\n")).toEqual({
      ok: false,
      code: "ragged_row",
      line: 2,
      expected: 2,
      actual: 3,
    });
    expect(parseSensorCsv("a,b\n1,2\n3\n")).toEqual({
      ok: false,
      code: "ragged_row",
      line: 3,
      expected: 2,
      actual: 1,
    });
  });

  it("refuses a NUL byte and gives its line", () => {
    expect(parseSensorCsv("a,b\n1,2\n3,\u00004\n")).toEqual({ ok: false, code: "nul_byte", line: 3 });
  });

  it("refuses a file with a header and no data rows", () => {
    expect(parseSensorCsv("a,b\n")).toEqual({ ok: false, code: "no_data_rows", line: 1 });
    expect(parseSensorCsv("a,b")).toEqual({ ok: false, code: "no_data_rows", line: 1 });
  });
});

describe("AC-2 limits", () => {
  it("accepts the largest allowed row count and refuses one more", () => {
    const atLimit = "a\n" + "1\n".repeat(SENSOR_CSV_LIMITS.maxRows);
    expect(parsed(atLimit).rows).toHaveLength(5000);
    expect(parseSensorCsv(atLimit + "1\n")).toEqual({ ok: false, code: "too_many_rows" });
  });

  it("accepts 40 columns and refuses 41", () => {
    const names = (count: number) => Array.from({ length: count }, (_, i) => `c${i}`).join(",");
    const cells = (count: number) => Array.from({ length: count }, () => "1").join(",");
    expect(parsed(`${names(40)}\n${cells(40)}\n`).header).toHaveLength(40);
    expect(parseSensorCsv(`${names(41)}\n${cells(41)}\n`)).toEqual({
      ok: false,
      code: "too_many_columns",
      line: 1,
    });
  });

  it("measures the size limit in UTF-8 bytes, not characters", () => {
    // "h\n" is 2 bytes; each "é" is 2 bytes in UTF-8 and 1 character.
    const atLimit = "h\n" + "é".repeat(499_999);
    expect(new TextEncoder().encode(atLimit).length).toBe(1_000_000);
    expect(atLimit.length).toBe(500_001);
    expect(parsed(atLimit).rows).toHaveLength(1);

    const oneOver = atLimit + "x";
    expect(new TextEncoder().encode(oneOver).length).toBe(1_000_001);
    expect(parseSensorCsv(oneOver)).toEqual({ ok: false, code: "file_too_large" });
  });

  it("counts a character outside the basic plane as four bytes", () => {
    // U+1F600 is 2 UTF-16 units and 4 UTF-8 bytes; written as an escape to keep this file free of pictographs.
    const astral = "\u{1F600}";
    const atLimit = "h\n" + astral.repeat(249_999) + "xx";
    expect(new TextEncoder().encode(atLimit).length).toBe(1_000_000);
    expect(parsed(atLimit).rows).toHaveLength(1);
    expect(parseSensorCsv(atLimit + "x")).toEqual({ ok: false, code: "file_too_large" });
  });
});

describe("AC-7 header safety", () => {
  it.each([
    ["__proto__", 1],
    ["constructor", 1],
    ["prototype", 1],
  ])("refuses the reserved header name %s", (name, index) => {
    expect(parseSensorCsv(`a,${name}\n1,2\n`)).toEqual({
      ok: false,
      code: "header_reserved_name",
      line: 1,
      headerIndex: index,
    });
  });

  it("leaves Object.prototype unchanged after reading hostile headers", () => {
    const before = Object.getOwnPropertyNames(Object.prototype).sort();
    parseSensorCsv("__proto__,polluted\n1,yes\n");
    parseSensorCsv("a,constructor\n1,2\n");
    expect(Object.getOwnPropertyNames(Object.prototype).sort()).toEqual(before);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe("AC-9 budget (reader)", () => {
  it("reads one cell of 900,000 quote characters in under 2,000 ms", () => {
    // An opening quote, 449,999 doubled quotes and a closing quote: 900,000 quote characters.
    const text = 'h\n"' + '""'.repeat(449_999) + '"\n';
    const started = performance.now();
    const result = parsed(text);
    const elapsed = performance.now() - started;
    expect(result.rows[0].cells[0]).toHaveLength(449_999);
    expect(elapsed).toBeLessThan(2000);
  });
});
