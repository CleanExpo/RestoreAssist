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

const notification = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: { user: { id: "synthetic-owner" } } }) }));
vi.mock("react-hot-toast", () => ({ default: notification }));

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
vi.mock("@/components/inspection/ClaimTypePicker", () => ({
  default: ({ onChange }: { onChange: (value: "WATER") => void }) =>
    <button type="button" onClick={() => onChange("WATER")}>Pick Water</button>,
}));

import NIRTechnicianInputForm from "@/components/NIRTechnicianInputForm";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
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
  it("creates a client draft with an unknown date and reuses its retry key", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    let attempts = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url === "/api/inspections") {
        attempts++;
        return attempts === 1
          ? { ok: false, json: async () => ({ error: "Try again" }) }
          : { ok: true, json: async () => ({ inspection: { id: "new-job" } }) };
      }
      return { ok: true, json: async () => ({}) };
    }));
    await act(async () => {
      render(<NIRTechnicianInputForm initialData={{
        propertyAddress: "2 Test St", propertyPostcode: "4000", clientId: "client-1",
      }} />);
    });
    fireEvent.click(screen.getByRole("button", { name: "Pick Water" }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save Draft" })); });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save Draft" })); });
    const creates = calls.filter((call) => call.url === "/api/inspections");
    expect(creates).toHaveLength(2);
    expect(creates[0].init?.headers).toEqual(creates[1].init?.headers);
    expect(JSON.parse(String(creates[0].init?.body))).toMatchObject({
      clientId: "client-1", claimType: "WATER", inspectionDate: null,
    });
    const snapshot = calls.find((call) => call.url.endsWith("/draft-snapshot"));
    expect(JSON.parse(String(snapshot?.init?.body))).toMatchObject({
      inspectionDate: null, moistureReadings: [], affectedAreas: [],
      environmentalData: null,
    });
  });
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

  it("keeps unknown measurements empty and saves no fabricated reading", async () => {
    const calls = await renderLoaded([]);
    await waitFor(() =>
      expect(field("Ambient Temperature (°C)").value).toBe(""),
    );
    expect(field("Humidity Level (%)").value).toBe("");
    expect(field("Dew Point (°C)").value).toBe("");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save Draft" }));
    });
    const draft = await waitFor(() => {
      const call = calls.find((x) => x.url.endsWith("/draft-snapshot"));
      if (!call) throw new Error("draft-snapshot not called");
      return call;
    });
    expect(JSON.parse(String(draft.init?.body)).environmentalData).toBeNull();
  });

  it("does not create an inspection solely because claim type and address were filled", async () => {
    const calls = stubFetch([]);
    await act(async () => {
      render(<NIRTechnicianInputForm initialData={{ propertyAddress: "1 Test St", propertyPostcode: "4000" }} />);
    });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Pick Water" })); });
    expect(screen.getByText(/Save Draft or upload a floor plan/)).toBeInTheDocument();
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 1700)); });
    expect(calls.some((x) => x.url === "/api/inspections" && x.init?.method === "POST")).toBe(false);
  });

  it("rejects a partial measurement and preserves explicit zero readings", async () => {
    const calls = await renderLoaded([]);
    fireEvent.change(field("Ambient Temperature (°C)"), { target: { value: "0" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save Draft" })); });
    expect(calls.filter((x) => x.url.endsWith("/draft-snapshot"))).toHaveLength(0);
    expect(notification.error).toHaveBeenCalledWith("Enter both temperature and humidity, or clear both before saving.");

    fireEvent.change(field("Humidity Level (%)"), { target: { value: "0" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save Draft" })); });
    await waitFor(() => expect(calls.filter((x) => x.url.endsWith("/draft-snapshot"))).toHaveLength(1));
    const saves = calls.filter((x) => x.url.endsWith("/draft-snapshot"));
    const measured = JSON.parse(String(saves[0].init?.body)).environmentalData;
    expect(measured.ambientTemperature).toBe(0);
    expect(measured.humidityLevel).toBe(0);
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
