import type { Prisma } from "@prisma/client";

/**
 * Mining pilot slice 6: the one owner of "change only the version you saw".
 *
 * Every change and removal of a training record carries the record's
 * `updatedAt` as the caller last read it. The write matches it in the same
 * statement, so a record someone else changed in the meantime is never
 * silently overwritten or removed: the write touches nothing and the route
 * answers 409.
 *
 * The match is a one-millisecond window, not equality: the value the client
 * holds is an ISO string with millisecond precision, and Postgres keeps
 * microseconds.
 */
export function parseExpectedVersion(value: unknown): Date | null {
  if (typeof value !== "string" || value.length > 40) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(value)) {
    return null;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function versionWhere(
  expected: Date,
): Prisma.StaffTrainingRecordWhereInput {
  return {
    updatedAt: { gte: expected, lt: new Date(expected.getTime() + 1) },
  };
}
