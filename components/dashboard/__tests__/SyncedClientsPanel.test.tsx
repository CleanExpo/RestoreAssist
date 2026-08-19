// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SyncedClientsPanel } from "../SyncedClientsPanel";
import { DASHBOARD_LIST_PAGE_SIZE } from "../ListPagination";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

function pagePayload(overrides: {
  page?: number;
  total?: number;
  items?: Array<{ id: string; name: string }>;
}) {
  const page = overrides.page ?? 1;
  const total = overrides.total ?? 25;
  const pageSize = DASHBOARD_LIST_PAGE_SIZE;
  const items = (overrides.items ?? [{ id: "c1", name: "Client One" }]).map(
    (row) => ({
      id: row.id,
      externalId: row.id,
      source: "xero" as const,
      name: row.name,
      email: null,
      phone: null,
      address: null,
      importedNativeId: null,
      jobCount: null,
      lastSyncedAt: null,
      canImport: false,
    }),
  );
  return {
    source: "xero",
    connected: true,
    items,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize) || 0,
    },
  };
}

function mockPagedFetch() {
  fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input);
    const page = Number(new URL(url, "http://localhost").searchParams.get("page") || "1");
    const source =
      new URL(url, "http://localhost").searchParams.get("source") || "xero";
    return {
      ok: true,
      json: async () =>
        pagePayload({
          page,
          total: 25,
          items: [
            {
              id: `${source}-p${page}`,
              name: `${source} page ${page} client`,
            },
          ],
        }),
    };
  });
}

describe("SyncedClientsPanel pagination", () => {
  it("requests pageSize and shows pager when total exceeds page size", async () => {
    mockPagedFetch();

    render(<SyncedClientsPanel source="xero" searchTerm="" />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toContain("page=1");
    expect(url).toContain(`pageSize=${DASHBOARD_LIST_PAGE_SIZE}`);

    expect(await screen.findByLabelText("Pagination")).toBeInTheDocument();
    expect(screen.getByText(/Showing 1–20 of 25 clients/)).toBeInTheDocument();
  });

  it("fetches the next page when Next is clicked", async () => {
    mockPagedFetch();

    render(<SyncedClientsPanel source="xero" searchTerm="" />);
    expect(
      (await screen.findAllByText(/xero page 1 client/i)).length,
    ).toBeGreaterThan(0);

    fireEvent.click(screen.getByLabelText("Next page"));

    await waitFor(() => {
      const urls = fetchMock.mock.calls.map((c) => String(c[0]));
      expect(urls.some((u) => u.includes("page=2"))).toBe(true);
    });
    expect(
      (await screen.findAllByText(/xero page 2 client/i)).length,
    ).toBeGreaterThan(0);
  });

  it("resets to page 1 when source changes", async () => {
    mockPagedFetch();

    const { rerender } = render(
      <SyncedClientsPanel source="xero" searchTerm="" />,
    );
    await screen.findByLabelText("Pagination");
    fireEvent.click(screen.getByLabelText("Next page"));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some((c) => String(c[0]).includes("page=2")),
      ).toBe(true);
    });

    fetchMock.mockClear();
    mockPagedFetch();

    rerender(<SyncedClientsPanel source="ascora" searchTerm="" />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
      const urls = fetchMock.mock.calls.map((c) => String(c[0]));
      expect(urls.every((u) => u.includes("source=ascora"))).toBe(true);
      expect(urls.every((u) => u.includes("page=1"))).toBe(true);
    });

    expect(
      (await screen.findAllByText(/ascora page 1 client/i)).length,
    ).toBeGreaterThan(0);
  });
});
