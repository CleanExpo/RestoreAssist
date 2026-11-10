/**
 * RA-8281 B1 (class fix): the one way a stored equipment selection is read
 * and priced when a report, prompt, export, route or screen reads it back.
 *
 * A selection stored on a report carries the daily rate the screen saw when
 * it was made. That rate is a cache: the contractor may have changed or
 * cleared it since, and older rows stored 0 for an unset rate. Every reader
 * here prices each selection from the CURRENT price list through
 * selectionDailyRate. A rate the price list leaves unset makes that line
 * "rate not set" and blocks the equipment total. It is never $0, never the
 * cached figure, and never a midpoint.
 *
 * RA-8281 B1 round 13: this file is the ONLY code that looks inside the
 * stored value. Every other consumer, money or not (unit counts, power draw,
 * labels, the deployment log, the GET routes, the editors), receives the
 * typed lines this file returns. Two things hold that line:
 *   - consumers type the value as StoredEquipmentSelections (`unknown`), so
 *     the compiler rejects element access;
 *   - lib/__tests__/stored-equipment-raw-access.test.ts scans every source
 *     file under app/, lib/ and components/ for raw access.
 */
import {
  getEquipmentGroupById,
  selectionDailyRate,
} from "@/lib/equipment-matrix";
import { RateNotSetError, type UnsetRate } from "@/lib/pricing/rate-not-set";

/** What a report shows in place of a money figure it cannot compute. */
export const RATE_NOT_SET_LABEL = "Rate not set";

/**
 * What a consumer holds before it is read: the database column (a JSON
 * string), an already parsed value, or a posted body field. It is `unknown`
 * on purpose, so nothing outside this file can reach into it.
 */
export type StoredEquipmentSelections = unknown;

/** One stored line as every non-money consumer sees it. */
export interface StoredEquipmentLine {
  /** "" when the line has no equipment type. */
  groupId: string;
  name: string;
  /** 0 when the line cannot be read. */
  quantity: number;
  /** false: no equipment type or no valid quantity. Shown, never dropped. */
  usable: boolean;
}

export interface PricedEquipmentLine extends StoredEquipmentLine {
  durationDays: number;
  /** null: the contractor has not set this rate, or the line is not usable. */
  dailyRate: number | null;
  /** dailyRate × quantity, or null when the rate is not set. */
  dailyTotal: number | null;
  /** dailyRate × quantity × durationDays, or null when the rate is not set. */
  total: number | null;
  /** "Rate not set. Set <field> ..." when the rate is not set, else null. */
  note: string | null;
}

export interface PricedEquipment {
  lines: PricedEquipmentLine[];
  /** Sum of the daily totals, or null when any line's rate is not set. */
  dailyTotal: number | null;
  /** Sum of the line totals, or null when any line's rate is not set. */
  total: number | null;
  /** Every unset rate, one entry per field. */
  unset: UnsetRate[];
  /**
   * Every reason a line could not be priced (unset rates and malformed lines),
   * once each. Empty exactly when `total` is not null.
   */
  problems: string[];
}

/**
 * RA-8281 B1 review round 10: a stored line that cannot be read (no equipment
 * type, or a quantity that is not a non-negative number) is never dropped and
 * never priced at $0. It stays in the list as a blocked line with this note.
 */
export const MALFORMED_LINE_NOTE =
  "An equipment line has no equipment type or no valid quantity, so it cannot be priced. Fix the line before the total can be given.";

/** How a line that cannot be read is named wherever lines are listed. */
export const UNUSABLE_LINE_LABEL =
  "Equipment line not usable (no equipment type or no valid quantity)";

