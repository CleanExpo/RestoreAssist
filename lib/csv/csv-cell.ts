/**
 * The one owner of CSV cell writing and reading (RA-8401).
 *
 * Every CSV export in the web app builds its cells here. Before this module the
 * rule was copied by hand in 12 places and each copy missed a different part:
 * a quote mark in a cost item broke the row, and 11 of 12 let a cell starting
 * with `=` run as a formula when the file was opened in Excel.
 *
 * Writing rule, per cell:
 *   1. null / undefined -> an empty cell.
 *   2. Formula guard: a cell whose text starts with `=`, `+`, `-`, `@`, tab or
 *      carriage return is prefixed with `'` so a spreadsheet reads it as text.
 *      A plain decimal number (`-50`, `-50.00`, `+3`) is exempt, whether it
 *      arrives as a number or as a `.toFixed()` string, so a negative amount
 *      still opens as a number. `-1+2` is not a plain number and is guarded.
 *   3. Wrap in double quotes and double every quote inside.
 *
 * A guard test (`__tests__/csv-writer-allowlist.test.ts`) fails when a file
 * that serves a CSV download does not import this module.
 */

export type CsvCell = string | number | boolean | null | undefined;

const FORMULA_START = /^[=+\-@\t\r]/;
const PLAIN_NUMBER = /^[+-]?(\d+(\.\d*)?|\.\d+)$/;
const GUARDED = /^'[=+\-@\t\r]/;

/** Write one CSV cell: quoted, inner quotes doubled, formula start neutralised. */
export function csvField(value: CsvCell): string {
  if (value === null || value === undefined) return "";
  let s = String(value);
  if (FORMULA_START.test(s) && !PLAIN_NUMBER.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

/** Write one CSV row. */
export function csvRow(cells: readonly CsvCell[]): string {
  return cells.map(csvField).join(",");
}

/** Write a whole CSV document. `eol` defaults to "\n". */
export function toCsv(
  rows: readonly (readonly CsvCell[])[],
  eol: "\n" | "\r\n" = "\n",
): string {
  return rows.map(csvRow).join(eol);
}

/**
 * Read a whole CSV document (RFC 4180): quoted cells, a doubled quote inside a
 * quoted cell is one quote, commas and line breaks inside quotes are kept,
 * CRLF or LF row ends. Blank lines are skipped.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  let rowHasContent = false;

  const endCell = () => {
    row.push(cell);
    cell = "";
  };
  const endRow = () => {
    endCell();
    if (rowHasContent || row.length > 1 || row[0] !== "") rows.push(row);
    row = [];
    rowHasContent = false;
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      rowHasContent = true;
    } else if (ch === ",") {
      endCell();
    } else if (ch === "\n") {
      endRow();
    } else if (ch === "\r") {
      if (text[i + 1] === "\n") i++;
      endRow();
    } else {
      cell += ch;
    }
  }
  if (cell !== "" || row.length > 0 || rowHasContent) endRow();
  return rows;
}

/** Undo the formula guard on a cell read back from a file this module wrote. */
export function unguardCsvCell(value: string): string {
  return GUARDED.test(value) ? value.slice(1) : value;
}
