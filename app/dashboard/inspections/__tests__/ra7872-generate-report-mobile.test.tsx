// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

// RA-7872: the "Generate report" action carried `hidden sm:flex`, so below
// 640px a technician on a phone had no way to start the report.

const fetched = vi.hoisted(() => ({ inspections: [] as unknown[] }));

vi.mock("@/lib/hooks/useFetch", () => ({
  useFetch: () => ({
    data: fetched,
    loading: false,
    error: null,
    refetch: () => {},
  }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import InspectionsPage from "@/app/dashboard/inspections/page";

afterEach(cleanup);

describe("Generate report on phones (RA-7872)", () => {
  it("renders the Generate report button without a mobile-hidden class", () => {
    fetched.inspections = [
      {
        id: "insp-1",
        inspectionNumber: "NIR-2026-0001",
        propertyAddress: "1 Test St",
        propertyPostcode: "4000",
        technicianName: "Tech",
        status: "CLASSIFIED",
        createdAt: "2026-09-20T00:00:00.000Z",
        submittedAt: null,
        processedAt: null,
        moistureReadings: [],
        affectedAreas: [],
        classifications: [],
        photos: [],
        environmentalData: [],
      },
    ];
    render(<InspectionsPage />);
    const button = screen.getByTitle("Generate report from NIR-2026-0001");
    const classes = button.className.split(/\s+/);
    // Tailwind is mobile-first: an unprefixed `hidden` applies below 640px.
    expect(classes).not.toContain("hidden");
    expect(classes).toContain("flex");
  });
});
