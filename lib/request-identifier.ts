/**
 * The one owner of "is this value from a request a usable record identifier".
 *
 * RA-8388. Prisma ignores a filter whose value is `undefined`: `{ id: undefined }`
 * matches every row. A route that took an identifier straight from a request
 * body and put it in a `where` therefore widened its write to everything in
 * scope when the identifier was left out. That happened twice: the evidence
 * delete removed every record a technician had captured on a job, and the
 * workflow step update marked every step.
 *
 * A handler under `app/api/inspections/[id]` that filters on an identifier
 * taken from a request calls this first and refuses on `null`. The guard test
 * `scripts/ci/__tests__/ra-8388-request-identifier-owner.test.ts` fails when
 * one of those handlers puts a bare request value in an `id:` filter instead.
 *
 * Returns the identifier, or `null` when the value is anything other than a
 * non-empty string. It never trims or coerces: an identifier is matched as
 * sent or not at all.
 */
export function requiredIdentifier(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Read one field from a parsed request body without assuming the body is an
 * object. `null`, an array, a number and a string all yield `undefined`.
 */
export function bodyField(body: unknown, field: string): unknown {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return undefined;
  }
  return (body as Record<string, unknown>)[field];
}
