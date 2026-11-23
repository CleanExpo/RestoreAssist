import { z } from "zod";
import { CARSI_ORIGIN } from "@/lib/carsi/training-links";

/**
 * Mining pilot slice 6: what a staff training record accepts, and how its
 * links and dates are read back.
 *
 * Links are stored as typed. RestoreAssist never fetches them and never calls
 * CARSI: there is no data-sharing agreement, so a CARSI reference is the
 * business's own entry and is never shown as verified (decision D-007).
 */

const CARSI_HOST = new URL(CARSI_ORIGIN).hostname;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CERTIFICATE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,99}$/;
const MAX_LINK = 2048;

/** A YYYY-MM-DD string that is a real calendar date, as a UTC-midnight Date. */
export function parseDateOnly(value: string): Date | null {
  if (!DATE_RE.test(value)) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10) === value ? d : null;
}

export function formatDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** http or https only, so a stored link can never run script when clicked. */
export function isWebLink(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

function isCarsiLink(value: string): boolean {
  try {
    const u = new URL(value);
    return (
      u.protocol === "https:" &&
      (u.hostname === CARSI_HOST || u.hostname.endsWith(`.${CARSI_HOST}`))
    );
  } catch {
    return false;
  }
}

/**
 * A CARSI reference is either a carsi.com.au link or a certificate id. A link
 * to any other site is refused, so a record cannot point "CARSI" somewhere else.
 */
export function isCarsiCompletionRef(value: string): boolean {
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return isCarsiLink(value);
  return CERTIFICATE_ID_RE.test(value);
}

/** The link to open for a stored CARSI reference, or null for a certificate id. */
export function carsiCompletionHref(ref: string | null): string | null {
  return ref && isCarsiLink(ref) ? ref : null;
}

/** The link to open for stored evidence, or null if it is not a web link. */
export function evidenceHref(url: string | null): string | null {
  return url && isWebLink(url) ? url : null;
}

const text = (field: string) =>
  z
    .string()
    .trim()
    .min(1, `${field} is required`)
    .max(200, `${field} must be 200 characters or fewer`);

/** Empty string or null clears an optional field; undefined leaves it unchanged. */
const optionalText = <T extends z.ZodType<string>>(inner: T) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    inner.nullable().optional(),
  );

const dateField = z
  .string()
  .refine((v) => parseDateOnly(v) !== null, "Use a real date as YYYY-MM-DD");

const evidenceUrl = z
  .string()
  .trim()
  .max(MAX_LINK)
  .refine(isWebLink, "Evidence link must start with https:// or http://");

const carsiRef = z
  .string()
  .trim()
  .max(MAX_LINK)
  .refine(
    isCarsiCompletionRef,
    `CARSI reference must be a ${CARSI_HOST} link or a certificate id`,
  );

const fields = {
  course: text("Course"),
  provider: text("Provider"),
  completedOn: dateField,
  expiresOn: optionalText(dateField),
  evidenceUrl: optionalText(evidenceUrl),
  carsiCompletionRef: optionalText(carsiRef),
};

function expiryNotBeforeCompletion(
  v: { completedOn?: string; expiresOn?: string | null },
  ctx: z.RefinementCtx,
) {
  if (v.completedOn && v.expiresOn && v.expiresOn < v.completedOn) {
    ctx.addIssue({
      code: "custom",
      path: ["expiresOn"],
      message: "Expiry cannot be before completion",
    });
  }
}

/**
 * Create body. `.strict()` refuses any other key, so a caller cannot choose
 * the organisation, the recorder or the id.
 */
export const createTrainingRecordSchema = z
  .object({ staffUserId: z.string().trim().min(1).max(64), ...fields })
  .strict()
  .superRefine(expiryNotBeforeCompletion);

/**
 * Update body. The staff member cannot be changed: a record moved to another
 * person is a new record. Expiry is checked against the stored completion date
 * in the route when only one of the two is sent.
 */
export const updateTrainingRecordSchema = z
  .object({
    course: fields.course.optional(),
    provider: fields.provider.optional(),
    completedOn: dateField.optional(),
    expiresOn: fields.expiresOn,
    evidenceUrl: fields.evidenceUrl,
    carsiCompletionRef: fields.carsiCompletionRef,
  })
  .strict()
  .superRefine(expiryNotBeforeCompletion);

export type CreateTrainingRecordInput = z.infer<
  typeof createTrainingRecordSchema
>;
export type UpdateTrainingRecordInput = z.infer<
  typeof updateTrainingRecordSchema
>;

/** First message per field, for a 400 response. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.length ? String(issue.path[0]) : "body";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

export type TrainingStatus = "no-expiry" | "current" | "expiring" | "expired";

/** Expiry status on a given day (YYYY-MM-DD). "expiring" is within 30 days. */
export function trainingStatus(
  expiresOn: string | null,
  today: string,
): TrainingStatus {
  if (!expiresOn) return "no-expiry";
  if (expiresOn < today) return "expired";
  const soon = parseDateOnly(today);
  if (!soon) return "current";
  soon.setUTCDate(soon.getUTCDate() + 30);
  return expiresOn <= formatDateOnly(soon) ? "expiring" : "current";
}
