import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { mapRows, type MapRowsSuccess } from "../map-rows";
import { validateMapping } from "../mapping";
import { parseSensorCsv, type ParsedRow } from "../parse-sensor-csv";

const NOW = new Date("2026-11-20T00:00:00.000Z");
const SYDNEY = "Australia/Sydney";

function csv(header: string[], rows: string[][]): string {
  const quote = (cell: string) => `"${cell.replaceAll('"', '""')}"`;
  return [header, ...rows].map((cells) => cells.map(quote).join(",")).join("\n") + "\n";
}

/** The conservation rules of spec section 9a, applied to every successful result in this file. */
function assertConserved(rows: ParsedRow[], result: MapRowsSuccess): void {
  expect(result.counts.total).toBe(rows.length);
  expect(result.counts.importable).toBe(result.candidates.length);
  expect(result.counts.rejected).toBe(result.rejected.length);
  expect(result.counts.total).toBe(result.counts.importable + result.counts.rejected);
  const byReason = Object.values(result.rejectedByReason).reduce((sum, n) => sum + (n ?? 0), 0);
  expect(byReason).toBe(result.counts.rejected);
  const accounted = [...result.candidates.map((c) => c.line), ...result.rejected.map((r) => r.line)];
  expect(accounted.sort((a, b) => a - b)).toEqual(rows.map((r) => r.line));
  const expectedOutcome =
    result.counts.rejected === 0 ? "all_importable" : result.counts.importable === 0 ? "none_importable" : "partial";
  expect(result.outcome).toBe(expectedOutcome);
}

function run(header: string[], rows: string[][], mappingInput: unknown, now: Date = NOW) {
  const parsed = parseSensorCsv(csv(header, rows));
  if (!parsed.ok) throw new Error(`fixture did not parse: ${parsed.code}`);
  const checked = validateMapping(mappingInput, parsed.header);
  if (!checked.ok) throw new Error(`fixture mapping refused: ${JSON.stringify(checked.issues)}`);
  const result = mapRows(parsed, checked.mapping, { now });
  if (result.ok) assertConserved(parsed.rows, result);
  return result;
}

function ok(header: string[], rows: string[][], mappingInput: unknown, now: Date = NOW): MapRowsSuccess {
  const result = run(header, rows, mappingInput, now);
  if (!result.ok) throw new Error(`expected rows to map, got ${result.code}`);
  return result;
}

const M_HEADER = ["Time", "Room", "Material", "MC", "Sensor"];

function moistureMapping(overrides: Record<string, unknown> = {}) {
  return {
    kind: "moisture",
    timestamp: { column: "Time", format: "yyyy-MM-dd HH:mm[:ss]", timeZone: SYDNEY },
    device: { vendor: "UbiBot", model: "WS1", idColumn: "Sensor" },
    location: { column: "Room" },
    moisture: { valueColumn: "MC", unit: "PERCENT_MC", surfaceType: { column: "Material" } },
    ...overrides,
  };
}

const A_HEADER = ["Time", "Temp", "RH", "Dew"];

function ambientMapping(temperatureUnit: "C" | "F" = "C") {
  return {
    kind: "ambient",
    timestamp: { column: "Time", format: "yyyy-MM-dd HH:mm[:ss]", timeZone: SYDNEY },
    device: { vendor: "UbiBot" },
    location: { value: "Lounge" },
    ambient: { temperatureColumn: "Temp", temperatureUnit, humidityColumn: "RH", dewPointColumn: "Dew" },
  };
}

const mRow = (time: string, overrides: Partial<Record<"room" | "material" | "mc" | "sensor", string>> = {}) => [
  time,
  overrides.room ?? "Kitchen",
  overrides.material ?? "Plasterboard",
  overrides.mc ?? "15.5",
  overrides.sensor ?? "S-1",
];

/** Maps one timestamp cell and returns either the instant or the refusal reason. */
function timeOf(value: string, format: string, timeZone?: string, now: Date = NOW): string {
  const timestamp = timeZone ? { column: "Time", format, timeZone } : { column: "Time", format };
  const result = ok(M_HEADER, [mRow(value)], moistureMapping({ timestamp }), now);
  if (result.candidates.length === 1) return result.candidates[0].recordedAt;
  expect(result.rejected[0].column).toBe(0);
  return result.rejected[0].reason;
}

