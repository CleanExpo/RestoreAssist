// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

// RA-7744: the form loaded the saved dew point, then the dew-point effect
// recalculated it from temperature and humidity, so a recorded 11.5 showed as
// 12.0 on load. Decision: a recorded dew point is not recalculated on load; it
// is recalculated only once the technician changes temperature or humidity.

// Heavy canvas / panel children are irrelevant to environmental hydration.
vi.mock("@/components/inspection/MoistureMappingCanvas", () => ({
  default: () => null,
}));
vi.mock("@/components/inspection/ClassificationSuggestion", () => ({
  default: () => null,
}));
vi.mock("@/components/inspection/NIRClaimAssessmentPanel", () => ({
  default: () => null,
}));
vi.mock("@/components/inspection/MakeSafeChecklist", () => ({
  MakeSafeChecklist: () => null,
}));

import NIRTechnicianInputForm from "@/components/NIRTechnicianInputForm";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const SAVED = [
  {
    id: "r1",
    ambientTemperature: 21,
    humidityLevel: 55,
    dewPoint: 11.5,
    airCirculation: true,
    weatherConditions: "Fine",
    recordedAt: "2026-09-22T01:00:00.000Z",
  },
];

function stubFetch(environmentalData: unknown) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    if (url.startsWith("/api/inspections?reportId=")) {
      return {
        ok: true,
        json: async () => ({
          inspection: {
            id: "insp-1",
            claimType: "WATER",
            propertyAddress: "1 Test St",
            propertyPostcode: "4000",
            technicianName: "Tech",
            environmentalData,
            moistureReadings: [],
            affectedAreas: [],
            scopeItems: [],
            photos: [],
          },
        }),
      };
    }
    return { ok: true, json: async () => ({}) };
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

function field(label: string): HTMLInputElement {
  const el = screen.getByText(label).parentElement?.querySelector("input");
  if (!el) throw new Error(`no input for ${label}`);
  return el as HTMLInputElement;
}

async function renderLoaded(environmentalData: unknown) {
  const calls = stubFetch(environmentalData);
  await act(async () => {
    render(<NIRTechnicianInputForm reportId="rep-1" />);
  });
  await screen.findByText("Ambient Temperature (°C)");
  return calls;
}

describe("NIRTechnicianInputForm saved dew point (RA-7744)", () => {
  it("keeps a saved dew point of 11.5 as recorded after load", async () => {
    await renderLoaded(SAVED);
    await waitFor(() =>
      expect(field("Ambient Temperature (°C)").value).toBe("21"),
    );
    expect(field("Humidity Level (%)").value).toBe("55");
    expect(field("Dew Point (°C)").value).toBe("11.5");
  });

  it("recalculates the dew point once the technician edits temperature", async () => {
    await renderLoaded(SAVED);
    await waitFor(() =>
      expect(field("Dew Point (°C)").value).toBe("11.5"),
    );
    await act(async () => {
      fireEvent.change(field("Ambient Temperature (°C)"), {
        target: { value: "25" },
      });
    });
    // The form's formula: 25 - (100 - 55) / 5 = 16.0
    await waitFor(() =>
      expect(field("Dew Point (°C)").value).toBe("16.0"),
    );
  });
});
