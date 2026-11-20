/**
 * RA-8413 Stage 1: reads the text of a sensor log CSV into string cells.
 *
 * Pure: no file, database or network access. Every cell stays a string; rows
 * are arrays indexed by header position, never objects keyed by header text.
 * A file that cannot be read with certainty is refused as a whole, with a code
 * and (where one place is at fault) the physical line it starts on.
 *
 * No vendor's export layout has been observed. This reader accepts ordinary
 * RFC 4180 text and makes no claim about any vendor's files.
 */

export const SENSOR_CSV_LIMITS = {
  /** Size of the text in UTF-8 bytes. */
  maxBytes: 1_000_000,
  /** Data rows, not counting the header. */
  maxRows: 5_000,
  maxColumns: 40,
} as const;

export type ParseRefusalCode =
  | "file_too_large"
  | "too_many_rows"
  | "too_many_columns"
  | "header_missing"
  | "header_empty_name"
  | "header_duplicate_name"
  | "header_reserved_name"
  | "unterminated_quote"
  | "ragged_row"
  | "nul_byte"
  | "no_data_rows"
  | "blank_line";

export type ParseRefusal = {
  ok: false;
  code: ParseRefusalCode;
  /** 1-based physical line, when one place in the file is at fault. */
  line?: number;
  /** 0-based position in the header, for the header_* codes. */
  headerIndex?: number;
  /** Cell counts, for ragged_row. */
  expected?: number;
  actual?: number;
};

export type ParsedRow = {
  /** 1-based physical line the row starts on. A quoted cell may run over several lines. */
  line: number;
  cells: string[];
};

export type ParsedSensorCsv = {
  ok: true;
  /** Header names, trimmed. */
  header: string[];
  rows: ParsedRow[];
};

const RESERVED_HEADER_NAMES = new Set(["__proto__", "constructor", "prototype"]);

const QUOTE = 34;
const COMMA = 44;
const LF = 10;
const CR = 13;

/** UTF-8 length without allocating a copy of the text. Stops counting once the limit is passed. */
function utf8ByteLength(text: string, stopAfter: number): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    const unit = text.charCodeAt(i);
    if (unit < 0x80) bytes += 1;
    else if (unit < 0x800) bytes += 2;
    else if (unit >= 0xd800 && unit <= 0xdbff && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        i++;
      } else {
        bytes += 3;
      }
    } else bytes += 3;
    if (bytes > stopAfter) return bytes;
  }
  return bytes;
}

type ScannedRow = ParsedRow & { blank: boolean };

/** One pass over the text. Returns every physical row, including the header and blank lines. */
function scan(text: string, start: number): ScannedRow[] | ParseRefusal {
  const end = text.length;
  const rows: ScannedRow[] = [];
  let i = start;
  let line = 1;
  let rowLine = 1;
  let cells: string[] = [];
  let rowHasQuotedCell = false;

  for (;;) {
    let value: string;
    let quoteLine = 0;
    if (i < end && text.charCodeAt(i) === QUOTE) {
      quoteLine = line;
      rowHasQuotedCell = true;
      i++;
      let segmentStart = i;
      const segments: string[] = [];
      let closed = false;
      while (i < end) {
        const unit = text.charCodeAt(i);
        if (unit === QUOTE) {
          if (i + 1 < end && text.charCodeAt(i + 1) === QUOTE) {
            // A doubled quote is one quote character in the cell.
            segments.push(text.slice(segmentStart, i + 1));
            i += 2;
            segmentStart = i;
          } else {
            segments.push(text.slice(segmentStart, i));
            i++;
            closed = true;
            break;
          }
        } else {
          if (unit === LF) line++;
          i++;
        }
      }
      if (!closed) return { ok: false, code: "unterminated_quote", line: quoteLine };
      value = segments.length === 1 ? segments[0] : segments.join("");
    } else {
      const cellStart = i;
      while (i < end) {
        const unit = text.charCodeAt(i);
        if (unit === COMMA || unit === LF) break;
        if (unit === CR && i + 1 < end && text.charCodeAt(i + 1) === LF) break;
        i++;
      }
      value = text.slice(cellStart, i);
    }
    cells.push(value);

    if (i >= end) {
      rows.push({ line: rowLine, cells, blank: isBlank(cells, rowHasQuotedCell) });
      return rows;
    }
    let unit = text.charCodeAt(i);
    if (unit === COMMA) {
      i++;
      continue;
    }
    if (unit === CR && i + 1 < end && text.charCodeAt(i + 1) === LF) {
      i++;
      unit = LF;
    }
    if (unit !== LF) {
      // Text straight after a closing quote: the cell cannot be read with certainty.
      return { ok: false, code: "unterminated_quote", line: quoteLine };
    }
    i++;
    rows.push({ line: rowLine, cells, blank: isBlank(cells, rowHasQuotedCell) });
    line++;
    rowLine = line;
    cells = [];
    rowHasQuotedCell = false;
    if (i >= end) return rows;
  }
}

function isBlank(cells: string[], hasQuotedCell: boolean): boolean {
  return !hasQuotedCell && cells.length === 1 && cells[0] === "";
}

function lineOfIndex(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i++) {
    if (text.charCodeAt(i) === LF) line++;
  }
  return line;
}

export function parseSensorCsv(text: string): ParsedSensorCsv | ParseRefusal {
  // Every UTF-16 unit is at least one UTF-8 byte, so an over-long string is refused without counting.
  if (
    text.length > SENSOR_CSV_LIMITS.maxBytes ||
    utf8ByteLength(text, SENSOR_CSV_LIMITS.maxBytes) > SENSOR_CSV_LIMITS.maxBytes
  ) {
    return { ok: false, code: "file_too_large" };
  }

  const nulAt = text.indexOf("\u0000");
  if (nulAt !== -1) return { ok: false, code: "nul_byte", line: lineOfIndex(text, nulAt) };

  const start = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  const scanned = scan(text, start);
  if (!Array.isArray(scanned)) return scanned;

  const [first, ...rest] = scanned;
  if (first === undefined || first.blank) return { ok: false, code: "header_missing", line: 1 };

  const header = first.cells.map((name) => name.trim());
  if (header.length > SENSOR_CSV_LIMITS.maxColumns) {
    return { ok: false, code: "too_many_columns", line: first.line };
  }
  const seen = new Set<string>();
  for (let index = 0; index < header.length; index++) {
    const name = header[index];
    if (name === "") return { ok: false, code: "header_empty_name", line: first.line, headerIndex: index };
    if (RESERVED_HEADER_NAMES.has(name)) {
      return { ok: false, code: "header_reserved_name", line: first.line, headerIndex: index };
    }
    if (seen.has(name)) {
      return { ok: false, code: "header_duplicate_name", line: first.line, headerIndex: index };
    }
    seen.add(name);
  }

  // One trailing blank line is allowed; a blank line anywhere else is refused below.
  const body = rest.length > 0 && rest[rest.length - 1].blank ? rest.slice(0, -1) : rest;
  if (body.length > SENSOR_CSV_LIMITS.maxRows) return { ok: false, code: "too_many_rows" };

  const rows: ParsedRow[] = [];
  for (const row of body) {
    if (row.blank) return { ok: false, code: "blank_line", line: row.line };
    if (row.cells.length !== header.length) {
      return {
        ok: false,
        code: "ragged_row",
        line: row.line,
        expected: header.length,
        actual: row.cells.length,
      };
    }
    rows.push({ line: row.line, cells: row.cells });
  }
  if (rows.length === 0) return { ok: false, code: "no_data_rows", line: first.line };

  return { ok: true, header, rows };
}
