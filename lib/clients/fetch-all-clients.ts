/**
 * RA-8091 — load every client in the caller's reach from `GET /api/clients`.
 *
 * The route returns one page (default 10 rows, capped at 100 by RA-1307) and a
 * `pagination` block. Callers that read only `data.clients` silently held the
 * 10 newest clients. This is the one place that follows `pagination.pages`;
 * call it, never re-implement the loop.
 *
 * Fails loudly: a non-OK response, a malformed body or a page count above
 * MAX_CLIENT_PAGES throws, so a caller can show an error instead of a list that
 * looks complete but is not.
 */

/** Largest page the route serves (RA-1307 cap in app/api/clients/route.ts). */
export const CLIENTS_PAGE_LIMIT = 100;

/** 100 pages x 100 rows = 10,000 clients before we refuse rather than truncate. */
export const MAX_CLIENT_PAGES = 100;

export class ClientsLoadError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ClientsLoadError";
  }
}

interface ClientsPage<T> {
  clients: T[];
  pages: number;
}

async function fetchClientsPage<T>(
  page: number,
  fetchImpl: typeof fetch,
  signal?: AbortSignal,
): Promise<ClientsPage<T>> {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(CLIENTS_PAGE_LIMIT),
  });
  const res = await fetchImpl(`/api/clients?${params.toString()}`, {
    cache: "no-store",
    signal,
  });
  if (!res.ok) {
    throw new ClientsLoadError(
      `Could not load clients (HTTP ${res.status})`,
      res.status,
    );
  }
  const data = await res.json();
  if (!data || !Array.isArray(data.clients)) {
    throw new ClientsLoadError("Invalid clients response");
  }
  const pages = Number(data.pagination?.pages);
  return {
    clients: data.clients as T[],
    // A response with no pagination block is a single page.
    pages: Number.isFinite(pages) && pages > 0 ? Math.floor(pages) : 1,
  };
}

export async function fetchAllClients<T = Record<string, unknown>>(
  options: { signal?: AbortSignal; fetchImpl?: typeof fetch } = {},
): Promise<T[]> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const first = await fetchClientsPage<T>(1, fetchImpl, options.signal);
  if (first.pages > MAX_CLIENT_PAGES) {
    throw new ClientsLoadError(
      `Too many clients to load at once (${first.pages} pages)`,
    );
  }
  const all = [...first.clients];
  for (let page = 2; page <= first.pages; page++) {
    const next = await fetchClientsPage<T>(page, fetchImpl, options.signal);
    if (next.clients.length === 0) break;
    all.push(...next.clients);
  }
  // A client created between page reads shifts the newest-first order and can
  // repeat a row across a page boundary; keep the first copy.
  const seen = new Set<unknown>();
  return all.filter((c) => {
    const id = (c as { id?: unknown }).id;
    if (id === undefined) return true;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}
