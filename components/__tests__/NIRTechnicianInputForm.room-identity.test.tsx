// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

const notification = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: { user: { id: "synthetic-owner" } } }) }));
vi.mock("react-hot-toast", () => ({ default: notification }));
vi.mock("@/components/inspection/MoistureMappingCanvas", () => ({ default: () => null }));
vi.mock("@/components/inspection/ClassificationSuggestion", () => ({ default: () => null }));
vi.mock("@/components/inspection/NIRClaimAssessmentPanel", () => ({ default: () => null }));
vi.mock("@/components/inspection/MakeSafeChecklist", () => ({ MakeSafeChecklist: () => null }));
vi.mock("@/components/inspection/ClaimTypePicker", () => ({ default: () => null }));

import NIRTechnicianInputForm from "@/components/NIRTechnicianInputForm";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function input(label: string): HTMLInputElement {
  const field = screen.getByText(label).parentElement?.querySelector("input");
  if (!field) throw new Error(`Missing input: ${label}`);
  return field;
}

describe("NIR room picker", () => {
  it("adds numbered bedrooms and named lounges without merging their local rows", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ creditsRemaining: 0 }) })));
    await act(async () => render(<NIRTechnicianInputForm />));

    const type = screen.getByText("Room Type").parentElement?.querySelector("select");
    if (!type) throw new Error("Missing room type picker");
    const name = input("Room name or number");
    fireEvent.change(type, { target: { value: "Bedroom" } });
    fireEvent.change(name, { target: { value: "4" } });
    fireEvent.change(input("Length (m)"), { target: { value: "4" } });
    fireEvent.change(input("Width (m)"), { target: { value: "3" } });
    fireEvent.click(screen.getByLabelText("Carpet"));
    fireEvent.click(screen.getByRole("button", { name: "Add Area" }));
    expect(screen.getByText("Bedroom 4")).toBeInTheDocument();

    fireEvent.change(type, { target: { value: "Living Room" } });
    fireEvent.change(name, { target: { value: "Rear Lounge" } });
    fireEvent.change(input("Length (m)"), { target: { value: "5" } });
    fireEvent.change(input("Width (m)"), { target: { value: "4" } });
    fireEvent.click(screen.getByLabelText("Carpet"));
    fireEvent.click(screen.getByRole("button", { name: "Add Area" }));
    expect(screen.getByText("Living Room — Rear Lounge")).toBeInTheDocument();
    expect(screen.getAllByTitle("Remove area")).toHaveLength(2);

    fireEvent.change(type, { target: { value: "Bedroom" } });
    fireEvent.change(name, { target: { value: "4" } });
    fireEvent.change(input("Length (m)"), { target: { value: "4" } });
    fireEvent.change(input("Width (m)"), { target: { value: "3" } });
    fireEvent.click(screen.getByLabelText("Carpet"));
    fireEvent.click(screen.getByRole("button", { name: "Add Area" }));
    expect(notification.error).toHaveBeenCalledWith(
      "This room name already exists. Enter a distinct name or number.",
    );
    expect(screen.getAllByTitle("Remove area")).toHaveLength(2);
  });

  it("reopens persisted room labels, metric area, and unknown legacy details", async () => {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => ({
      ok: true,
      json: async () => url.startsWith("/api/inspections?reportId=")
        ? {
            inspection: {
              id: "synthetic-inspection",
              propertyAddress: "1 Test Street",
              propertyPostcode: "4000",
              claimType: "WATER",
              environmentalData: [],
              moistureReadings: [{
                id: "reading-synthetic",
                location: "North Wall",
                surfaceType: "Carpet",
                moistureLevel: 28,
                depth: "Surface",
                sketchRoomId: "drawing-bedroom",
                sketchRoom: { id: "drawing-bedroom", name: "Bedroom" },
                mapX: null,
                mapY: null,
              }],
              scopeItems: [],
              photos: [],
              affectedAreas: [
                {
                  id: "area_12345678",
                  roomZoneId: "Bedroom 4",
                  affectedAreaSqm: 12,
                  affectedSquareFootage: 129.166925,
                  waterSource: "Clean Water",
                  timeSinceLoss: null,
                  description: "Dimensions: 4m × 3m × 2.7m. Materials: Carpet",
                },
                {
                  id: "area_87654321",
                  roomZoneId: "Front Lounge",
                  affectedAreaSqm: 20,
                  affectedSquareFootage: 215.278208,
                  waterSource: "Clean Water",
                  timeSinceLoss: null,
                  description: "Historical free text",
                },
              ],
            },
          }
        : { creditsRemaining: 0 },
    }));
    vi.stubGlobal("fetch", fetchMock);
    await act(async () => render(<NIRTechnicianInputForm reportId="synthetic-report" />));
    expect(screen.getByText("Bedroom 4")).toBeInTheDocument();
    expect(screen.getByText("Front Lounge")).toBeInTheDocument();
    expect(screen.getAllByText("12.00 m²")).toHaveLength(1);
    expect(screen.getByText("Dimensions need re-entry")).toBeInTheDocument();
    expect(screen.getByText("Needs re-entry")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Each drawn room with linked moisture readings must match its own affected area.",
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save Draft" }));
    });
    const save = fetchMock.mock.calls.find(([url]) => url.endsWith("/draft-snapshot"));
    expect(save).toBeDefined();
    const body = JSON.parse(String(save?.[1]?.body));
    expect(body.affectedAreas[0]).toMatchObject({
      id: "area_12345678",
      roomZoneId: "Bedroom 4",
      affectedAreaSqm: 12,
    });
    expect(body.affectedAreas[1]).toMatchObject({
      id: "area_87654321",
      roomZoneId: "Front Lounge",
      affectedAreaSqm: 20,
    });
    expect(body.affectedAreas[1]).not.toHaveProperty("description");
    expect(body.affectedAreas[1]).not.toHaveProperty("height");

    fireEvent.click(screen.getByRole("button", { name: "Edit Front Lounge" }));
    fireEvent.change(input("Length (m)"), { target: { value: "6" } });
    fireEvent.change(input("Width (m)"), { target: { value: "4" } });
    fireEvent.change(input("Height (m)"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Update Area" }));
    expect(notification.error).toHaveBeenCalledWith("Please enter a valid height dimension");
    fireEvent.change(input("Height (m)"), { target: { value: "2.7" } });
    fireEvent.click(screen.getByLabelText("Carpet"));
    fireEvent.click(screen.getByRole("button", { name: "Update Area" }));
    expect(screen.getAllByTitle("Remove area")).toHaveLength(2);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save Draft" }));
    });
    const saves = fetchMock.mock.calls.filter(([url]) => url.endsWith("/draft-snapshot"));
    const editedBody = JSON.parse(String(saves.at(-1)?.[1]?.body));
    expect(editedBody.affectedAreas[1]).toMatchObject({
      id: "area_87654321",
      roomZoneId: "Front Lounge",
      affectedAreaSqm: 20,
      height: 2.7,
      description: "Dimensions: 6m × 4m × 2.7m. Materials: Carpet\n\nOriginal note: Historical free text",
    });

    fireEvent.click(screen.getByRole("button", { name: "Edit Front Lounge" }));
    fireEvent.click(screen.getByLabelText(/Replace the recorded affected area/));
    fireEvent.click(screen.getByRole("button", { name: "Update Area" }));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save Draft" })));
    const laterSaves = fetchMock.mock.calls.filter(([url]) => url.endsWith("/draft-snapshot"));
    const recalculated = JSON.parse(String(laterSaves.at(-1)?.[1]?.body));
    expect(recalculated.affectedAreas[1]).toMatchObject({
      id: "area_87654321",
      affectedAreaSqm: 24,
    });

    fireEvent.click(screen.getByRole("button", { name: "Edit Bedroom 4" }));
    expect(screen.getByLabelText(/Replace the recorded affected area/)).toBeChecked();
    fireEvent.change(input("Length (m)"), { target: { value: "6" } });
    fireEvent.change(input("Width (m)"), { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: "Update Area" }));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save Draft" })));
    const finalSaves = fetchMock.mock.calls.filter(([url]) => url.endsWith("/draft-snapshot"));
    const knownArea = JSON.parse(String(finalSaves.at(-1)?.[1]?.body));
    expect(knownArea.affectedAreas[0]).toMatchObject({
      id: "area_12345678",
      affectedAreaSqm: 24,
      description: "Dimensions: 6m × 4m × 2.7m. Materials: Carpet",
    });
  });

  it("lets a technician explicitly shorten an overlong historical note without replacing the area", async () => {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => ({
      ok: true,
      json: async () => url.startsWith("/api/inspections?reportId=")
        ? { inspection: {
          id: "synthetic-inspection",
          propertyAddress: "1 Test Street",
          propertyPostcode: "4000",
          claimType: "WATER",
          environmentalData: [],
          moistureReadings: [],
          scopeItems: [],
          photos: [],
          affectedAreas: [{
            id: "area_87654321",
            roomZoneId: "Front Lounge",
            affectedAreaSqm: 20,
            waterSource: "Clean Water",
            timeSinceLoss: null,
            description: "N".repeat(1990),
          }],
        } }
        : { creditsRemaining: 0 },
    }));
    vi.stubGlobal("fetch", fetchMock);
    await act(async () => render(<NIRTechnicianInputForm reportId="synthetic-report" />));
    fireEvent.click(screen.getByRole("button", { name: "Edit Front Lounge" }));
    fireEvent.change(input("Length (m)"), { target: { value: "5" } });
    fireEvent.change(input("Width (m)"), { target: { value: "4" } });
    fireEvent.change(input("Height (m)"), { target: { value: "2.7" } });
    fireEvent.click(screen.getByLabelText("Carpet"));
    fireEvent.click(screen.getByRole("button", { name: "Update Area" }));
    expect(notification.error).toHaveBeenCalledWith(
      "Existing area note is too long with dimensions. Shorten it in the note field before updating.",
    );
    expect(screen.getByRole("button", { name: "Update Area" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Existing area note"), {
      target: { value: "Shortened by technician" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Update Area" }));
    expect(screen.getAllByTitle("Remove area")).toHaveLength(1);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save Draft" })));
    const save = fetchMock.mock.calls.find(([url]) => url.endsWith("/draft-snapshot"));
    const body = JSON.parse(String(save?.[1]?.body));
    expect(body.affectedAreas[0]).toMatchObject({
      id: "area_87654321",
      description: "Dimensions: 5m × 4m × 2.7m. Materials: Carpet\n\nOriginal note: Shortened by technician",
    });
  });
});
