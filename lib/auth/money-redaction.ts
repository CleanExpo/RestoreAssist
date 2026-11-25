/**
 * RA-8494 — the pure half of the money rule: which keys are money, and how a
 * record is stripped of them. No database access, so it can be imported
 * anywhere (including test doubles). The decision "may this caller see money"
 * lives in `lib/auth/redact-money.ts`, which re-exports everything here; routes
 * import from that file.
 */
/**
 * Scalar keys that carry a price, a priced quantity or payment state, on any
 * model a job response can include (CostEstimate, ScopeItem, Inspection,
 * Report, ReportApproval, Estimate, EstimateLineItem, Invoice, InvoiceLineItem,
 * InvoicePayment, ScopeVariation). Matched exactly, never by substring, so a
 * reading such as `evaporationRate` is left alone.
 */
export const MONEY_KEYS: ReadonlySet<string> = new Set([
  "rate",
  "subtotal",
  "contingency",
  "total",
  "suggestedRate",
  "rateSource",
  "totalUsageCost",
  "totalCost",
  "costDeltaCents",
  "costDeltaPercent",
  "unitPrice",
  "unitPriceExTax",
  "amount",
  "amountPaid",
  "amountDue",
  "amountExTax",
  "subtotalExGST",
  "subtotalExGst",
  "gstAmount",
  "totalIncGST",
  "totalIncGst",
  "totalExTax",
  "totalIncTax",
  "labourSubtotal",
  "equipmentSubtotal",
  "chemicalsSubtotal",
  "subcontractorSubtotal",
  "travelSubtotal",
  "wasteSubtotal",
  "paymentStatus",
  // Report and scope money (Report, Scope, report exports).
  "estimatedCost",
  "equipmentCostTotal",
  "labourCostTotal",
  "chemicalCostTotal",
  "totalEquipmentCost",
  "dailyRate",
  "costEstimationData",
  "costEstimationDocument",
  "labourParameters",
  "equipmentParameters",
  "rateTables",
  "commercialParams",
  // Client money (revenue invoiced to the client).
  "totalRevenue",
  // Dashboards and analytics.
  "revenue",
  "revenueMtdAud",
  "currentRevenue",
  "previousRevenue",
  "revenueChangePct",
  "avgMonthlyRevenue",
  "avgReportValue",
  "clientRevenue",
  "projectedTotals",
  // Payment state as a count of unpaid invoices.
  "awaitingPayment",
  // Claims analysis (missed billable items priced in dollars).
  "estimatedMissingRevenue",
  "totalEstimatedMissingRevenue",
  "estimatedRevenueRecovery",
  "totalBillableValue",
  "totalEstimatedCost",
  // Stored AI synopsis text may quote the job total (reports/[id]/synopsis).
  "aiSynopsis",
  // The cached client summary is written from the priced scope of works
  // (reports/[id]/client-summary): prose, withheld whole.
  "clientSummaryCache",
  // Links to the stored priced exports (report Excel, inspection PDF), which
  // a technician may not download.
  "excelReportUrl",
  "inspectionPdfUrl",
  // Priced markdown written by generate-scope-of-works ("- **Rate:** $..."):
  // text cannot be stripped line by line, so it is withheld whole.
  "scopeOfWorksDocument",
  "restorationCostEstimate",
  // Contents pack-out values (D-028: pack-out is money).
  "replacementValueAud",
  "totalReplacementValueAud",
  // Electricity running cost of the drying equipment (equipment calculator).
  "energyCostPerDay",

  "discountAmount",
  "shippingAmount",
  "adjustmentAmount",
  "gstRate",
  "gst",
  // Schema aliases (estimate variations, allocations, equipment and line costs).
  "previousTotal",
  "variationAmount",
  "newTotal",
  "allocatedAmount",
  "estimatedEquipmentCost",
  "unitCostAud",
  "lineTotalExGst",
]);

/**
 * Relations that are money in their entirety. Kept with their shape (an empty
 * list, or null) so a screen that maps over them still renders.
 */
