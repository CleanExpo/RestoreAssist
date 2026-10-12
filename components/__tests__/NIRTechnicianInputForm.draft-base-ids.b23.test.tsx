// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

// B23: draft save deleted every moisture and environmental row on the job and
// wrote back only the form's own, so a reading captured on another screen
// after the form opened was erased (Indooroopilly lost its 13.9% reading).
// The server now deletes only rows named in baseIds. This pins the form's side
// of that contract: it names the rows it loaded, sends each row's id, and stops
// naming a removed row once a save has confirmed it gone.

vi.mock("next-auth/react", () => ({ useSession: () => ({ data: { user: { id: "synthetic-owner" } } }) }));
vi.mock("react-hot-toast", () => ({ default: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/components/inspection/MoistureMappingCanvas", () => ({ default: () => null }));
vi.mock("@/components/inspection/ClassificationSuggestion", () => ({ default: () => null }));
vi.mock("@/components/inspection/NIRClaimAssessmentPanel", () => ({ default: () => null }));
vi.mock("@/components/inspection/MakeSafeChecklist", () => ({ MakeSafeChecklist: () => null }));
vi.mock("@/components/inspection/ClaimTypePicker", () => ({ default: () => null }));

import NIRTechnicianInputForm from "@/components/NIRTechnicianInputForm";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const reading = (id: string, location: string, moistureLevel: number) => ({
  id, location, surfaceType: "Plasterboard", moistureLevel, depth: "Surface",
  mapX: null, mapY: null, sketchRoomId: null,
});

async function renderLoaded() {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    if (url.startsWith("/api/inspections?reportId=")) {
      return {
        ok: true,
        json: async () => ({
          inspection: {
            id: "insp-1", claimType: "WATER", propertyAddress: "1 Test St",
            propertyPostcode: "4000", technicianName: "Tech",
            environmentalData: [{
              id: "env-loaded-1", ambientTemperature: 21, humidityLevel: 55, dewPoint: 11.5,
              airCirculation: true, weatherConditions: "Fine", recordedAt: "2026-10-02T01:00:00.000Z",
            }],
            moistureReadings: [
              reading("reading-loaded-a", "Bedroom 4 ceiling", 11.8),
              reading("reading-loaded-b", "Western wall", 13.9),
            ],
            affectedAreas: [], scopeItems: [], photos: [],
          },
        }),
      };
    }
    return { ok: true, json: async () => ({}) };
  }));
  await act(async () => { render(<NIRTechnicianInputForm reportId="rep-1" />); });
  await screen.findByText("Western wall");
  return calls;
}

async function saveDraft(calls: Array<{ url: string; init?: RequestInit }>, n: number) {
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save Draft" })); });
  const saves = await waitFor(() => {
    const found = calls.filter((call) => call.url.endsWith("/draft-snapshot"));
    if (found.length < n) throw new Error(`expected ${n} draft saves, saw ${found.length}`);
    return found;
  });
  return JSON.parse(String(saves[n - 1].init?.body));
}

describe("NIRTechnicianInputForm draft save names the rows it loaded (B23)", () => {
  it("names both loaded readings, sends only the kept one by id, and keeps the loaded environmental row", async () => {
    const calls = await renderLoaded();
    fireEvent.click(screen.getAllByTitle("Remove reading")[0]);

    const body = await saveDraft(calls, 1);
    expect([...body.baseIds.moistureReadings].sort()).toEqual(["reading-loaded-a", "reading-loaded-b"]);
    expect(body.moistureReadings.map((r: { id: string }) => r.id)).toEqual(["reading-loaded-b"]);
    expect(body.environmentalData.id).toBe("env-loaded-1");
    expect(body.baseIds.environmentalData).toEqual(["env-loaded-1"]);
  });

  it("stops naming a removed reading once a save has confirmed it gone", async () => {
    const calls = await renderLoaded();
    fireEvent.click(screen.getAllByTitle("Remove reading")[0]);
    await saveDraft(calls, 1);

    const second = await saveDraft(calls, 2);
    expect(second.baseIds.moistureReadings).toEqual(["reading-loaded-b"]);
  });
});
