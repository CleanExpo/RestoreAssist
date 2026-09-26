// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

// RA-7744: GET /api/inspections includes environmentalData as an ARRAY
// (EnvironmentalData[] since RA-1383). The jobs list read it as one object,
// so every card showed "°C / %" with no numbers.

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

function inspection(environmentalData: unknown) {
  return {
    id: "insp-1",
    inspectionNumber: "NIR-2026-0001",
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
    environmentalData,
  };
}

describe("jobs list environment readings (RA-7744)", () => {
  it("shows the LATEST reading's temperature and humidity from the list", () => {
    fetched.inspections = [
      inspection([
        {
          ambientTemperature: 30,
          humidityLevel: 80,
          dewPoint: 26,
          airCirculation: false,
          recordedAt: "2026-09-20T01:00:00.000Z",
        },
        {
          ambientTemperature: 21,
          humidityLevel: 55,
          dewPoint: 11.5,
          airCirculation: true,
          recordedAt: "2026-09-22T01:00:00.000Z",
        },
      ]),
    ];
    render(<InspectionsPage />);
    expect(screen.getByText(/21°C\s*\/\s*55%/)).toBeInTheDocument();
    expect(screen.queryByText(/30°C/)).not.toBeInTheDocument();
  });

  it("shows no reading chip when the list is empty", () => {
    fetched.inspections = [inspection([])];
    render(<InspectionsPage />);
    expect(screen.queryByText(/°C/)).not.toBeInTheDocument();
  });
});
