// RA-8091 — GET /api/clients returns one page (default 10, capped at 100 by
// RA-1307). Callers that need every client in reach (the Clients page and the
// client pickers) must follow `pagination.pages`, or they silently hold only
// the newest page. This is the one place that does it.

const PAGE_LIMIT = 100;
// 10,000 clients. Past this the loader fails loudly rather than truncating.
const MAX_PAGES = 100;

interface ClientsPage {
  clients?: unknown;
  pagination?: { pages?: unknown };
}

/**
 * Load every client the caller can reach by walking all pages of
 * `/api/clients`. Throws on a non-ok response, a malformed body, or more
 * pages than MAX_PAGES — a failed load must never look like an empty list.
 */
export async function fetchAllClients<T extends { id: string }>(
  options: { signal?: AbortSignal } = {},
): Promise<T[]> {
  const byId = new Map<string, T>();
  let page = 1;
  let pages = 1;
  do {
    const response = await fetch(
      `/api/clients?page=${page}&limit=${PAGE_LIMIT}`,
      { cache: "no-store", signal: options.signal },
    );
    if (!response.ok) {
      throw new Error(`Failed to load clients (HTTP ${response.status})`);
    }
    const data = (await response.json()) as ClientsPage;
    if (!Array.isArray(data.clients)) {
      throw new Error("Invalid clients response");
    }
    // Keyed by id: a client created mid-walk shifts the offset and would
    // otherwise appear twice.
    for (const client of data.clients as T[]) {
      if (!byId.has(client.id)) byId.set(client.id, client);
    }
    const reported = Number(data.pagination?.pages);
    pages = Number.isFinite(reported) && reported > 0 ? reported : 1;
    if (pages > MAX_PAGES) {
      throw new Error("Too many clients to load in one list");
    }
    page += 1;
  } while (page <= pages);
  return [...byId.values()];
}
