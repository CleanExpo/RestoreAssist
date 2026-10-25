/**
 * RA-8091 — the Clients page and client pickers only ever saw the newest page
 * of /api/clients. The loader must walk every page the API reports.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchAllClients } from "@/lib/clients/fetch-all-clients";

type TestClient = { id: string; name: string };

const CLIENTS: TestClient[] = Array.from({ length: 25 }, (_, i) => ({
  id: `c${i + 1}`,
  name: `Client ${i + 1}`,
}));

// Serves 10 per page regardless of the requested limit, the way the API's
// default page size did, so the loader is forced to follow pagination.pages.
function mockClientsApi(pageSize = 10) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), "http://localhost");
    const page = Number(url.searchParams.get("page") ?? "1");
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
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchAllClients", () => {
  it("returns all 25 clients across 3 pages, including the 25th", async () => {
    const fetchMock = mockClientsApi();
    const clients = await fetchAllClients<TestClient>();
    expect(clients).toHaveLength(25);
    expect(clients.map((c) => c.name)).toContain("Client 25");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not duplicate a client that shifts across a page boundary", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const page = Number(
          new URL(String(input), "http://localhost").searchParams.get("page"),
        );
        const clients =
          page === 1 ? [CLIENTS[0], CLIENTS[1]] : [CLIENTS[1], CLIENTS[2]];
        return new Response(
          JSON.stringify({ clients, pagination: { pages: 2 } }),
          { status: 200 },
        );
      }),
    );
    const clients = await fetchAllClients<TestClient>();
    expect(clients.map((c) => c.id)).toEqual(["c1", "c2", "c3"]);
  });

  it("throws on a non-ok response instead of returning an empty list", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 500 })),
    );
    await expect(fetchAllClients()).rejects.toThrow(/HTTP 500/);
  });

  it("throws on a malformed body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({}), { status: 200 })),
    );
    await expect(fetchAllClients()).rejects.toThrow(/Invalid clients response/);
  });
});