const PROCESS_ZONES: Array<[string, number]> = [
  ["UTC", 0],
  ["America/New_York", 300],
  ["Australia/Sydney", -660],
];

describe.each(PROCESS_ZONES)("AC-4 time, with the process zone set to %s", (processZone, januaryOffset) => {
  const before = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = processZone;
  });
  afterAll(() => {
    if (before === undefined) delete process.env.TZ;
    else process.env.TZ = before;
  });

  it("is really running in that process zone", () => {
    expect(new Date(2026, 0, 15, 12).getTimezoneOffset()).toBe(januaryOffset);
  });

  it("resolves each local format in the declared zone", () => {
    expect(timeOf("2026-01-15 09:30", "yyyy-MM-dd HH:mm[:ss]", SYDNEY)).toBe("2026-01-14T22:30:00.000Z");
    expect(timeOf("2026-07-01 09:30:15", "yyyy-MM-dd HH:mm[:ss]", SYDNEY)).toBe("2026-06-30T23:30:15.000Z");
    expect(timeOf("15/01/2026 09:30", "dd/MM/yyyy HH:mm[:ss]", SYDNEY)).toBe("2026-01-14T22:30:00.000Z");
    expect(timeOf("01/15/2026 09:30:59", "MM/dd/yyyy HH:mm[:ss]", SYDNEY)).toBe("2026-01-14T22:30:59.000Z");
    expect(timeOf("2026-01-15 09:30", "yyyy-MM-dd HH:mm[:ss]", "America/New_York")).toBe(
      "2026-01-15T14:30:00.000Z",
    );
    expect(timeOf("2026-01-15 09:30", "yyyy-MM-dd HH:mm[:ss]", "UTC")).toBe("2026-01-15T09:30:00.000Z");
  });

  it("reads 03/04/2026 differently under day-first and month-first", () => {
    expect(timeOf("03/04/2026 08:00", "dd/MM/yyyy HH:mm[:ss]", SYDNEY)).toBe("2026-04-02T21:00:00.000Z");
    expect(timeOf("03/04/2026 08:00", "MM/dd/yyyy HH:mm[:ss]", SYDNEY)).toBe("2026-03-03T21:00:00.000Z");
  });

  it("refuses a local time that daylight saving skips, and keeps the times either side", () => {
    // Sydney clocks go forward at 02:00 on 4 October 2026.
    expect(timeOf("2026-10-04 01:30", "yyyy-MM-dd HH:mm[:ss]", SYDNEY)).toBe("2026-10-03T15:30:00.000Z");
    expect(timeOf("2026-10-04 02:30", "yyyy-MM-dd HH:mm[:ss]", SYDNEY)).toBe(
      "timestamp_ambiguous_or_missing_local_time",
    );
    expect(timeOf("2026-10-04 03:30", "yyyy-MM-dd HH:mm[:ss]", SYDNEY)).toBe("2026-10-03T16:30:00.000Z");
  });

  it("refuses a local time that daylight saving repeats, and keeps the times either side", () => {
    // Sydney clocks go back at 03:00 on 5 April 2026, so 02:00 to 02:59 happens twice.
    expect(timeOf("2026-04-05 01:30", "yyyy-MM-dd HH:mm[:ss]", SYDNEY)).toBe("2026-04-04T14:30:00.000Z");
    expect(timeOf("2026-04-05 02:30", "yyyy-MM-dd HH:mm[:ss]", SYDNEY)).toBe(
      "timestamp_ambiguous_or_missing_local_time",
    );
    expect(timeOf("2026-04-05 03:30", "yyyy-MM-dd HH:mm[:ss]", SYDNEY)).toBe("2026-04-04T17:30:00.000Z");
  });

  it("does not confuse epoch seconds with epoch milliseconds", () => {
    expect(timeOf("1768469400", "epoch_s")).toBe("2026-01-15T09:30:00.000Z");
    expect(timeOf("1768469400000", "epoch_ms")).toBe("2026-01-15T09:30:00.000Z");
    expect(timeOf("1768469400000", "epoch_s")).toBe("timestamp_unparseable");
    expect(timeOf("1768469400", "epoch_ms")).toBe("timestamp_too_old");
    expect(timeOf("1768469400.5", "epoch_s")).toBe("timestamp_unparseable");
    expect(timeOf("-1768469400", "epoch_s")).toBe("timestamp_unparseable");
  });

  it("accepts exactly the listed ISO shapes", () => {
    expect(timeOf("2026-01-15T09:30:00Z", "iso")).toBe("2026-01-15T09:30:00.000Z");
    expect(timeOf("2026-01-15T09:30Z", "iso")).toBe("2026-01-15T09:30:00.000Z");
    expect(timeOf("2026-01-15T09:30:00+10:00", "iso")).toBe("2026-01-14T23:30:00.000Z");
    expect(timeOf("2026-01-15T09:30-05:00", "iso")).toBe("2026-01-15T14:30:00.000Z");
    expect(timeOf("2026-01-15T09:30:00.5Z", "iso")).toBe("2026-01-15T09:30:00.500Z");
    expect(timeOf("2026-01-15T09:30:00.123456789Z", "iso")).toBe("2026-01-15T09:30:00.123Z");
    expect(timeOf("2026-01-15T09:30", "iso", SYDNEY)).toBe("2026-01-14T22:30:00.000Z");
    expect(timeOf("2026-01-15T09:30:00.250", "iso", SYDNEY)).toBe("2026-01-14T22:30:00.250Z");
    // An offset in the value wins over the declared zone.
    expect(timeOf("2026-01-15T09:30:00Z", "iso", SYDNEY)).toBe("2026-01-15T09:30:00.000Z");
  });

  it("refuses the ISO shapes the spec excludes", () => {
    for (const value of [
      "2026-01-15 09:30:00Z",
      "2026-01-15",
      "2026-01-15T09:30:00+1000",
      "2026-01-15t09:30:00Z",
      "2026-01-15T09:30:00z",
      "2026-01-15T09:30:00.Z",
      "2026-01-15T09:30:00.1234567890Z",
      "2026-13-15T09:30:00Z",
      "2026-02-30T09:30:00Z",
      "2026-01-15T24:00:00Z",
      "2026-01-15T09:30:00+15:00",
    ]) {
      expect(timeOf(value, "iso")).toBe("timestamp_unparseable");
    }
    // No offset in the value and no zone in the mapping: the instant cannot be known.
    expect(timeOf("2026-01-15T09:30", "iso")).toBe("timestamp_unparseable");
  });

  it("refuses values that do not match the declared local format", () => {
    for (const value of ["2026-1-15 09:30", "2026-01-15T09:30", "2026-01-15 9:30", "15/01/2026 09:30", ""]) {
      expect(timeOf(value, "yyyy-MM-dd HH:mm[:ss]", SYDNEY)).toBe("timestamp_unparseable");
    }
    expect(timeOf("31/02/2026 09:30", "dd/MM/yyyy HH:mm[:ss]", SYDNEY)).toBe("timestamp_unparseable");
    expect(timeOf("31/31/2026 09:30", "dd/MM/yyyy HH:mm[:ss]", SYDNEY)).toBe("timestamp_unparseable");
  });

  it("refuses the whole file when the day and month order is declared the wrong way round", () => {
    const wrongOrder = { column: "Time", format: "MM/dd/yyyy HH:mm[:ss]", timeZone: SYDNEY };
    const result = run(
      M_HEADER,
      [mRow("05/11/2026 08:00"), mRow("20/11/2026 08:00")],
      moistureMapping({ timestamp: wrongOrder }),
    );
    expect(result).toEqual({ ok: false, code: "date_order_conflict", line: 3 });

    const otherWay = { column: "Time", format: "dd/MM/yyyy HH:mm[:ss]", timeZone: SYDNEY };
    expect(
      run(M_HEADER, [mRow("11/20/2026 08:00")], moistureMapping({ timestamp: otherWay })),
    ).toEqual({ ok: false, code: "date_order_conflict", line: 2 });
  });

  it("judges future and too-old rows against the injected clock only", () => {
    const now = new Date("2001-01-01T00:00:00.000Z");
    expect(timeOf("2005-06-01 10:00", "yyyy-MM-dd HH:mm[:ss]", "UTC", now)).toBe("timestamp_in_future");
    expect(timeOf("1999-06-01 10:00", "yyyy-MM-dd HH:mm[:ss]", "UTC", now)).toBe("timestamp_too_old");
    expect(timeOf("2000-06-01 10:00", "yyyy-MM-dd HH:mm[:ss]", "UTC", now)).toBe("2000-06-01T10:00:00.000Z");
    // Five minutes of clock difference is allowed; one second more is not.
    expect(timeOf("2001-01-01 00:05:00", "yyyy-MM-dd HH:mm[:ss]", "UTC", now)).toBe("2001-01-01T00:05:00.000Z");
    expect(timeOf("2001-01-01 00:05:01", "yyyy-MM-dd HH:mm[:ss]", "UTC", now)).toBe("timestamp_in_future");
    expect(timeOf("1999-12-31 23:59:59", "yyyy-MM-dd HH:mm[:ss]", "UTC", now)).toBe("timestamp_too_old");
  });
});

