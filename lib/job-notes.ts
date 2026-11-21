/**
 * RA-8496 — append-only job notes: the shared rules.
 *
 * One owner for the note kinds, the role labels and body validation, so the
 * route and the panel cannot drift apart.
 */

import type { JobNoteKind } from "@prisma/client";

export const JOB_NOTE_KINDS = [
  "GENERAL",
  "CALL",
  "BOOKING",
  "REBOOKING",
  "REVIEW",
] as const;

export type JobNoteKindValue = (typeof JOB_NOTE_KINDS)[number];

// The list above must be exactly the database enum, both ways: a kind added to
// the schema and not here (or the reverse) fails type-check.
type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const kindsMatchSchema: Exact<JobNoteKindValue, JobNoteKind> = true;
void kindsMatchSchema;

export const JOB_NOTE_KIND_LABELS: Record<JobNoteKindValue, string> = {
  GENERAL: "General",
  CALL: "Call with insured",
  BOOKING: "Booking",
  REBOOKING: "Re-booking",
  REVIEW: "Review",
};

/**
 * How a stored role reads on a note. A technician is a USER in this app.
 * ADMIN is the tenant's admin role, which more than one person can hold, so it
 * reads "Admin", never "Owner".
 */
export function jobNoteRoleLabel(role: string): string {
  switch (role) {
    case "ADMIN":
      return "Admin";
    case "MANAGER":
      return "Manager";
    case "USER":
      return "Technician";
    default:
      return "Team member";
  }
}

/**
 * Exact date and time of a note, in the reader's own time zone, with the zone
 * named so a reader in another state is not misled ("21 Nov 2026, 9:15 am AEDT").
 */
export function formatJobNoteTime(iso: string, locale = "en-AU"): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(d);
}

export const JOB_NOTE_MAX_LENGTH = 4000;

/** Longest client request id accepted (a UUID is 36). */
export const JOB_NOTE_REQUEST_ID_MAX = 100;

/**
 * The name stamped on a note. Never the email address: the stamp outlives the
 * account (the author link is SET NULL on delete), so an email copied here
 * would survive the person's erasure request.
 */
export function jobNoteAuthorName(name: string | null | undefined): string {
  const trimmed = name?.trim();
  return trimmed ? trimmed : "Team member";
}

export type ParsedJobNote =
  | {
      ok: true;
      kind: JobNoteKindValue;
      body: string;
      clientRequestId: string | null;
    }
  | { ok: false; message: string };

/**
 * Validate a request body. Only `kind`, `body` and the optional
 * `clientRequestId` (one per draft, so a retried save is recognised) are read: the author, role
 * and time always come from the server, whatever else the caller sends.
 *
 * The text is stored as typed (null bytes removed, trimmed). It is not
 * HTML-encoded here, because React escapes it when it renders; encoding it
 * would show "&amp;" to the next reader.
 */
export function parseJobNoteInput(input: unknown): ParsedJobNote {
  const raw = (input ?? {}) as Record<string, unknown>;
  const kind = raw.kind === undefined ? "GENERAL" : raw.kind;
  if (
    typeof kind !== "string" ||
    !(JOB_NOTE_KINDS as readonly string[]).includes(kind)
  ) {
    return { ok: false, message: "Choose what the note is for" };
  }
  if (typeof raw.body !== "string") {
    return { ok: false, message: "Write the note before saving" };
  }
  const body = raw.body.replaceAll(String.fromCharCode(0), "").trim();
  if (body.length === 0) {
    return { ok: false, message: "Write the note before saving" };
  }
  if (body.length > JOB_NOTE_MAX_LENGTH) {
    return {
      ok: false,
      message: `Keep the note under ${JOB_NOTE_MAX_LENGTH} characters`,
    };
  }
  let clientRequestId: string | null = null;
  if (raw.clientRequestId !== undefined && raw.clientRequestId !== null) {
    if (
      typeof raw.clientRequestId !== "string" ||
      raw.clientRequestId.length === 0 ||
      raw.clientRequestId.length > JOB_NOTE_REQUEST_ID_MAX
    ) {
      return {
        ok: false,
        message: "The note could not be saved. Reload the page and try again",
      };
    }
    clientRequestId = raw.clientRequestId;
  }
  return { ok: true, kind: kind as JobNoteKindValue, body, clientRequestId };
}
