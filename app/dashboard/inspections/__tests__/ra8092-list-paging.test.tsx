// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

// RA-8092: the jobs list fetched /api/inspections with no paging, search or
// filter params, so the route's default page (20 rows) was all it ever had.
// Search, the status pills, "All (n)" and Select all then worked over those
// 20, and nothing on screen said the list was cut short.

const requested = vi.hoisted(() => ({ urls: [] as string[] }));

// 25 inspections, newest first, the way the route orders them.
const all = Array.from({ length: 25 }, (_, i) => {
  const n = 25 - i;
  return {
    id: `insp-${n}`,
    inspectionNumber: `NIR-2026-${String(n).padStart(4, "0")}`,
    propertyAddress: `${n} Test St`,
    propertyPostcode: "4000",
    technicianName: "Tech",
    status: n % 2 === 0 ? "SUBMITTED" : "DRAFT",
    createdAt: new Date(Date.UTC(2026, 8, n)).toISOString(),
    submittedAt: null,
    processedAt: null,
    moistureReadings: [],
    affectedAreas: [],
    classifications: [],
    photos: [],
    environmentalData: [],
  };
});

// A stand-in for GET /api/inspections: honours page, limit, search and
// status, and answers with the route's `pagination` shape.
function serve(url: string) {
  const params = new URL(url, "http://localhost").searchParams;
  const page = Number(params.get("page") || "1");
  const limit = Math.min(Number(params.get("limit") || "20"), 100);
  const search = params.get("search")?.toLowerCase();
  const status = params.get("status");
  const matching = all.filter(
    (i) =>
      (!search || i.inspectionNumber.toLowerCase().includes(search)) &&
      (!status || i.status === status),
  );
  return {
    inspections: matching.slice((page - 1) * limit, page * limit),
    pagination: {
      page,
      limit,
      total: matching.length,
      pages: Math.ceil(matching.length / limit),
    },
  };
}

vi.mock("@/lib/hooks/useFetch", () => ({
  useFetch: (url: string | null) => {
    if (url) requested.urls.push(url);
    return {
      data: url ? serve(url) : null,
      loading: false,
      error: null,
      refetch: () => {},
      refresh: async () => true,
    };
  },
}));
vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { user: { id: "m-1", role: "MANAGER" } },
    status: "authenticated",
  }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import InspectionsPage from "@/app/dashboard/inspections/page";

afterEach(() => {
  cleanup();
  requested.urls = [];
});

describe("jobs list reaches every inspection (RA-8092)", () => {
  it("shows the real total and pages to the 25th, oldest inspection", () => {
    render(<InspectionsPage />);
    expect(screen.getByRole("button", { name: /^All \(25\)$/ })).toBeInTheDocument();
    expect(screen.queryByText("NIR-2026-0001")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /next page/i }));

    expect(screen.getByText("NIR-2026-0001")).toBeInTheDocument();
    expect(requested.urls.at(-1)).toMatch(/[?&]page=2(&|$)/);
  });

  it("finds an inspection older than the newest 20 by searching the server", async () => {
    render(<InspectionsPage />);
    fireEvent.change(screen.getByLabelText("Search inspections"), {
      target: { value: "NIR-2026-0001" },
    });

    await waitFor(() =>
      expect(screen.getByText("NIR-2026-0001")).toBeInTheDocument(),
    );
    expect(requested.urls.at(-1)).toMatch(/[?&]search=NIR-2026-0001(&|$)/);
  });

  it("sends the status filter to the server instead of filtering 20 rows", () => {
    render(<InspectionsPage />);
    fireEvent.click(screen.getByRole("button", { name: /^Draft$/ }));
    expect(requested.urls.at(-1)).toMatch(/[?&]status=DRAFT(&|$)/);
  });

  it("says Select all acts on the rows on this page, out of the total", () => {
    render(<InspectionsPage />);
    expect(
      screen.getByText(/Select all on this page \(20 of 25\)/),
    ).toBeInTheDocument();
  });
});