describe("AC-5 numbers and units", () => {
  const aRow = (temp: string, rh = "45", dew = "") => ["2026-01-15 09:30", temp, rh, dew];

  it("converts a Fahrenheit file to Celsius and records the file unit", () => {
    const result = ok(A_HEADER, [aRow("68", "45", "50"), ["2026-01-15 09:31", "77.9", "40.25", ""]], ambientMapping("F"));
    expect(result.candidates).toEqual([
      {
        kind: "ambient",
        line: 2,
        recordedAt: "2026-01-14T22:30:00.000Z",
        location: "Lounge",
        ambientTemperatureC: 20,
        humidityLevel: 45,
        dewPointC: 10,
        temperatureUnitInFile: "F",
        deviceVendor: "UbiBot",
        deviceVendorKey: "ubibot",
        deviceModel: null,
      },
      {
        kind: "ambient",
        line: 3,
        recordedAt: "2026-01-14T22:31:00.000Z",
        location: "Lounge",
        ambientTemperatureC: 25.5,
        humidityLevel: 40.25,
        temperatureUnitInFile: "F",
        deviceVendor: "UbiBot",
        deviceVendorKey: "ubibot",
        deviceModel: null,
      },
    ]);
  });

  it("leaves a Celsius file unconverted", () => {
    const result = ok(A_HEADER, [aRow("21.4", "55", "12")], ambientMapping("C"));
    expect(result.candidates[0]).toMatchObject({
      ambientTemperatureC: 21.4,
      dewPointC: 12,
      temperatureUnitInFile: "C",
    });
  });

  it.each(["1e3", "0x10", "12abc", "12,5", "1,234", "1234567", "1.1234567", "+5", ".5", "5."])(
    "refuses %s as a number and names the cell",
    (value) => {
      const result = ok(A_HEADER, [aRow(value)], ambientMapping("C"));
      expect(result.rejected).toEqual([{ line: 2, reason: "value_not_a_number", column: 1 }]);
    },
  );

  it("refuses out-of-range values and names the cell", () => {
    const reject = (row: string[], unit: "C" | "F" = "C") => ok(A_HEADER, [row], ambientMapping(unit)).rejected;
    expect(reject(aRow("56"))).toEqual([{ line: 2, reason: "value_out_of_range", column: 1 }]);
    expect(reject(aRow("-21"))).toEqual([{ line: 2, reason: "value_out_of_range", column: 1 }]);
    expect(reject(aRow("140"), "F")).toEqual([{ line: 2, reason: "value_out_of_range", column: 1 }]);
    expect(reject(aRow("21", "101"))).toEqual([{ line: 2, reason: "value_out_of_range", column: 2 }]);
    expect(reject(aRow("21", "-1"))).toEqual([{ line: 2, reason: "value_out_of_range", column: 2 }]);
    expect(reject(aRow("21", "45", "90"))).toEqual([{ line: 2, reason: "value_out_of_range", column: 3 }]);
    expect(reject(aRow("55", "100"))).toEqual([]);
    expect(reject(aRow("-20", "0"))).toEqual([]);
  });

  it("treats a blank required cell as missing, never as zero", () => {
    expect(ok(A_HEADER, [aRow("")], ambientMapping("C")).rejected).toEqual([
      { line: 2, reason: "value_missing", column: 1 },
    ]);
    expect(ok(A_HEADER, [aRow("  ")], ambientMapping("C")).rejected).toEqual([
      { line: 2, reason: "value_missing", column: 1 },
    ]);
    expect(ok(A_HEADER, [aRow("21", "")], ambientMapping("C")).rejected).toEqual([
      { line: 2, reason: "value_missing", column: 2 },
    ]);
    expect(ok(M_HEADER, [mRow("2026-01-15 09:30", { mc: "" })], moistureMapping()).rejected).toEqual([
      { line: 2, reason: "value_missing", column: 3 },
    ]);
    expect(ok(M_HEADER, [mRow("2026-01-15 09:30", { material: " " })], moistureMapping()).rejected).toEqual([
      { line: 2, reason: "value_missing", column: 2 },
    ]);
  });

  it("keeps an optional dew point blank instead of inventing a value", () => {
    const result = ok(A_HEADER, [aRow("21", "45", "")], ambientMapping("C"));
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).not.toHaveProperty("dewPointC");
  });

  it("never converts between moisture units", () => {
    const wme = moistureMapping({
      moisture: { valueColumn: "MC", unit: "WME", surfaceType: { column: "Material" }, depth: "Subsurface" },
    });
    expect(ok(M_HEADER, [mRow("2026-01-15 09:30", { mc: "17.5" })], wme).candidates).toEqual([
      {
        kind: "moisture",
        line: 2,
        recordedAt: "2026-01-14T22:30:00.000Z",
        location: "Kitchen",
        surfaceType: "Plasterboard",
        depth: "Subsurface",
        moistureLevel: 17.5,
        unit: "WME",
        deviceVendor: "UbiBot",
        deviceVendorKey: "ubibot",
        deviceModel: "WS1",
        deviceId: "S-1",
      },
    ]);
    const percent = ok(M_HEADER, [mRow("2026-01-15 09:30", { mc: "17.5" })], moistureMapping()).candidates[0];
    expect(percent).toMatchObject({ moistureLevel: 17.5, unit: "PERCENT_MC", depth: "Surface" });
  });

  it("refuses moisture outside 0 to 100", () => {
    for (const mc of ["100.5", "-0.1"]) {
      expect(ok(M_HEADER, [mRow("2026-01-15 09:30", { mc })], moistureMapping()).rejected).toEqual([
        { line: 2, reason: "value_out_of_range", column: 3 },
      ]);
    }
    expect(ok(M_HEADER, [mRow("2026-01-15 09:30", { mc: "100" })], moistureMapping()).rejected).toEqual([]);
  });
});

