/**
 * RA-7687 slice 1 - third-party laboratory report reader: the checked shapes.
 *
 * The uploaded PDF is untrusted data. The guarantee is structural, not a list
 * of banned words:
 *   - the model may only propose the allow-listed fields below, each with a
 *     page number and a quote;
 *   - every value is held to a tight type, character set and length for its
 *     field, so free prose cannot be carried into a job column;
 *   - the quote is display-only: it is shown as text, never written anywhere;
 *   - nothing reaches the job until the technician confirms it, and the
 *     fields cannot express a condition, clearance or health conclusion.
 */

import { z } from "zod";

/** Job fields a laboratory report can propose. Each maps to one column of
 *  MouldRemediationAssessment and nothing else. */
export const LAB_FIELDS = [
  "labName",
  "labReportReference",
  "samplingDate",
  "sporeType",
  "sporeCountPreRemediation",
  "outdoorBaselineCount",
  "sporeCountPostRemediation",
] as const;
export type LabField = (typeof LAB_FIELDS)[number];

export const NUMERIC_LAB_FIELDS: readonly LabField[] = [
  "sporeCountPreRemediation",
  "outdoorBaselineCount",
  "sporeCountPostRemediation",
];

export const LAB_FIELD_LABELS: Record<LabField, string> = {
  labName: "Laboratory",
  labReportReference: "Lab report reference",
  samplingDate: "Sampling date",
  sporeType: "Spore type",
  sporeCountPreRemediation: "Spore count (before remediation)",
  outdoorBaselineCount: "Outdoor baseline count",
  sporeCountPostRemediation: "Spore count (after remediation)",
};

const MAX_QUOTE = 300;
const MAX_FACTS = 40;
const MAX_COUNT = 1e9;

/** Allowed characters per text field: names and codes, never sentences with
 *  markup, braces or line breaks. */
const TEXT_RULES: Record<
  "labName" | "labReportReference" | "sporeType",
  RegExp
> = {
  labName: /^[A-Za-z0-9][A-Za-z0-9 .,&'()\-/]{1,79}$/,
  labReportReference: /^[A-Za-z0-9][A-Za-z0-9 ._\-/#]{0,39}$/,
  sporeType: /^[A-Za-z][A-Za-z .,()\-/]{1,59}$/,
};
const LABEL_TEXT = /^[A-Za-z0-9][A-Za-z0-9 .,&'()\-/:]{0,99}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const pageRef = z.number().int().min(1).max(5000);

/** Quote shown beside a fact. Control characters are removed; it is never stored. */
export function cleanQuote(quote: string): string {
  return quote.replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, MAX_QUOTE);
}

/** Validates one value against its field. Returns null when it is not usable. */
export function normaliseFactValue(
  field: LabField,
  value: string | number,
): string | number | null {
  if (NUMERIC_LAB_FIELDS.includes(field)) {
    if (typeof value === "string" && value.trim() === "") return null;
    const n = typeof value === "number" ? value : Number(value.trim());
    return Number.isFinite(n) && n >= 0 && n <= MAX_COUNT ? n : null;
  }
  const text = String(value).trim();
  if (field === "samplingDate") {
    if (!ISO_DATE.test(text)) return null;
    const d = new Date(`${text}T00:00:00.000Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === text
      ? text
      : null;
  }
  return TEXT_RULES[field as keyof typeof TEXT_RULES].test(text) ? text : null;
}

const rawFact = z
  .object({
    field: z.enum(LAB_FIELDS),
    value: z.union([z.string().max(400), z.number()]),
    pageRef,
    quote: z.string().min(1).max(2000),
  })
  .strict();

export interface ExtractedFact {
  field: LabField;
  /** Text for text fields, ISO date (YYYY-MM-DD) for samplingDate, number for counts. */
  value: string | number;
  pageRef: number;
  /** Display-only. Never written to the job. */
  quote: string;
}

export interface ExtractedDocument {
  title: string | null;
  author: string | null;
  reportDate: string | null;
}

export interface ParsedExtraction {
  document: ExtractedDocument;
  facts: ExtractedFact[];
  /** Facts withheld because they failed the checks. Shown as a count only. */
  rejectedCount: number;
}

const labelOrNull = (v: unknown): string | null =>
  typeof v === "string" && LABEL_TEXT.test(v.trim()) ? v.trim() : null;

/**
 * Strict parse of the model's reply. No repair of malformed JSON: a reply that
 * is not exactly the agreed shape is a failed read, not a guess. Returns null
 * for an unusable reply.
 *
 * @param pageCount page count of the PDF when it can be trusted, else 0
 *   (unknown). A page reference beyond a known count cannot have come from the
 *   document.
 */
export function parseExtraction(
  text: string,
  pageCount: number,
): ParsedExtraction | null {
  const stripped = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
  let json: unknown;
  try {
    json = JSON.parse(stripped);
  } catch {
    return null;
  }
  const envelope = z
    .object({
      document: z
        .object({
          title: z.string().nullable().optional(),
          author: z.string().nullable().optional(),
          reportDate: z.string().nullable().optional(),
        })
        .strict()
        .optional(),
      facts: z.array(z.unknown()).max(MAX_FACTS),
    })
    .strict()
    .safeParse(json);
  if (!envelope.success) return null;

  const facts: ExtractedFact[] = [];
  let rejectedCount = 0;
  for (const candidate of envelope.data.facts) {
    const parsed = rawFact.safeParse(candidate);
    if (!parsed.success) {
      rejectedCount++;
      continue;
    }
    const { field, value, pageRef: page, quote } = parsed.data;
    const normalised = normaliseFactValue(field, value);
    const cleaned = cleanQuote(quote);
    const beyondDocument = pageCount > 0 && page > pageCount;
    if (normalised === null || cleaned === "" || beyondDocument) {
      rejectedCount++;
      continue;
    }
    facts.push({ field, value: normalised, pageRef: page, quote: cleaned });
  }

  const doc = envelope.data.document;
  const reportDate =
    typeof doc?.reportDate === "string" &&
    normaliseFactValue("samplingDate", doc.reportDate) !== null
      ? doc.reportDate
      : null;
  return {
    document: {
      title: labelOrNull(doc?.title),
      author: labelOrNull(doc?.author),
      reportDate,
    },
    facts,
    rejectedCount,
  };
}

/** What the confirm route accepts. Values come from the signed proposal; the
 *  client names a fact by position and decides, and may only supply a value
 *  when it edits. */
export const confirmBodySchema = z
  .object({
    proposalToken: z.string().min(20).max(120_000),
    decisions: z
      .array(
        z
          .object({
            index: z.number().int().min(0).max(MAX_FACTS - 1),
            action: z.enum(["accept", "edit", "dismiss"]),
            value: z.union([z.string().max(400), z.number()]).optional(),
          })
          .strict(),
      )
      .max(MAX_FACTS),
  })
  .strict();

export type ConfirmBody = z.infer<typeof confirmBodySchema>;
