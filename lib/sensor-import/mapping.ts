/**
 * RA-8413 Stage 1: checks a column mapping against a file's header.
 *
 * A mapping says which column holds the time, the place and the reading, and
 * in which units. Nothing is guessed from the file. Pure: no file, database or
 * network access.
 *
 * Refusals carry a path and a code only. They never repeat a value from the
 * file or from the mapping, so a refusal is safe to log.
 */
import { z } from "zod";

export const TIMESTAMP_FORMATS = [
  "iso",
  "epoch_s",
  "epoch_ms",
  "yyyy-MM-dd HH:mm[:ss]",
  "dd/MM/yyyy HH:mm[:ss]",
  "MM/dd/yyyy HH:mm[:ss]",
] as const;
export type TimestampFormat = (typeof TIMESTAMP_FORMATS)[number];

/** Formats whose values carry no zone of their own, so the mapping must name one. */
const FORMATS_NEEDING_ZONE: ReadonlySet<TimestampFormat> = new Set([
  "yyyy-MM-dd HH:mm[:ss]",
  "dd/MM/yyyy HH:mm[:ss]",
  "MM/dd/yyyy HH:mm[:ss]",
]);

export const MOISTURE_UNITS = ["PERCENT_MC", "WME"] as const;
export type MoistureUnit = (typeof MOISTURE_UNITS)[number];
export type MoistureDepth = "Surface" | "Subsurface";
export type TemperatureUnit = "C" | "F";

const columnName = z.string().min(1).max(200);
const textSource = z.union([
  z.strictObject({ column: columnName }),
  z.strictObject({ value: z.string().min(1).max(200) }),
]);

const mappingSchema = z.strictObject({
  kind: z.enum(["moisture", "ambient"]),
  timestamp: z.strictObject({
    column: columnName,
    format: z.enum(TIMESTAMP_FORMATS),
    timeZone: z.string().min(1).max(100).optional(),
  }),
  device: z.strictObject({
    vendor: z
      .string()
      .max(100)
      .refine((value) => value.trim().length > 0),
    model: z.string().max(100).optional(),
    idColumn: columnName.optional(),
  }),
  location: textSource,
  moisture: z
    .strictObject({
      valueColumn: columnName,
      unit: z.enum(MOISTURE_UNITS),
      surfaceType: textSource,
      depth: z.enum(["Surface", "Subsurface"]).optional(),
    })
    .optional(),
  ambient: z
    .strictObject({
      temperatureColumn: columnName,
      temperatureUnit: z.enum(["C", "F"]),
      humidityColumn: columnName,
      dewPointColumn: columnName.optional(),
    })
    .optional(),
});

export type MappingIssueCode =
  | "invalid"
  | "unknown_key"
  | "kind_block_missing"
  | "kind_block_unexpected"
  | "time_zone_required"
  | "time_zone_unknown"
  | "column_not_found";

export type MappingIssue = {
  /** Dotted path into the mapping, for example "moisture.valueColumn". Empty for the mapping itself. */
  path: string;
  code: MappingIssueCode;
};

/** Where a piece of text comes from: a column of the file, or one value for every row. */
export type TextSource = { readonly index: number } | { readonly value: string };

declare const validatedBrand: unique symbol;

/**
 * A mapping that validateMapping has checked against one header. Only
 * validateMapping can make one, so code that takes this type cannot be handed
 * an unchecked mapping.
 */
export type ValidatedMapping = {
  readonly [validatedBrand]: true;
  /** The header the columns were resolved against. */
  readonly header: readonly string[];
  readonly kind: "moisture" | "ambient";
  readonly timestamp: {
    readonly index: number;
    readonly format: TimestampFormat;
    readonly timeZone?: string;
  };
  readonly device: {
    /** As typed. The row mapper sanitises it and derives the comparison key. */
    readonly vendor: string;
    readonly model?: string;
    readonly idIndex?: number;
  };
  readonly location: TextSource;
  readonly moisture?: {
    readonly valueIndex: number;
    readonly unit: MoistureUnit;
    readonly surfaceType: TextSource;
    readonly depth: MoistureDepth;
  };
  readonly ambient?: {
    readonly temperatureIndex: number;
    readonly temperatureUnit: TemperatureUnit;
    readonly humidityIndex: number;
    readonly dewPointIndex?: number;
  };
};

