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

// RA-8092: GET /api/inspections is paged (20 rows by default, 100 at most).
// The jobs list asked once with no page or limit, so a business with more than
// 20 jobs never saw the older ones: search, counts and Select all covered the
// newest 20 only. This stub behaves like the route: newest first, `page` and
// `limit` honoured, 20 when no limit is sent, capped at 100.

const TOTAL = 25;
const rows = Array.from({ length: TOTAL }, (_, i) => {
  const n = TOTAL - i; // newest first: NIR-0025 ... NIR-0001
  const id = String(n).padStart(4, "0");
  return {
    id: `insp-${id}`,
    inspectionNumber: `NIR-${id}`,
    propertyAddress: `${n} Test St`,
    propertyPostcode: "4000",
    technicianName: "Tech",
    technicianId: null,
    status: n === 1 ? "COMPLETED" : "DRAFT",
    inspectionDate: null,
    createdAt: `2026-09-${String(n).padStart(2, "0")}T00:00:00.000Z`,
    submittedAt: null,
    processedAt: null,
    moistureReadings: [],
    affectedAreas: [],
    classifications: [],
    photos: [],
    environmentalData: [],
  };
});

function routeStub(input: RequestInfo | URL) {
  const url = new URL(String(input), "http://localhost");
  if (url.pathname !== "/api/inspections") {
    return new Response(JSON.stringify({}), { status: 404 });
  }
  const page = Number(url.searchParams.get("page") || "1");
  const limit = Math.min(Number(url.searchParams.get("limit") || "20"), 100);
  const slice = rows.slice((page - 1) * limit, page * limit);
  return new Response(
    JSON.stringify({
      inspections: slice,
      nextCursor: null,
      pagination: {
        page,
        limit,
        total: TOTAL,
        pages: Math.ceil(TOTAL / limit),
      },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

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

describe("jobs list reaches every job (RA-8092)", () => {
  it("counts all 25 jobs, not the newest 20", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input) => routeStub(input)));
    render(<InspectionsPage />);
    expect(
      await screen.findByRole("button", { name: `All (${TOTAL})` }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: `Select all (${TOTAL})` }),
    ).toBeInTheDocument();
    // The one completed job is the oldest; its pill only exists if it loaded.
    expect(
      screen.getByRole("button", { name: "Completed (1)" }),
    ).toBeInTheDocument();
  });

  it("finds the oldest job by search", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input) => routeStub(input)));
    render(<InspectionsPage />);
    await waitFor(() =>
      expect(screen.getAllByText(/^NIR-00/).length).toBeGreaterThan(0),
    );
    fireEvent.change(screen.getByPlaceholderText(/Search by inspection/), {
      target: { value: "NIR-0001" },
    });
    expect(await screen.findByText("NIR-0001")).toBeInTheDocument();
    expect(screen.queryByText("No matching inspections")).toBeNull();
  });
});