// RA-8474: the last four hide the formula prefix behind invisible format
// characters (zero-width space, byte-order mark, joiners, soft hyphen).
const UNSAFE_RA_8474 = ['=HYPERLINK("x")', "@x", "\tTabbed", "\rReturned", "-1+cmd|x", "-2*3", "<b>=x", "<b> =x", "<i></i>@x", "\u200B=cmd", "\uFEFF@x", "\u200D\u2060+SUM(A1)", "\u00AD\t=x"];

// RA-8520: a formula hidden behind a leading run that mixes invisible,
// default-ignorable, white-space and control characters. Written as escapes so
// the source file itself carries no invisible characters.
const INVISIBLE_LEADING_UNSAFE = [
  "\u200B=cmd", // zero-width space
  "\u200C\u200D@x", // zero-width non-joiner and joiner
  "\uFEFF=cmd", // byte-order mark
  "\u2060=cmd", // word joiner
  "\u00AD+SUM(A1)", // soft hyphen
  "\u200E-cmd", // left-to-right mark
  "\u202E=cmd", // right-to-left override
  "\u200B\tTabbed", // invisible, then a tab
  "\u200B\rReturned", // invisible, then a carriage return
  "\uFEFF\u200B =x", // invisible, then a space
  "\u200B =x", // invisible, then a space (gap 1)
  "\u200B\u00A0=x", // invisible, then a no-break space
  "\u200B\n=x", // invisible, then a line feed
  "<b>\u200B=x", // markup, then invisible
  " \u200B =x", // space, invisible, space
  "\u3164=cmd", // Hangul filler (default-ignorable, not a format character; gap 2)
  "\uFFA0=cmd", // half-width Hangul filler
  "\uFE0F=cmd", // variation selector
  "\uFFF9=cmd", // interlinear annotation anchor (format character, not default-ignorable)
  "\u0001=cmd", // a control character other than tab or carriage return (gap 3)
  "\u007F=cmd", // delete (gap 3)
  "\u200B\u007F=cmd", // invisible, then delete
  "\u0085=cmd", // next line (a C1 control and white space)
];

