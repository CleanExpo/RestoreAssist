/**
 * RA-8446: a tiny in-memory stand-in for prisma.integration.findMany that
 * honours the `where` shapes the webhook routes send (equality, `in`, OR, and
 * the credential-presence test). A route that filters on raw status is then
 * tested against what SQL would really return, not a canned row.
 */
export type FakeIntegrationRow = Record<string, unknown> & { id: string };

function matchesValue(actual: unknown, condition: unknown): boolean {
  if (condition && typeof condition === "object" && !Array.isArray(condition) && !(condition instanceof Date)) {
    const c = condition as { in?: unknown[]; not?: unknown; notIn?: unknown[] };
    if (c.in && !c.in.includes(actual)) return false;
    if ("not" in c && actual === c.not) return false;
    if (c.notIn && c.notIn.includes(actual)) return false;
    return true;
  }
  return actual === condition;
}

export function matchesWhere(row: Record<string, unknown>, where: Record<string, unknown> = {}): boolean {
  return Object.entries(where).every(([key, condition]) => {
    if (key === "OR") return (condition as Record<string, unknown>[]).some(w => matchesWhere(row, w));
    if (key === "AND") return (condition as Record<string, unknown>[]).every(w => matchesWhere(row, w));
    return matchesValue(row[key] ?? null, condition);
  });
}

/** findMany over `rows`: applies where, select and take. */
export function fakeFindMany(rows: readonly FakeIntegrationRow[]) {
  return ({ where, select, take }: { where?: Record<string, unknown>; select?: Record<string, boolean>; take?: number } = {}) => {
    const hits = rows.filter(row => matchesWhere(row, where)).slice(0, take ?? rows.length);
    return Promise.resolve(select
      ? hits.map(row => Object.fromEntries(Object.keys(select).map(key => [key, row[key] ?? null])))
      : hits);
  };
}

/** findFirst over `rows`, for routes (or older code) that read one row. */
export function fakeFindFirst(rows: readonly FakeIntegrationRow[]) {
  const findMany = fakeFindMany(rows);
  return async (args: Parameters<ReturnType<typeof fakeFindMany>>[0] = {}) => (await findMany({ ...args, take: 1 }))[0] ?? null;
}
