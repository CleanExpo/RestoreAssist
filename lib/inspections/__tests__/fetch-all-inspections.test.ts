import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchAllInspections } from "@/lib/inspections/fetch-all-inspections";

// RA-8092: the loader must follow `pagination.pages`. This stub ignores the
// requested limit and serves 20 per page, so 25 jobs arrive over two pages.

const rows = Array.from({ length: 25 }, (_, i) => ({ id: `insp-${25 - i}` }));

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function twoPages(input: RequestInfo | URL) {
  const url = new URL(String(input), "http://localhost");
  const page = Number(url.searchParams.get("page") || "1");
  return json({
    inspections: rows.slice((page - 1) * 20, page * 20),
    pagination: { page, limit: 20, total: 25, pages: 2 },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchAllInspections (RA-8092)", () => {
  it("walks both pages and returns all 25, the oldest included", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => twoPages(input));
    vi.stubGlobal("fetch", fetchMock);
    const all = await fetchAllInspections<{ id: string }>("/api/inspections");
    expect(all).toHaveLength(25);
    expect(all.at(-1)?.id).toBe("insp-1");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps the caller's filters and sets page and limit", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => twoPages(input));
    vi.stubGlobal("fetch", fetchMock);
    await fetchAllInspections("/api/inspections?assignee=me&status=active");
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls).toEqual([
      "/api/inspections?assignee=me&status=active&page=1&limit=100",
      "/api/inspections?assignee=me&status=active&page=2&limit=100",
    ]);
  });

  it("lists a job once when a new job shifts the pages mid-walk", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const page = Number(
          new URL(String(input), "http://localhost").searchParams.get("page"),
        );
        // Page 2 repeats the last row of page 1, as an insert would cause.
        return json({
          inspections: page === 1 ? rows.slice(0, 20) : rows.slice(19),
          pagination: { pages: 2 },
        });
      }),
    );
    const all = await fetchAllInspections<{ id: string }>("/api/inspections");
    expect(all).toHaveLength(25);
  });

  it("treats a response without pagination as a single page", async () => {
    const fetchMock = vi.fn(async () => json({ inspections: rows }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await fetchAllInspections("/api/inspections")).toHaveLength(25);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws on a refused page rather than returning part of the list", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) =>
        String(input).includes("page=2") ? json({}, 500) : twoPages(input),
      ),
    );
    await expect(fetchAllInspections("/api/inspections")).rejects.toThrow(
      "HTTP 500",
    );
  });

  it("throws on a malformed body", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ inspections: null })));
    await expect(fetchAllInspections("/api/inspections")).rejects.toThrow(
      "Invalid inspections response",
    );
  });

  it("refuses more pages than it will load", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ inspections: [], pagination: { pages: 101 } })),
    );
    await expect(fetchAllInspections("/api/inspections")).rejects.toThrow(
      "Too many inspections",
    );
  });
});