const UNSAFE = [...UNSAFE_RA_8474, ...INVISIBLE_LEADING_UNSAFE];

describe("AC-6 text guard", () => {
  const T = "2026-01-15 09:30";

  it.each(UNSAFE)("refuses %j in a location, surface type or device id cell", (value) => {
    expect(ok(M_HEADER, [mRow(T, { room: value })], moistureMapping()).rejected).toEqual([
      { line: 2, reason: "text_unsafe", column: 1 },
    ]);
    expect(ok(M_HEADER, [mRow(T, { material: value })], moistureMapping()).rejected).toEqual([
      { line: 2, reason: "text_unsafe", column: 2 },
    ]);
    expect(ok(M_HEADER, [mRow(T, { sensor: value })], moistureMapping()).rejected).toEqual([
      { line: 2, reason: "text_unsafe", column: 4 },
    ]);
  });

  it.each(UNSAFE)("refuses %j as a mapping constant", (value) => {
    const base = moistureMapping();
    const variants = [
      moistureMapping({ location: { value } }),
      moistureMapping({ moisture: { ...base.moisture, surfaceType: { value } } }),
      moistureMapping({ device: { vendor: value } }),
      moistureMapping({ device: { vendor: "UbiBot", model: value } }),
    ];
    for (const mapping of variants) {
      const result = ok(M_HEADER, [mRow(T), mRow("2026-01-15 09:31")], mapping);
      expect(result.rejected).toEqual([
        { line: 2, reason: "text_unsafe" },
        { line: 3, reason: "text_unsafe" },
      ]);
      expect(result.outcome).toBe("none_importable");
    }
  });

  it("accepts ordinary values that start with a sign", () => {
    const result = ok(M_HEADER, [mRow(T, { room: "-1 Basement" }), mRow(T, { room: "+ Ensuite" })], moistureMapping());
    expect(result.candidates.map((c) => c.location)).toEqual(["-1 Basement", "+ Ensuite"]);
  });

  it("refuses a sign with nothing after it or followed by a letter", () => {
    for (const room of ["-", "+", "-cmd", "+SUM(A1)"]) {
      expect(ok(M_HEADER, [mRow(T, { room })], moistureMapping()).rejected).toEqual([
        { line: 2, reason: "text_unsafe", column: 1 },
      ]);
    }
  });

  it("keeps an ordinary value that starts with an invisible character exactly as written (RA-8520: refuse, never strip)", () => {
    const rooms = ["​Kitchen", "​ Kitchen", "ㅤ Lounge", "​-1 Basement", "​+ Ensuite"];
    const result = ok(M_HEADER, rooms.map((room) => mRow(T, { room })), moistureMapping());
    expect(result.rejected).toEqual([]);
    expect(result.candidates.map((c) => c.location)).toEqual(rooms);
  });

  it("refuses a leading control character other than a line feed, even before ordinary text (RA-8520)", () => {
    for (const room of ["\u0001Kitchen", "\u000BKitchen", "\u000CKitchen", "​\u0002Kitchen"]) {
      expect(ok(M_HEADER, [mRow(T, { room })], moistureMapping()).rejected).toEqual([
        { line: 2, reason: "text_unsafe", column: 1 },
      ]);
    }
  });

  it("accepts a leading line feed before ordinary text, as before (RA-8520)", () => {
    const result = ok(M_HEADER, [mRow(T, { room: "\nKitchen" })], moistureMapping());
    expect(result.candidates.map((c) => c.location)).toEqual(["Kitchen"]);
  });

  it("reports a location that is empty once sanitised", () => {
    for (const room of ["<x>", "", "   ", "<br/>"]) {
      expect(ok(M_HEADER, [mRow(T, { room })], moistureMapping()).rejected).toEqual([
        { line: 2, reason: "location_empty", column: 1 },
      ]);
    }
  });

  it("refuses text longer than its limit and never cuts it", () => {
    const at = ok(M_HEADER, [mRow(T, { room: "r".repeat(200), material: "m".repeat(100) })], moistureMapping());
    expect(at.candidates[0].location).toHaveLength(200);
    expect(ok(M_HEADER, [mRow(T, { room: "r".repeat(201) })], moistureMapping()).rejected).toEqual([
      { line: 2, reason: "text_too_long", column: 1 },
    ]);
    expect(ok(M_HEADER, [mRow(T, { material: "m".repeat(101) })], moistureMapping()).rejected).toEqual([
      { line: 2, reason: "text_too_long", column: 2 },
    ]);
    // The limit applies to the stored, sanitised form: 199 letters and an ampersand become 204 characters.
    expect(ok(M_HEADER, [mRow(T, { room: "r".repeat(199) + "&" })], moistureMapping()).rejected).toEqual([
      { line: 2, reason: "text_too_long", column: 1 },
    ]);
  });

  it("hands back text that is already sanitised", () => {
    const result = ok(M_HEADER, [mRow(T, { room: "  Kitchen & <b>Dining</b>  " })], moistureMapping());
    expect(result.candidates[0].location).toBe("Kitchen &amp; Dining");
  });

  it("leaves the device id off when its cell is blank", () => {
    const result = ok(M_HEADER, [mRow(T, { sensor: " " })], moistureMapping());
    expect(result.candidates[0]).not.toHaveProperty("deviceId");
  });
});