export type MappingResult =
  | { ok: true; mapping: ValidatedMapping }
  | { ok: false; issues: MappingIssue[] };

const issued = new WeakSet<object>();

/** True only for the exact object validateMapping returned. A copy does not count. */
export function isValidatedMapping(value: unknown): value is ValidatedMapping {
  return typeof value === "object" && value !== null && issued.has(value);
}

const ZONE_NAME = /^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)*$/;

function isKnownTimeZone(timeZone: string): boolean {
  if (!ZONE_NAME.test(timeZone)) return false;
  try {
    new Intl.DateTimeFormat("en-AU", { timeZone });
    return true;
  } catch {
    return false;
  }
}

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const inner of Object.values(value)) deepFreeze(inner);
  }
  return value;
}

export function validateMapping(input: unknown, header: readonly string[]): MappingResult {
  const parsed = mappingSchema.safeParse(input);
  if (!parsed.success) {
    const issues: MappingIssue[] = [];
    const seen = new Set<string>();
    for (const issue of parsed.error.issues) {
      const path = issue.path.map(String).join(".");
      const code: MappingIssueCode = issue.code === "unrecognized_keys" ? "unknown_key" : "invalid";
      const key = `${path}\u0000${code}`;
      if (!seen.has(key)) {
        seen.add(key);
        issues.push({ path, code });
      }
    }
    return { ok: false, issues };
  }

  const data = parsed.data;
  const issues: MappingIssue[] = [];

  const wanted = data.kind;
  const other = wanted === "moisture" ? "ambient" : "moisture";
  if (data[wanted] === undefined) issues.push({ path: wanted, code: "kind_block_missing" });
  if (data[other] !== undefined) issues.push({ path: other, code: "kind_block_unexpected" });

  const { format, timeZone } = data.timestamp;
  if (timeZone === undefined) {
    if (FORMATS_NEEDING_ZONE.has(format)) issues.push({ path: "timestamp.timeZone", code: "time_zone_required" });
  } else if (!isKnownTimeZone(timeZone)) {
    issues.push({ path: "timestamp.timeZone", code: "time_zone_unknown" });
  }

  const indexOf = (name: string, path: string): number => {
    const index = header.indexOf(name);
    if (index === -1) issues.push({ path, code: "column_not_found" });
    return index;
  };
  const source = (from: { column: string } | { value: string }, path: string): TextSource =>
    "column" in from ? { index: indexOf(from.column, `${path}.column`) } : { value: from.value };

  const timestampIndex = indexOf(data.timestamp.column, "timestamp.column");
  const idIndex =
    data.device.idColumn === undefined ? undefined : indexOf(data.device.idColumn, "device.idColumn");
  const location = source(data.location, "location");

  const moisture =
    wanted === "moisture" && data.moisture !== undefined
      ? {
          valueIndex: indexOf(data.moisture.valueColumn, "moisture.valueColumn"),
          unit: data.moisture.unit,
          surfaceType: source(data.moisture.surfaceType, "moisture.surfaceType"),
          depth: data.moisture.depth ?? ("Surface" as const),
        }
      : undefined;
  const ambient =
    wanted === "ambient" && data.ambient !== undefined
      ? {
          temperatureIndex: indexOf(data.ambient.temperatureColumn, "ambient.temperatureColumn"),
          temperatureUnit: data.ambient.temperatureUnit,
          humidityIndex: indexOf(data.ambient.humidityColumn, "ambient.humidityColumn"),
          ...(data.ambient.dewPointColumn === undefined
            ? {}
            : { dewPointIndex: indexOf(data.ambient.dewPointColumn, "ambient.dewPointColumn") }),
        }
      : undefined;

  if (issues.length > 0) return { ok: false, issues };

  const mapping = {
    header: [...header],
    kind: wanted,
    timestamp: {
      index: timestampIndex,
      format,
      ...(timeZone === undefined ? {} : { timeZone }),
    },
    device: {
      vendor: data.device.vendor,
      ...(data.device.model === undefined ? {} : { model: data.device.model }),
      ...(idIndex === undefined ? {} : { idIndex }),
    },
    location,
    ...(moisture === undefined ? {} : { moisture }),
    ...(ambient === undefined ? {} : { ambient }),
  } as unknown as ValidatedMapping;

  deepFreeze(mapping);
  issued.add(mapping);
  return { ok: true, mapping };
}
