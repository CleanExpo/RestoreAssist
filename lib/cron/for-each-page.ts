import { reportError } from "@/lib/observability";

/**
 * The one way a cron reads a set it must visit in full (RA-8453).
 *
 * A fixed `take` on a cron read silently drops every row past the cap, and
 * without an `orderBy` Postgres picks an unspecified subset each run, so the
 * same rows can be skipped forever while the run still records success. This
 * pages by `id` ascending (keyset, `id > last`) until the set is exhausted.
 *
 * Keyset rather than Prisma `cursor`: a Prisma cursor resolves the cursor
 * row's position with a subquery, so if that row is deleted mid-run the next
 * page comes back empty and the read stops early without saying so.
 *
 * The total ceiling keeps one run bounded. Reaching it is reported through
 * `reportError` and returned as `truncated: true` for the run's metadata —
 * never silent.
 *
 * Guarded by lib/cron/__tests__/cron-findmany-bounded.test.ts: a bare numeric
 * `take` in lib/cron fails that test.
 */

export const CRON_PAGE_SIZE = 500;
export const CRON_MAX_ROWS = 50_000;

/** Spread `where` into the caller's where, and pass the rest to findMany. */
export interface CronPageArgs {
  where: { id?: { gt: string } };
  orderBy: { id: "asc" };
  take: number;
}

export interface CronPageResult {
  rowsRead: number;
  truncated: boolean;
}

export async function forEachPage<T extends { id: string }>(
  label: string,
  fetchPage: (page: CronPageArgs) => Promise<T[]>,
  onPage: (rows: T[]) => Promise<void> | void,
  options: { pageSize?: number; maxRows?: number } = {},
): Promise<CronPageResult> {
  const pageSize = options.pageSize ?? CRON_PAGE_SIZE;
  const maxRows = options.maxRows ?? CRON_MAX_ROWS;
  let rowsRead = 0;
  let lastId: string | undefined;

  while (rowsRead < maxRows) {
    const take = Math.min(pageSize, maxRows - rowsRead);
    const rows = await fetchPage({
      where: lastId === undefined ? {} : { id: { gt: lastId } },
      orderBy: { id: "asc" },
      take,
    });
    if (rows.length === 0) return { rowsRead, truncated: false };
    rowsRead += rows.length;
    lastId = rows[rows.length - 1].id;
    await onPage(rows);
    if (rows.length < take) return { rowsRead, truncated: false };
  }

  // The ceiling was reached on a full page, so more rows may remain.
  reportError(
    new Error(
      `[cron] ${label} stopped at the ${maxRows}-row ceiling; rows past it were not visited this run`,
    ),
    { stage: `cron:${label}`, truncated: true, rowsRead },
  );
  return { rowsRead, truncated: true };
}

/** Reads every page into one array. For sets whose rows are small. */
export async function readAllPages<T extends { id: string }>(
  label: string,
  fetchPage: (page: CronPageArgs) => Promise<T[]>,
  options?: { pageSize?: number; maxRows?: number },
): Promise<{ rows: T[]; truncated: boolean }> {
  const rows: T[] = [];
  const { truncated } = await forEachPage(
    label,
    fetchPage,
    (page) => {
      rows.push(...page);
    },
    options,
  );
  return { rows, truncated };
}