export const MONEY_RELATIONS: ReadonlySet<string> = new Set([
  "costEstimates",
  "costEstimate",
  "estimates",
  "estimate",
  "invoices",
  "invoice",
  "payments",
]);

/**
 * Text columns that hold JSON with prices inside (Report.equipmentSelection
 * carries each machine's `dailyRate`; Report.scopeOfWorksData carries priced
 * scope lines). The non-money part is still needed on site, so the text is
 * parsed, stripped and re-encoded. Text that does not parse is dropped: it
 * cannot be shown to be free of money.
 */
export const MONEY_JSON_TEXT_KEYS: ReadonlySet<string> = new Set([
  "equipmentSelection",
  "scopeOfWorksData",
  "chemicalApplication",
  // Report.moistureReadings holds the client-written NIR blob, which may
  // carry cost estimates and priced scope items (reports/[id]/nir-data).
  "moistureReadings",
]);

/**
 * Text columns that hold EITHER structured JSON with prices inside OR prose
 * a model may have written from priced inputs. Report.detailedReport is the
 * structured basic or enhanced report (each machine's `dailyRate` in its
 * equipment selection) or the inspection narrative, whose prompt carries the
 * priced equipment lines and "Total Daily Cost"
 * (lib/reports/generate-report-ai.ts). JSON is parsed and stripped like
 * MONEY_JSON_TEXT_KEYS, keeping the field data. Prose cannot be shown to be
 * free of prices, so it is withheld whole (null), never pattern-stripped; the
 * same holds for JSON-looking text that does not parse.
 */
export const MONEY_JSON_OR_PROSE_KEYS: ReadonlySet<string> = new Set([
  "detailedReport",
  // Inspection.generatedNarrative: the scope narrative a money viewer's
  // request writes from past jobs' values (lib/ai/rag-context.ts).
  "generatedNarrative",
]);

