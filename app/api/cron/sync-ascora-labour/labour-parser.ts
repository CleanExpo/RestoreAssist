export interface AscoraJobLabourRaw {
  roleName?: string;
  numberOfHours?: number;
  hourlyRateExTax?: number;
  totalAmountExTax?: number;
  isChargeable?: boolean;
  startDate?: string | null;
}

function toNum(v: unknown): number | undefined {
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) {
    return Number(v);
  }
  return undefined;
}

// Labour-specific field names. An object carrying any of these is a labour row;
// used to recognise labour arrays anywhere in the payload without matching
// unrelated arrays (jobs, customers, notes).
const LABOUR_SIGNAL_KEYS = [
  "roleName",
  "labourType",
  "numberOfHours",
  "hourlyRateExTax",
  "hourlyRate",
  "isChargeable",
  "chargeable",
];

function looksLikeLabour(v: unknown): boolean {
  return (
    !!v &&
    typeof v === "object" &&
    !Array.isArray(v) &&
    LABOUR_SIGNAL_KEYS.some((k) => k in (v as Record<string, unknown>))
  );
}

/**
 * Shape-agnostic fallback for when the known container keys don't yield a
 * labour array — some Ascora responses nest the rows deeper (e.g.
 * `{ jobLabours: { jobLabour: [...] } }`) or return a single labour object
 * instead of an array. Finds the first labour-shaped array anywhere in the
 * payload, or wraps a lone labour object. Keyed on labour-specific fields so
 * unrelated arrays are never picked up. Returns [] when nothing labour-shaped
 * exists (a genuinely empty result).
 */
export function findLabourRows(v: unknown, depth = 5): unknown[] {
  if (Array.isArray(v)) return v.some(looksLikeLabour) ? v : [];
  if (looksLikeLabour(v)) return [v];
  if (v && typeof v === "object" && depth > 0) {
    for (const val of Object.values(v as Record<string, unknown>)) {
      const found = findLabourRows(val, depth - 1);
      if (found.length) return found;
    }
  }
  return [];
}

/**
 * Structural description of a value — key names + value TYPES, two levels deep,
 * VALUES OMITTED so no customer data enters logs or metadata. Turns an opaque
 * "labour parsed empty" into a diagnosable shape, e.g.
 * "{success:boolean,jobLabours:array[0]}" (genuinely empty) vs
 * "{success:boolean,jobLabours:{jobLabour:array[3]}}" (nested — parser gap).
 */
export function describeShape(v: unknown, depth = 2): string {
  if (v === null) return "null";
  if (Array.isArray(v)) {
    return depth > 0 && v.length
      ? `array[${v.length}]<${describeShape(v[0], depth - 1)}>`
      : `array[${v.length}]`;
  }
  if (typeof v === "object") {
    if (depth <= 0) return "object";
    const keys = Object.keys(v as Record<string, unknown>).slice(0, 12);
    return `{${keys
      .map(
        (k) =>
          `${k}:${describeShape((v as Record<string, unknown>)[k], depth - 1)}`,
      )
      .join(",")}}`;
  }
  return typeof v;
}

/**
 * Ascora does NOT key list rows by an endpoint-named field. Paginated lists
 * wrap rows in `{ success, results: [...] }` (see the /Jobs/Jobs importer that
 * works) and some endpoints (GetInvoicesToSend) return a bare array. The
 * original `data.jobLabours` guess matched none of these, so every JobLabour
 * call succeeded yet parsed to [] — 4,000 jobs, zero labour lines (RA-7026:
 * `fetchErrors:0, labourLines:0`). Extract the row array from whichever shape
 * Ascora actually returns, and normalise each row tolerantly (rate/hours field
 * naming varies across Ascora endpoints).
 */
export function normalizeJobLabours(data: unknown): AscoraJobLabourRaw[] {
  const d = data as Record<string, unknown> | unknown[] | null;
  let rows: unknown[] = [];
  if (Array.isArray(d)) {
    rows = d;
  } else if (d && typeof d === "object") {
    for (const key of [
      "results",
      "jobLabours",
      "jobLabour",
      "JobLabours",
      "labour",
      "labours",
      "items",
    ]) {
      const v = (d as Record<string, unknown>)[key];
      if (Array.isArray(v)) {
        rows = v;
        break;
      }
    }
  }

  // No known container key held a labour array — the rows may be nested deeper
  // or returned as a single object. Search the whole payload shape-agnostically.
  if (rows.length === 0) rows = findLabourRows(d);

  return rows
    .filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
    .map((r) => ({
      roleName: (r.roleName ??
        r.role ??
        r.name ??
        r.labourType ??
        r.description) as string | undefined,
      numberOfHours: toNum(
        r.numberOfHours ?? r.hours ?? r.quantity ?? r.qty ?? r.units,
      ),
      hourlyRateExTax: toNum(
        r.hourlyRateExTax ??
          r.hourlyRate ??
          r.rateExTax ??
          r.rate ??
          r.unitPriceExTax ??
          r.unitPrice,
      ),
      totalAmountExTax: toNum(
        r.totalAmountExTax ?? r.amountExTax ?? r.totalExTax ?? r.total ?? r.amount,
      ),
      isChargeable:
        typeof r.isChargeable === "boolean"
          ? r.isChargeable
          : typeof r.chargeable === "boolean"
            ? (r.chargeable as boolean)
            : undefined,
      startDate: (r.startDate ?? r.date ?? r.workDate ?? null) as
        | string
        | null,
    }));
}
