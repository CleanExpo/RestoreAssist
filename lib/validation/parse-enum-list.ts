/**
 * Parse a query-string enum filter that callers send as one value
 * (`?status=DRAFT`) or a comma-joined list (`?status=SENT,PAID`).
 *
 * Prisma rejects a comma-joined string as a single enum value and the
 * route answers 500. Split, trim, upper-case, and check each token
 * against the allowed enum before it reaches the query.
 */

export type ParseEnumListResult<T extends string> =
  | { ok: true; values: T[] }
  | { ok: false; invalid: string };

export function parseEnumList<T extends string>(
  raw: string,
  allowed: readonly T[],
): ParseEnumListResult<T> {
  const allowedSet = new Set<string>(allowed);
  const tokens = raw
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  if (tokens.length === 0) {
    return { ok: false, invalid: raw };
  }

  const values: T[] = [];
  const seen = new Set<string>();
  for (const token of tokens) {
    const normalised = token.toUpperCase();
    if (!allowedSet.has(normalised)) {
      return { ok: false, invalid: token };
    }
    if (seen.has(normalised)) continue;
    seen.add(normalised);
    values.push(normalised as T);
  }
  return { ok: true, values };
}

/** Equality for one value; `{ in }` when the caller sent several. */
export function enumEqualityOrIn<T extends string>(
  values: readonly T[],
): T | { in: T[] } {
  if (values.length === 1) return values[0]!;
  return { in: [...values] };
}
