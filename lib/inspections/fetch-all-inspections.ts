// RA-8092 — GET /api/inspections is a paged list (20 rows by default, capped at
// 100). The jobs list needs every inspection in the caller's reach, because it
// searches, counts and selects in the browser; asking once silently held only
// the newest 20. This walks `pagination.pages` instead. The route, its tenancy
// and its cap are unchanged.

const PAGE_LIMIT = 100;
// 10,000 jobs. Past this the loader fails loudly rather than truncating.
const MAX_PAGES = 100;

interface InspectionsPage {
  inspections?: unknown;
  pagination?: { pages?: unknown };
}

/**
 * Load every inspection `baseUrl` reaches by walking all of its pages.
 * `baseUrl` keeps its own filters (`assignee=me`, `status=active`); `page` and
 * `limit` are set here. Throws on a non-ok response, a malformed body, or more
 * than MAX_PAGES pages: a failed or partial load must never look like the
 * whole list.
 */
export async function fetchAllInspections<T extends { id: string }>(
  baseUrl: string,
  options: { signal?: AbortSignal } = {},
): Promise<T[]> {
  const [path, query = ""] = baseUrl.split("?");
  const byId = new Map<string, T>();
  let page = 1;
  let pages = 1;
  do {
    const params = new URLSearchParams(query);
    params.set("page", String(page));
    params.set("limit", String(PAGE_LIMIT));
    const response = await fetch(`${path}?${params}`, {
      credentials: "include",
      cache: "no-store",
      signal: options.signal,
    });
    if (!response.ok) {
      throw new Error(`Failed to load inspections (HTTP ${response.status})`);
    }
    const data = (await response.json()) as InspectionsPage;
    if (!Array.isArray(data.inspections)) {
      throw new Error("Invalid inspections response");
    }
    // Keyed by id: a job created mid-walk shifts the offset and would
    // otherwise appear twice.
    for (const inspection of data.inspections as T[]) {
      if (!byId.has(inspection.id)) byId.set(inspection.id, inspection);
    }
    const reported = Number(data.pagination?.pages);
    pages = Number.isFinite(reported) && reported > 0 ? reported : 1;
    if (pages > MAX_PAGES) {
      throw new Error("Too many inspections to load in one list");
    }
    page += 1;
  } while (page <= pages);
  return [...byId.values()];
}
