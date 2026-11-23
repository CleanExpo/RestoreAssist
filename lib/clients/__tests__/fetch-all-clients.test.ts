import { describe, expect, it, vi } from "vitest";
import {
  ClientsLoadError,
  MAX_CLIENT_PAGES,
  fetchAllClients,
} from "../fetch-all-clients";

// RA-8091: a mocked /api/clients holding 25 clients, newest first, served
// 10 per page over 3 pages whatever limit the caller asks for — the shape the
// route returned to every caller that sent no limit.
const CLIENTS = Array.from({ length: 25 }, (_, i) => ({
  id: `c${25 - i}`,
  name: `Client ${25 - i}`,
  email: `client${25 - i}@example.test`,
}));

function pagedFetch(pageSize = 10) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), "http://localhost");
    expect(url.pathname).toBe("/api/clients");
    const page = Number(url.searchParams.get("page") || "1");
    const slice = CLIENTS.slice((page - 1) * pageSize, page * pageSize);
    return new Response(
      JSON.stringify({
        clients: slice,
        pagination: {
          page,
          limit: pageSize,
          total: CLIENTS.length,
          pages: Math.ceil(CLIENTS.length / pageSize),
        },
      }),
      { status: 200 },
    );
  });
}

describe("fetchAllClients (RA-8091)", () => {
  it("follows pagination.pages and returns all 25 clients, oldest included", async () => {
    const fetchImpl = pagedFetch();
    const clients = await fetchAllClients<{ id: string; name: string }>({
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(clients).toHaveLength(25);
    // The oldest client sits on page 3; a single-page read never sees it.
    expect(clients.find((c) => c.name === "Client 1")).toBeTruthy();
  });

  it("asks the route for its largest page", async () => {
    const fetchImpl = pagedFetch();
    await fetchAllClients({ fetchImpl: fetchImpl as unknown as typeof fetch });
    const firstUrl = new URL(String(fetchImpl.mock.calls[0][0]), "http://x");
    expect(firstUrl.searchParams.get("limit")).toBe("100");
    expect(firstUrl.searchParams.get("page")).toBe("1");
  });

  it("drops a client repeated across a page boundary", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const page = Number(new URL(String(input), "http://x").searchParams.get("page"));
      const clients = page === 1 ? [{ id: "a" }, { id: "b" }] : [{ id: "b" }, { id: "c" }];
      return new Response(JSON.stringify({ clients, pagination: { pages: 2 } }));
    });
    const clients = await fetchAllClients<{ id: string }>({
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(clients.map((c) => c.id)).toEqual(["a", "b", "c"]);
  });

  it("throws on a non-OK response instead of returning an empty list", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 401 }));
    await expect(
      fetchAllClients({ fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toBeInstanceOf(ClientsLoadError);
  });

  it("throws when a later page fails, rather than returning a short list", async () => {
    const ok = pagedFetch();
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const page = new URL(String(input), "http://x").searchParams.get("page");
      return page === "2" ? new Response("{}", { status: 500 }) : ok(input);
    });
    await expect(
      fetchAllClients({ fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toThrow(/HTTP 500/);
  });

  it("throws on a malformed body", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ error: "x" })));
    await expect(
      fetchAllClients({ fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toThrow(/Invalid clients response/);
  });

  it("refuses rather than silently truncating past the page ceiling", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ clients: [], pagination: { pages: MAX_CLIENT_PAGES + 1 } }),
        ),
    );
    await expect(
      fetchAllClients({ fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toThrow(/Too many clients/);
  });
});