describe("AC-8 keys, outcome and conservation", () => {
  const T = "2026-01-15 09:30";

  it("refuses a repeated reading and keeps the first", () => {
    const result = ok(M_HEADER, [mRow(T, { mc: "15" }), mRow(T, { mc: "99" }), mRow(T, { room: "kitchen " })], moistureMapping());
    expect(result.candidates.map((c) => [c.line, c.kind === "moisture" ? c.moistureLevel : null])).toEqual([
      [2, 15],
    ]);
    expect(result.rejected).toEqual([
      { line: 3, reason: "duplicate_in_file" },
      { line: 4, reason: "duplicate_in_file" },
    ]);
    expect(result.rejectedByReason).toEqual({ duplicate_in_file: 2 });
  });

  it("keeps two sensors that read the same place at the same time", () => {
    const result = ok(M_HEADER, [mRow(T, { sensor: "S-1" }), mRow(T, { sensor: "S-2" })], moistureMapping());
    expect(result.candidates.map((c) => c.deviceId)).toEqual(["S-1", "S-2"]);
    expect(result.outcome).toBe("all_importable");
  });

  it("keeps readings that differ only by surface type or time", () => {
    const result = ok(
      M_HEADER,
      [mRow(T), mRow(T, { material: "Timber" }), mRow("2026-01-15 09:30:01")],
      moistureMapping(),
    );
    expect(result.counts).toEqual({ total: 3, importable: 3, rejected: 0 });
  });

  it("ignores surface type in the ambient key", () => {
    const result = ok(
      A_HEADER,
      [
        [T, "21", "45", ""],
        [T, "22", "46", ""],
      ],
      ambientMapping("C"),
    );
    expect(result.rejected).toEqual([{ line: 3, reason: "duplicate_in_file" }]);
  });

  it("gives the same vendor key however the vendor is typed", () => {
    const typed = ok(M_HEADER, [mRow(T)], moistureMapping({ device: { vendor: "UbiBot " } })).candidates[0];
    const lower = ok(M_HEADER, [mRow(T)], moistureMapping({ device: { vendor: "ubibot" } })).candidates[0];
    expect(typed.deviceVendorKey).toBe("ubibot");
    expect(lower.deviceVendorKey).toBe("ubibot");
    expect(typed.deviceVendor).toBe("UbiBot");
  });

  it("reports the outcome as all, partial or none", () => {
    expect(ok(M_HEADER, [mRow(T), mRow("2026-01-15 09:31")], moistureMapping()).outcome).toBe("all_importable");
    const partial = ok(M_HEADER, [mRow(T), mRow("2026-01-15 09:31", { mc: "abc" })], moistureMapping());
    expect(partial.outcome).toBe("partial");
    expect(partial.counts).toEqual({ total: 2, importable: 1, rejected: 1 });
    const none = ok(M_HEADER, [mRow(T, { mc: "abc" }), mRow("not a time")], moistureMapping());
    expect(none.outcome).toBe("none_importable");
    expect(none.candidates).toEqual([]);
    expect(none.rejectedByReason).toEqual({ value_not_a_number: 1, timestamp_unparseable: 1 });
  });

  it("accounts for every row once when rows are refused for different reasons", () => {
    const result = ok(
      M_HEADER,
      [
        mRow(T),
        mRow(T, { room: "<x>" }),
        mRow(T, { room: "=1+1" }),
        mRow(T, { mc: "" }),
        mRow("2030-01-01 00:00"),
        mRow(T),
        mRow("2026-01-15 09:32"),
      ],
      moistureMapping(),
    );
    expect(result.counts).toEqual({ total: 7, importable: 2, rejected: 5 });
    expect(result.rejectedByReason).toEqual({
      location_empty: 1,
      text_unsafe: 1,
      value_missing: 1,
      timestamp_in_future: 1,
      duplicate_in_file: 1,
    });
  });

  it("refuses to run with a mapping that validateMapping did not return, or one made for another header", () => {
    const parsed = parseSensorCsv(csv(M_HEADER, [mRow(T)]));
    if (!parsed.ok) throw new Error("setup failed");
    const checked = validateMapping(moistureMapping(), parsed.header);
    if (!checked.ok) throw new Error("setup failed");
    expect(() => mapRows(parsed, { ...checked.mapping }, { now: NOW })).toThrow(/validateMapping/);

    const other = parseSensorCsv(csv(["Room", "Time", "Material", "MC", "Sensor"], [["Kitchen", T, "x", "1", "s"]]));
    if (!other.ok) throw new Error("setup failed");
    expect(() => mapRows(other, checked.mapping, { now: NOW })).toThrow(/different header/);
    expect(() => mapRows(parsed, checked.mapping, { now: new Date(Number.NaN) })).toThrow(/valid `now`/);
  });
});

