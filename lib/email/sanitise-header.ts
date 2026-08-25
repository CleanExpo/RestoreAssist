/**
 * Email header-field sanitiser.
 *
 * The subject / from / reply-to fields of an email are HEADERS. A CR or LF
 * inside one is a header boundary, so any attacker-influenced value has to be
 * folded before it is interpolated in.
 *
 * This lives in its own module rather than inside `lib/email.ts` so a caller
 * that needs nothing but this two-line fold does not have to pull in the whole
 * sender module (observability, brand, delivery-error types) — and, in tests,
 * does not have to mock that module's transitive imports.
 */

/** Fold CR/LF to spaces and cap the length. */
export function sanitiseEmailField(value: string, maxLength = 255): string {
  return value.replace(/[\r\n]/g, " ").slice(0, maxLength);
}