/** True for a plain JSON object (not null, not a list). */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A quantity read from a stored line: a finite number >= 0, else null. */
function readQuantity(value: unknown): number | null {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : NaN;
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * The stored column is a JSON string. Text that parses is its parsed value;
 * blank text is no value; text that does not parse stays as it is, so it
 * becomes one unreadable line below instead of an exception or "no equipment".
 */
function parseStored(value: unknown): unknown {
  if (typeof value !== "string") return value;
  if (value.trim() === "") return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

/**
 * RA-8281 B1 review round 11: the ONE reading of a stored or posted equipment
 * selection's shape. No value at all is no equipment; a list is its lines;
 * any other value (a legacy single object, a string that failed to parse) is
 * one line. Every reader and writer goes through this, so no path can treat
 * an unexpected shape as "no equipment" and skip pricing.
 */
function normaliseStoredSelections(value: unknown): unknown[] {
  const parsed = parseStored(value);
  if (parsed === null || parsed === undefined) return [];
  return Array.isArray(parsed) ? parsed : [parsed];
}

/** True when the stored value holds at least one line, readable or not. */
export function hasStoredEquipment(value: StoredEquipmentSelections): boolean {
  return normaliseStoredSelections(value).length > 0;
}

function readLine(raw: unknown): StoredEquipmentLine {
  const groupId =
    isRecord(raw) && typeof raw.groupId === "string" ? raw.groupId : "";
  const quantity = isRecord(raw) ? readQuantity(raw.quantity) : null;
  if (groupId === "" || quantity === null) {
    return {
      groupId,
      name: groupId || "Unknown equipment",
      quantity: 0,
      usable: false,
    };
  }
  return {
    groupId,
    name: getEquipmentGroupById(groupId)?.name ?? groupId,
    quantity,
    usable: true,
  };
}

/**
 * The stored lines without money: equipment type, name and unit count. For
 * unit counts, power draw, labels and editors. A line that cannot be read is
 * kept with `usable: false` and a quantity of 0.
 */
export function readStoredEquipment(
  value: StoredEquipmentSelections,
): StoredEquipmentLine[] {
  return normaliseStoredSelections(value).map(readLine);
}

/**
 * Saved lines as an equipment editor loads them: the readable lines only,
 * with no rate (the editor prices from the price list), and how many saved
 * lines could not be read so the screen can say so.
 */
export function editableStoredEquipment(value: StoredEquipmentSelections): {
  selections: Array<{ groupId: string; quantity: number }>;
  unusableCount: number;
  hasLines: boolean;
} {
  const lines = readStoredEquipment(value);
  return {
    selections: lines
      .filter((line) => line.usable)
      .map((line) => ({ groupId: line.groupId, quantity: line.quantity })),
    unusableCount: lines.filter((line) => !line.usable).length,
    hasLines: lines.length > 0,
  };
}

/**
 * A Report row for a bulk export that cannot reprice every row: the readable
 * stored lines WITHOUT their cached rate, and no cached equipmentCostTotal.
 * (A single-report response reprices instead: see withCurrentEquipment in
 * report-equipment-response.ts.)
 */
export function withoutCachedEquipmentMoney<
  T extends { equipmentSelection: StoredEquipmentSelections },
>(
  report: T,
): Omit<T, "equipmentSelection" | "equipmentCostTotal"> & {
  equipmentSelection: Array<{ groupId: string; quantity: number }> | null;
} {
  const copy: Record<string, unknown> = { ...report };
  delete copy.equipmentCostTotal;
  const saved = editableStoredEquipment(report.equipmentSelection);
  copy.equipmentSelection = saved.hasLines ? saved.selections : null;
  return copy as Omit<T, "equipmentSelection" | "equipmentCostTotal"> & {
    equipmentSelection: Array<{ groupId: string; quantity: number }> | null;
  };
}

/**
 * The rate cached on a line. selectionDailyRate uses it only for a group that
 * has no price-list field; a group with one is priced from the price list.
 */
function cachedRate(raw: unknown): number | undefined {
  return isRecord(raw) && typeof raw.dailyRate === "number"
    ? raw.dailyRate
    : undefined;
}

/**
 * Price stored selections against the current price list. `pricingConfig`
 * is the report business's price list (resolveReportPricing); null or
 * undefined means none could be loaded, so every rate is unset.
 */
export function priceStoredEquipment(
  selections: StoredEquipmentSelections,
  pricingConfig: unknown,
  durationDays: number,
): PricedEquipment {
  const unset = new Map<string, UnsetRate>();
  const lines = normaliseStoredSelections(selections).map(
    (raw: unknown): PricedEquipmentLine => {
      const read = readLine(raw);
      if (!read.usable) {
        return {
          ...read,
          durationDays,
          dailyRate: null,
          dailyTotal: null,
          total: null,
          note: MALFORMED_LINE_NOTE,
        };
      }
      let dailyRate: number | null;
      let note: string | null = null;
      try {
        dailyRate = selectionDailyRate(
          { groupId: read.groupId, dailyRate: cachedRate(raw) },
          pricingConfig ?? undefined,
        );
      } catch (err) {
        if (!(err instanceof RateNotSetError)) throw err;
        dailyRate = null;
        note = err.message;
        for (const u of err.unset) unset.set(u.field, u);
      }
      return {
        ...read,
        durationDays,
        dailyRate,
        dailyTotal: dailyRate === null ? null : dailyRate * read.quantity,
        total:
          dailyRate === null ? null : dailyRate * read.quantity * durationDays,
        note,
      };
    },
  );
  const blocked = lines.some((l) => l.dailyRate === null);
  return {
    lines,
    dailyTotal: blocked
      ? null
      : lines.reduce((sum, l) => sum + (l.dailyTotal as number), 0),
    total: blocked
      ? null
      : lines.reduce((sum, l) => sum + (l.total as number), 0),
    unset: [...unset.values()],
    problems: [
      ...new Set(lines.flatMap((l) => (l.note === null ? [] : [l.note]))),
    ],
  };
}

/**
 * For documents that cannot show a blocked line: throws RateNotSetError naming
 * every unset rate and unreadable line, so the route answers 422 with the
 * reason. Never a $0 line and never an unnamed 500.
 */
export function assertEquipmentPriced(priced: PricedEquipment): void {
  if (priced.total !== null) return;
  throw new RateNotSetError(
    priced.problems.map((note) => ({ field: "equipmentSelection", note })),
  );
}

/** "$45.00", or "Rate not set" for a figure that could not be computed. */
export function moneyOrRateNotSet(value: number | null): string {
  return value === null ? RATE_NOT_SET_LABEL : `$${value.toFixed(2)}`;
}

/**
 * The sum of money figures, or null when any of them is not a number (a line
 * whose rate is not set). A blocked line blocks the total; it is never
 * counted as $0.
 */
export function sumOrNull(values: ReadonlyArray<unknown>): number | null {
  let sum = 0;
  for (const v of values) {
    if (typeof v !== "number" || !Number.isFinite(v)) return null;
    sum += v;
  }
  return sum;
}

/** Total rated current (amps) of the lines. An unusable line adds nothing. */
export function equipmentAmps(
  lines: ReadonlyArray<StoredEquipmentLine>,
): number {
  return lines.reduce(
    (total, line) =>
      total + (getEquipmentGroupById(line.groupId)?.amps ?? 0) * line.quantity,
    0,
  );
}

/** Total unit count of the lines. An unusable line adds nothing. */
export function equipmentUnitCount(
  lines: ReadonlyArray<StoredEquipmentLine>,
): number {
  return lines.reduce((sum, line) => sum + line.quantity, 0);
}

/** "2x LGR Dehumidifier", or the unusable-line wording. No money. */
export function equipmentUnitsLabel(line: StoredEquipmentLine): string {
  return line.usable ? `${line.quantity}x ${line.name}` : UNUSABLE_LINE_LABEL;
}

/** One row of the equipment deployment log (no money). */
export interface EquipmentDeploymentRow {
  type: string | null;
  brandModel: string | null;
  serial: string | null;
  location: string | null;
  date: string | null;
}

function text(...values: unknown[]): string | null {
  for (const v of values) {
    if (typeof v === "string" && v.trim() !== "") return v;
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return null;
}

/**
 * The deployment log the IICRC PDF and the insurer portal list: type, brand
 * and model, serial, location, date placed. Reads a list, or an older object
 * that holds its list under equipment, items or selected. An entry that is
 * not an object is a row of blanks; it never throws. No money is read.
 */
export function readEquipmentDeploymentLog(
  value: StoredEquipmentSelections,
): EquipmentDeploymentRow[] {
  const parsed = parseStored(value);
  const list: unknown[] = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed)
      ? ([parsed.equipment, parsed.items, parsed.selected].find((v) =>
          Array.isArray(v),
        ) as unknown[] | undefined) ?? []
      : [];
  return list.map((raw) => {
    const eq = isRecord(raw) ? raw : {};
    const brand = text(eq.brand, eq.make) ?? "";
    const model = text(eq.model);
    return {
      type: text(eq.type, eq.equipmentType, eq.name),
      brandModel: `${brand}${model ? ` ${model}` : ""}`.trim() || null,
      serial: text(eq.serialNumber, eq.serial),
      location: text(eq.location, eq.placement, eq.room),
      date: text(eq.deployedDate, eq.date),
    };
  });
}

/** What an API returns in place of the stored column and cached total. */
export interface StoredEquipmentResponse {
  /** null: nothing stored. Otherwise every stored line, priced now. */
  equipmentSelection: Array<{
    groupId: string;
    name: string;
    quantity: number;
    usable: boolean;
    dailyRate: number | null;
    note: string | null;
  }> | null;
  /** null: no lines, or a line is blocked. Never the cached total. */
  equipmentCostTotal: number | null;
  equipmentProblems: string[];
}

/**
 * What an API returns in place of the stored column and the cached
 * report.equipmentCostTotal: the lines priced now from `pricingConfig`, a
 * total that is null when any line is blocked, and the reasons. The stored
 * rate and stored total are never echoed.
 */
export function storedEquipmentResponse(
  stored: StoredEquipmentSelections,
  pricingConfig: unknown,
  durationDays: number,
): StoredEquipmentResponse {
  const parsed = parseStored(stored);
  if (parsed === null || parsed === undefined) {
    return {
      equipmentSelection: null,
      equipmentCostTotal: null,
      equipmentProblems: [],
    };
  }
  const priced = priceStoredEquipment(parsed, pricingConfig, durationDays);
  return {
    equipmentSelection: priced.lines.map((line) => ({
      groupId: line.groupId,
      name: line.name,
      quantity: line.quantity,
      usable: line.usable,
      dailyRate: line.dailyRate,
      note: line.note,
    })),
    equipmentCostTotal: priced.lines.length > 0 ? priced.total : null,
    equipmentProblems: priced.problems,
  };
}