const looksLikeJson = (text: string): boolean => /^\s*[[{]/.test(text);

function redactJsonText(key: string, text: string): string | null {
  try {
    return JSON.stringify(redactMoney(JSON.parse(text) as unknown));
  } catch {
    // Unparseable text cannot be shown to be free of prices: withhold it, and
    // say so, so a missing scope is not debugged as a generation fault. The
    // value itself is never logged (it may hold prices).
    console.warn("[money-redaction] withheld unparseable JSON text", {
      key,
      length: text.length,
    });
    return null;
  }
}

/**
 * Money is found by VALUE, not only by column name (verdict round 2: an
 * audit row's `changes` text carried a cost-estimate total). Any string that
 * parses as a JSON object or array is redacted like a record; the original
 * text is kept byte for byte when nothing in it is money. Text that does not
 * parse is not JSON and is left to the named prose columns above.
 */
function redactEmbeddedJson(text: string): string {
  if (!looksLikeJson(text)) return text;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return text;
  }
  if (parsed === null || typeof parsed !== "object") return text;
  const redacted = JSON.stringify(redactMoney(parsed));
  return redacted === JSON.stringify(parsed) ? text : redacted;
}

const ANY_MONEY_COLUMN = (name: string): boolean =>
  MONEY_KEYS.has(name) ||
  MONEY_RELATIONS.has(name) ||
  MONEY_JSON_TEXT_KEYS.has(name) ||
  MONEY_JSON_OR_PROSE_KEYS.has(name);

/** The value slots of a change entry that names its field ({ field, from, to }). */
const DIFF_VALUE_KEYS: ReadonlySet<string> = new Set([
  "from",
  "to",
  "oldValue",
  "newValue",
  "previousValue",
  "value",
  "before",
  "after",
]);

/**
 * A change entry keyed by the field it changed (report version history
 * `{ field, from, to }`): when that field is money, its values are money
 * whatever their own keys are called.
 */
function isMoneyFieldDiff(value: Record<string, unknown>): boolean {
  const field = value.field ?? value.fieldName;
  return typeof field === "string" && ANY_MONEY_COLUMN(field);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * A deep copy of `value` with every money value withheld: a money key becomes
 * `null` (the repo's existing "hidden" convention, which every reader is
 * typed for as `number | null`), and a money relation becomes `[]` or `null`.
 * Dates, buffers and other non-plain objects are kept as they are.
 *
 * Apply it to records and response bodies, never to an envelope whose counts
 * share a money name (a stream event's `total` file count, a pagination
 * `total`): redact the record field inside it instead.
 */
export function redactMoney<T>(value: T): T {
  if (typeof value === "string") return redactEmbeddedJson(value) as unknown as T;
  if (Array.isArray(value)) {
    return value.map((item) => redactMoney(item)) as unknown as T;
  }
  if (!isPlainObject(value)) return value;
  const out: Record<string, unknown> = {};
  const diffOfMoney = isMoneyFieldDiff(value);
  for (const [key, child] of Object.entries(value)) {
    if (diffOfMoney && DIFF_VALUE_KEYS.has(key)) {
      out[key] = null;
      continue;
    }
    if (MONEY_KEYS.has(key)) {
      out[key] = null;
      continue;
    }
    if (MONEY_RELATIONS.has(key)) {
      out[key] = Array.isArray(child) ? [] : null;
      continue;
    }
    if (MONEY_JSON_TEXT_KEYS.has(key) && typeof child === "string") {
      out[key] = redactJsonText(key, child);
      continue;
    }
    if (MONEY_JSON_OR_PROSE_KEYS.has(key) && typeof child === "string") {
      out[key] = looksLikeJson(child) ? redactJsonText(key, child) : null;
      continue;
    }

    out[key] = redactMoney(child);
  }
  return out as T;
}

/**
 * The write-side half of the rule: a request body from a caller who may not
 * see money, with every money field removed (top level). A technician reads
 * those fields as null, so echoing a record back must never overwrite the
 * stored price, priced document or priced JSON with that null or with a
 * stripped copy. A MONEY_JSON_OR_PROSE_KEYS field is never accepted: its
 * reader sees it withheld or stripped, so any write would replace text the
 * writer could not see.
 */
export function withoutMoneyWrites<T extends Record<string, unknown>>(body: T): T {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (
      MONEY_KEYS.has(key) ||
      MONEY_RELATIONS.has(key) ||
      MONEY_JSON_TEXT_KEYS.has(key) ||
      MONEY_JSON_OR_PROSE_KEYS.has(key)
    ) {
      continue;
    }
    out[key] = value;
  }
  return out as T;
}

/**
 * The write-side rule at any depth (verdict round 3; founder ruling
 * 21/11/2026). A caller who may not see money edits JSON whose prices were
 * withheld from them; writing their copy as sent would blank, or let them
 * set, the stored price. The result is `sent` with every money key, at every
 * depth, taken from `stored` instead (dropped when `stored` has none). List
 * items are paired by `id` when both sides carry one, otherwise by position.
 * Everything that is not money is written as sent.
 */
export function keepHiddenMoney<T>(sent: T, stored: unknown): T {
  if (Array.isArray(sent)) {
    const old = Array.isArray(stored) ? stored : [];
    const byId = new Map<unknown, unknown>();
    for (const item of old) {
      if (isPlainObject(item) && item.id !== undefined) byId.set(item.id, item);
    }
    return sent.map((item, index) => {
      const match =
        isPlainObject(item) && item.id !== undefined ? byId.get(item.id) : old[index];
      return keepHiddenMoney(item, match);
    }) as unknown as T;
  }
  if (!isPlainObject(sent)) return sent;
  const before = isPlainObject(stored) ? stored : {};
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(sent)) {
    if (ANY_MONEY_COLUMN(key)) continue;
    out[key] = keepHiddenMoney(child, before[key]);
  }
  for (const [key, value] of Object.entries(before)) {
    if (ANY_MONEY_COLUMN(key)) out[key] = value;
  }
  return out as T;
}
