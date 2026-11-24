import type { Prisma } from "@prisma/client";
import { formatDateOnly, parseDateOnly } from "@/lib/training/record-input";

/**
 * Mining pilot slice 6: the one owner of paging for the training register.
 *
 * Every list the register shows (records, and the staff picker) is read a page
 * at a time with a keyset cursor, so no record and no staff member is out of
 * reach however large the organisation is. A cursor only narrows a query that
 * already carries the caller's scope; it never widens it.
 */

export const PAGE_SIZE = 100;

/** Records: newest completion first, then id. Cursor = "<YYYY-MM-DD>_<id>". */
export function recordCursor(row: { completedOn: Date; id: string }): string {
  return `${formatDateOnly(row.completedOn)}_${row.id}`;
}

export function recordCursorWhere(
  cursor: string | null,
): Prisma.StaffTrainingRecordWhereInput | null | undefined {
  if (!cursor) return undefined;
  const sep = cursor.indexOf("_");
  if (sep !== 10) return null;
  const day = parseDateOnly(cursor.slice(0, sep));
  const id = cursor.slice(sep + 1);
  if (!day || !id || id.length > 64) return null;
  return {
    OR: [
      { completedOn: { lt: day } },
      { completedOn: day, id: { gt: id } },
    ],
  };
}

export const recordOrderBy: Prisma.StaffTrainingRecordOrderByWithRelationInput[] = [
  { completedOn: "desc" },
  { id: "asc" },
];

/** Staff: by id. Cursor = the last id seen. */
export function staffCursorWhere(
  cursor: string | null,
): Prisma.UserWhereInput | null | undefined {
  if (!cursor) return undefined;
  if (cursor.length > 64) return null;
  return { id: { gt: cursor } };
}

/** Read PAGE_SIZE + 1 rows; this splits them into the page and the next cursor. */
export function splitPage<T>(
  rows: T[],
  cursorOf: (row: T) => string,
): { page: T[]; nextCursor: string | null } {
  if (rows.length <= PAGE_SIZE) return { page: rows, nextCursor: null };
  const page = rows.slice(0, PAGE_SIZE);
  return { page, nextCursor: cursorOf(page[page.length - 1]) };
}