describe("AC-9 budget (reader and mapper)", () => {
  it("reads and maps 5,000 rows of 40 columns in under 2,000 ms", () => {
    const header = ["Time", "Room", "Material", "MC", "Sensor", ...Array.from({ length: 35 }, (_, i) => `x${i}`)];
    const filler = Array.from({ length: 35 }, () => "1").join(",");
    const lines = [header.join(",")];
    const start = Date.UTC(2026, 0, 1, 0, 0);
    for (let i = 0; i < 5000; i++) {
      const stamp = new Date(start + i * 60_000).toISOString().slice(0, 16).replace("T", " ");
      lines.push(`${stamp},Room ${i % 12},Plasterboard,15.5,S-${i % 7},${filler}`);
    }
    const text = lines.join("\n") + "\n";
    expect(new TextEncoder().encode(text).length).toBeLessThan(1_000_000);

    const started = performance.now();
    const parsed = parseSensorCsv(text);
    if (!parsed.ok) throw new Error(`fixture did not parse: ${parsed.code}`);
    const checked = validateMapping(moistureMapping(), parsed.header);
    if (!checked.ok) throw new Error("fixture mapping refused");
    const result = mapRows(parsed, checked.mapping, { now: NOW });
    const elapsed = performance.now() - started;

    if (!result.ok) throw new Error(`expected rows to map, got ${result.code}`);
    assertConserved(parsed.rows, result);
    expect(result.counts).toEqual({ total: 5000, importable: 5000, rejected: 0 });
    expect(elapsed).toBeLessThan(2000);
  });
});
