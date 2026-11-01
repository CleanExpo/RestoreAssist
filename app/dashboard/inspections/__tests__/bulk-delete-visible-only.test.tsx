// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";

// Bulk delete sent every selected id, including jobs a filter had since hidden,
// so confirming could delete a job the owner could no longer see.

const job = (id: string, inspectionNumber: string) => ({
  id,
  inspectionNumber,
  propertyAddress: "1 Test St",
  propertyPostcode: "4000",
  technicianName: "Tech",
  status: "DRAFT",
  createdAt: "2026-09-20T00:00:00.000Z",
  submittedAt: null,
  processedAt: null,
  moistureReadings: [],
  affectedAreas: [],
  classifications: [],
  photos: [],
  environmentalData: [],
});

const fetched = vi.hoisted(() => ({ inspections: [] as unknown[] }));

vi.mock("@/lib/hooks/useFetch", () => ({
  useFetch: () => ({
    data: fetched,
    loading: false,
    error: null,
    refetch: () => {},
  }),
}));
vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { user: { id: "m-1", role: "MANAGER" } },
    status: "authenticated",
  }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

import InspectionsPage from "@/app/dashboard/inspections/page";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("jobs list bulk delete", () => {
  it("only deletes selected jobs the current filter still shows", async () => {
    fetched.inspections = [job("keep", "NIR-AAA"), job("hidden", "NIR-BBB")];
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, deletedCount: 1 }),
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<InspectionsPage />);

    fireEvent.click(screen.getByRole("checkbox", { name: /Select all/ }));
    expect(
      screen.getByRole("button", { name: /Delete selected \(2\)/ }),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/Search by inspection/), {
      target: { value: "NIR-AAA" },
    });
    const del = screen.getByRole("button", { name: /Delete selected \(1\)/ });
    fireEvent.click(del);

    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /delete/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/inspections/bulk-delete");
    expect(JSON.parse(init.body).ids).toEqual(["keep"]);
  });
});
