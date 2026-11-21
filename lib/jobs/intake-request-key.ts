/**
 * RA-8495 — which Idempotency-Key an office intake save sends.
 *
 * The server caches every answer under its key, refusals included, and
 * answers 409 when one key arrives with a different body. So the key must
 * follow the body: the same body (a double click, a resubmit after a timeout)
 * reuses the key and gets the first answer back; any other body gets a new
 * key. Rotating only after a success left a form that had been refused once
 * (for example a three-digit postcode) unable to save after the fix.
 */
export interface IntakeRequestKey {
  key: string;
  body: string;
}

export function keyForSubmission(
  previous: IntakeRequestKey | null,
  body: string,
  newKey: () => string,
): IntakeRequestKey {
  if (previous && previous.body === body) return previous;
  return { key: newKey(), body };
}
