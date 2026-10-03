import { sanitizeForPostgresText } from "@/lib/sanitize";

/** Current Client Notes contract. Never silently shorten a submitted note. */
export const CLIENT_NOTES_MAX_LENGTH = 5_000;

export function validateClientNotes(input: unknown):
  | { ok: true; value: string }
  | { ok: false; message: string } {
  const value = input == null ? "" : input;
  if (typeof value !== "string") {
    return { ok: false, message: "Notes must be text" };
  }
  if (value.length > CLIENT_NOTES_MAX_LENGTH) {
    return {
      ok: false,
      message: `Notes must be ${CLIENT_NOTES_MAX_LENGTH.toLocaleString("en-AU")} characters or fewer; nothing was saved`,
    };
  }
  // React renders Client Notes as text. Preserve supported punctuation and
  // markup literally so saving an existing ampersand cannot escape it again.
  // Reject DB-invalid characters explicitly rather than altering the note.
  if (sanitizeForPostgresText(value) !== value) {
    return { ok: false, message: "Notes contain unsupported characters; nothing was saved" };
  }
  return { ok: true, value };
}
