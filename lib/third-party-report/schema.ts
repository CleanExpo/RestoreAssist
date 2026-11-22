/**
 * RA-7687 slice 1 - third-party laboratory report reader: the checked shapes.
 *
 * The uploaded PDF is untrusted data. The model may only return the facts
 * below, each with the page it came from and a short verbatim quote. Anything
 * else (unknown field, no page, instruction text, a clinical or clearance
 * claim) is dropped before the technician ever sees it. Nothing here writes to
 * the job: the confirm route is the only writer.
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

const MAX_TEXT = 200;
const MAX_QUOTE = 300;
const MAX_FACTS = 40;

/** Text that is a health, clinical or clearance claim, or an instruction aimed
 *  at the reader. The report states what it measured; it never decides these. */
const UNSUPPORTED_CLAIM =
  /\b(cleared?|clearance|safe (?:to|for) (?:occupy|occupation|re-?enter|reoccup)|fit for occupancy|pathogen[- ]free|mould[- ]free|diagnos\w*|medical|clinical|health (?:risk|hazard|effect)|ignore (?:all |any |the )?(?:previous|prior|above)|disregard|system prompt|you (?:must|are now)|assistant:)/i;

export function containsUnsupportedClaim(text: string): boolean {
  return UNSUPPORTED_CLAIM.test(text);
}

const pageRef = z.number().int().min(1).max(5000);

const textValue = z.string().trim().min(1).max(MAX_TEXT);

const rawFact = z
  .object({
    field: z.enum(LAB_FIELDS),
    value: z.union([z.string(), z.number()]),
    pageRef,
    quote: z.string().trim().min(1).max(MAX_QUOTE),
  })
  .strict();

export type RawFact = z.infer<typeof rawFact>;

export interface ExtractedFact {
  field: LabField;
  /** Text for text fields, ISO date (YYYY-MM-DD) for samplingDate, number for counts. */
  value: string | number;
  pageRef: number;
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

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Validates one value against its field. Returns null when it is not usable. */
export function normaliseFactValue(
  field: LabField,
  value: string | number,
): string | number | null {
  if (NUMERIC_LAB_FIELDS.includes(field)) {
    const n = typeof value === "number" ? value : Number(String(value).trim());
    return Number.isFinite(n) && n >= 0 ? n : null;
  }
  const text = String(value).trim();
  if (text.length === 0 || text.length > MAX_TEXT) return null;
  if (field === "samplingDate") {
    if (!ISO_DATE.test(text)) return null;
    const d = new Date(`${text}T00:00:00.000Z`);
    if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== text) {
      return null;
    }
  }
  return text;
}

const documentSchema = z
  .object({
    title: textValue.nullable().optional(),
    author: textValue.nullable().optional(),
    reportDate: z.string().regex(ISO_DATE).nullable().optional(),
  })
  .strict();

/**
 * Strict parse of the model's reply. No repair of malformed JSON: a reply that
 * is not exactly the agreed shape is a failed read, not a guess. Returns null
 * for an unusable reply.
 *
 * @param pageCount best-effort page count of the PDF, or 0 when unknown; a
 *   page reference beyond it cannot have come from the document.
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
      document: documentSchema.optional(),
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
    const unsupported =
      containsUnsupportedClaim(quote) ||
      (typeof value === "string" && containsUnsupportedClaim(value));
    const beyondDocument = pageCount > 0 && page > pageCount;
    if (normalised === null || unsupported || beyondDocument) {
      rejectedCount++;
      continue;
    }
    facts.push({ field, value: normalised, pageRef: page, quote });
  }

  const doc = envelope.data.document;
  const safe = (v: string | null | undefined) =>
    v && !containsUnsupportedClaim(v) ? v : null;
  return {
    document: {
      title: safe(doc?.title),
      author: safe(doc?.author),
      reportDate: doc?.reportDate ?? null,
    },
    facts,
    rejectedCount,
  };
}

/** What the confirm route accepts: only decided facts, strictly typed. */
export const decisionSchema = z
  .object({
    field: z.enum(LAB_FIELDS),
    value: z.union([z.string(), z.number()]),
    pageRef,
    quote: z.string().trim().max(MAX_QUOTE),
    action: z.enum(["accept", "edit", "dismiss"]),
  })
  .strict();

export const confirmBodySchema = z
  .object({
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    fileName: z.string().trim().min(1).max(255),
    author: z.string().trim().max(MAX_TEXT).nullable().optional(),
    reportDate: z.string().regex(ISO_DATE).nullable().optional(),
    decisions: z.array(decisionSchema).max(MAX_FACTS),
  })
  .strict();

export type ConfirmBody = z.infer<typeof confirmBodySchema>;
