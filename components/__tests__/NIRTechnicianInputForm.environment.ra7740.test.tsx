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

// RA-7740: GET /api/inspections?reportId= returns environmentalData as an
// ARRAY (EnvironmentalData[] since RA-1383). The form put that list straight
// into single-reading state, so the temperature/humidity fields went blank,
// `environmentalData.dewPoint.toFixed(1)` threw, and the draft save sent the
// list spread into an object instead of one reading.

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

const READINGS = [
  {
    id: "old",
    ambientTemperature: 30,
    humidityLevel: 80,
    dewPoint: 26,
    airCirculation: false,
    weatherConditions: "Storm",
    recordedAt: "2026-09-20T01:00:00.000Z",
  },
  {
    id: "new",
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

describe("NIRTechnicianInputForm environmental hydration (RA-7740)", () => {
  it("fills the fields from the LATEST reading in the list", async () => {
    await renderLoaded(READINGS);
    await waitFor(() =>
      expect(field("Ambient Temperature (°C)").value).toBe("21"),
    );
    expect(field("Humidity Level (%)").value).toBe("55");
    const dew = field("Dew Point (°C)").value;
    expect(dew).not.toMatch(/NaN/);
    expect(Number(dew)).not.toBeNaN();
  });

  it("keeps the defaults when the list is empty", async () => {
    await renderLoaded([]);
    await waitFor(() =>
      expect(field("Ambient Temperature (°C)").value).toBe("25"),
    );
    expect(field("Humidity Level (%)").value).toBe("60");
    expect(field("Dew Point (°C)").value).not.toMatch(/NaN/);
  });

  it("saves ONE reading object with the latest values in the draft", async () => {
    const calls = await renderLoaded(READINGS);
    await waitFor(() =>
      expect(field("Ambient Temperature (°C)").value).toBe("21"),
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save Draft" }));
    });
    const draft = await waitFor(() => {
      const c = calls.find((x) => x.url.endsWith("/draft-snapshot"));
      if (!c) throw new Error("draft-snapshot not called");
      return c;
    });
    const body = JSON.parse(String(draft.init?.body));
    expect(Array.isArray(body.environmentalData)).toBe(false);
    expect(body.environmentalData).not.toHaveProperty("0");
    expect(body.environmentalData.ambientTemperature).toBe(21);
    expect(body.environmentalData.humidityLevel).toBe(55);
    expect(body.environmentalData.airCirculation).toBe(true);
    expect(Number.isNaN(body.environmentalData.dewPoint)).toBe(false);
  });
});
