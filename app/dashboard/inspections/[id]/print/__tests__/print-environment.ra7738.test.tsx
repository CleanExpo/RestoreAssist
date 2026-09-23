// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { Suspense } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import InspectionPrintPage from "@/app/dashboard/inspections/[id]/print/page";

// RA-7738: GET /api/inspections/[id] returns environmentalData as an ARRAY
// (EnvironmentalData[] since RA-1383). The print view read it as one object,
// so the insurer printout showed "°C", "%" and "Not recorded" with no numbers.

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function inspectionWith(environmentalData: unknown) {
  return {
    id: "insp-1",
    inspectionNumber: "NIR-2026-09-TEST01",
    propertyAddress: "1 Test St",
    propertyPostcode: "4000",
    technicianName: "Tech",
    status: "SUBMITTED",
    claimType: "WATER",
    createdAt: "2026-09-20T00:00:00.000Z",
    submittedAt: null,
    environmentalData,
    moistureReadings: [],
    affectedAreas: [],
    scopeItems: [],
    classifications: [],
    costEstimates: [],
  };
}

async function renderPrint(environmentalData: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({ inspection: inspectionWith(environmentalData) }),
    })),
  );
  const params = Promise.resolve({ id: "insp-1" });
  await act(async () => {
    render(
      <Suspense fallback={null}>
        <InspectionPrintPage params={params} />
      </Suspense>,
    );
  });
  const heading = await screen.findByText("Environmental Conditions");
  return heading.closest(".print-card") as HTMLElement;
}

function rowValue(section: HTMLElement, label: string): string {
  const cell = within(section).getByText(label);
  return (cell.nextElementSibling?.textContent ?? "").trim();
}

describe("print view environmental conditions (RA-7738)", () => {
  it("shows the LATEST reading from the array the API returns", async () => {
    const section = await renderPrint([
      {
        id: "old",
        ambientTemperature: 30,
        humidityLevel: 80,
        dewPoint: 26,
        airCirculation: false,
        weatherConditions: "Storm",
        notes: "old",
        recordedAt: "2026-09-20T01:00:00.000Z",
      },
      {
        id: "new",
        ambientTemperature: 22,
        humidityLevel: 65,
        dewPoint: 15,
        airCirculation: true,
        weatherConditions: "Fine",
        notes: "latest",
        recordedAt: "2026-09-22T01:00:00.000Z",
      },
    ]);
    expect(rowValue(section, "Internal Temperature")).toBe("22°C");
    expect(rowValue(section, "Relative Humidity")).toBe("65%");
    expect(rowValue(section, "Dew Point")).toBe("15.0°C");
    expect(rowValue(section, "Air Circulation")).toBe("Active");
    expect(rowValue(section, "Weather Conditions")).toBe("Fine");
    expect(rowValue(section, "Notes")).toBe("latest");
  });

  it('shows "—" only for a value that is genuinely null', async () => {
    const section = await renderPrint([
      {
        id: "r",
        ambientTemperature: 21,
        humidityLevel: null,
        dewPoint: null,
        airCirculation: true,
        weatherConditions: null,
        notes: null,
        recordedAt: "2026-09-22T01:00:00.000Z",
      },
    ]);
    expect(rowValue(section, "Internal Temperature")).toBe("21°C");
    expect(rowValue(section, "Relative Humidity")).toBe("—");
    expect(rowValue(section, "Dew Point")).toBe("—");
  });

  it("omits the section when there are no readings at all", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ inspection: inspectionWith([]) }),
      })),
    );
    await act(async () => {
      render(
        <Suspense fallback={null}>
          <InspectionPrintPage params={Promise.resolve({ id: "insp-1" })} />
        </Suspense>,
      );
    });
    await screen.findAllByText("NIR-2026-09-TEST01", { exact: false });
    expect(screen.queryByText("Environmental Conditions")).toBeNull();
  });
});
