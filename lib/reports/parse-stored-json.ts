/**
 * Parse a JSON-backed legacy database field without letting one malformed row
 * take down a public portal or document export.
 *
 * Prisma currently exposes these Report fields as strings, but accepting an
 * already-parsed value keeps test fixtures and future JSON-column migrations
 * backwards compatible.
 */
export function parseStoredJson(value: unknown): unknown {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") return value;

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
