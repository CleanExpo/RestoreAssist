// @vitest-environment jsdom
// RA-8334: reloading New Inspection lost the draft id, so the next Save Draft
// POSTed a second inspection and split the job across two records.
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const notification = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: { user: { id: "synthetic-owner" } } }) }));
vi.mock("react-hot-toast", () => ({ default: notification }));
vi.mock("@/lib/inspection-photo-upload", () => ({
  prepareInspectionPhoto: vi.fn(),
  uploadInspectionPhoto: vi.fn(),
}));
vi.mock("@/components/inspection/MoistureMappingCanvas", () => ({ default: () => null }));
vi.mock("@/components/inspection/ClassificationSuggestion", () => ({ default: () => null }));
vi.mock("@/components/inspection/NIRClaimAssessmentPanel", () => ({ default: () => null }));
vi.mock("@/components/inspection/MakeSafeChecklist", () => ({ MakeSafeChecklist: () => null }));
vi.mock("@/components/inspection/ClaimTypePicker", () => ({
  default: ({ onChange, value, disabled }: {
    onChange: (value: string) => void; value?: string | null; disabled?: boolean;
  }) =>
    <button type="button" disabled={disabled} onClick={() => onChange("MOULD")}>{value ? `Claim ${value}` : "Choose mould"}</button>,
}));

import NIRTechnicianInputForm from "@/components/NIRTechnicianInputForm";

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const savedDraft = {
  id: "job-1",
  status: "DRAFT",
  claimType: "MOULD",
  propertyAddress: "1 Test Street",
  propertyPostcode: "4000",
  inspectionDate: null,
  lossDescription: "Burst flexi hose under kitchen sink",
  technicianName: "Synthetic Technician",
  environmentalData: [],
  moistureReadings: [],
  affectedAreas: [],
  scopeItems: [],
  photos: [],
};

function stubApi(options: { draftRead?: "ok" | "missing" } = {}) {
  const creates: RequestInit[] = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/inspections" && init?.method === "POST") {
      creates.push(init);
      return { ok: true, json: async () => ({ inspection: { id: "job-1" } }) };
    }
    if (url === "/api/inspections/job-1" && (!init?.method || init.method === "GET")) {
      return options.draftRead === "missing"
        ? { ok: false, status: 404, json: async () => ({ error: "Inspection not found" }) }
        : { ok: true, json: async () => ({ inspection: savedDraft }) };
    }
    return { ok: true, json: async () => ({ creditsRemaining: 0 }) };
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, creates };
}

describe("RA-8334 New Inspection draft survives a reload", () => {
  it("reports the created draft id, reopens it after a reload and saves to it without a second create", async () => {
    const { fetchMock, creates } = stubApi();
    const onInspectionCreated = vi.fn();

    // First visit: fill the form and save, which creates the inspection.
    let view!: ReturnType<typeof render>;
    await act(async () => {
      view = render(<NIRTechnicianInputForm onInspectionCreated={onInspectionCreated} />);
    });
    fireEvent.click(screen.getByRole("button", { name: "Choose mould" }));
    fireEvent.change(screen.getByPlaceholderText("Full property address"), { target: { value: "1 Test Street" } });
    fireEvent.change(screen.getByPlaceholderText("0000"), { target: { value: "4000" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save Draft" })));
    expect(creates).toHaveLength(1);
    // The page puts this id in its URL, which is what survives the reload.
    expect(onInspectionCreated).toHaveBeenCalledWith("job-1");
    const draftId = onInspectionCreated.mock.calls[0][0] as string;

    // Reload: component state and the per-attempt sessionStorage key are gone.
    view.unmount();
    sessionStorage.clear();
    await act(async () => {
      render(<NIRTechnicianInputForm draftInspectionId={draftId} onInspectionCreated={onInspectionCreated} />);
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/inspections/job-1", expect.objectContaining({ method: "GET" }));
    await waitFor(() => expect(screen.getByPlaceholderText("Full property address")).toHaveValue("1 Test Street"));
    expect(screen.getByPlaceholderText("0000")).toHaveValue("4000");
    expect(screen.getByRole("button", { name: "Claim MOULD" })).toBeDisabled();

    // Second Save Draft updates job-1; it must not POST a create.
    const snapshotsBefore = fetchMock.mock.calls.filter(([url]) => url === "/api/inspections/job-1/draft-snapshot").length;
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save Draft" })));
    expect(creates).toHaveLength(1);
    const snapshots = fetchMock.mock.calls.filter(([url]) => url === "/api/inspections/job-1/draft-snapshot");
    expect(snapshots).toHaveLength(snapshotsBefore + 1);
    const snapshot = snapshots[snapshots.length - 1];
    expect(snapshot?.[1]?.method).toBe("PUT");
    expect(JSON.parse(String(snapshot?.[1]?.body))).toMatchObject({
      lossDescription: "Burst flexi hose under kitchen sink",
      technicianName: "Synthetic Technician",
    });
  });

  it("never creates a second inspection when the named draft cannot be reopened", async () => {
    const { creates } = stubApi({ draftRead: "missing" });
    await act(async () => { render(<NIRTechnicianInputForm draftInspectionId="job-1" />); });
    expect(await screen.findByText(/saved draft could not be reopened/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Choose mould" }));
    fireEvent.change(screen.getByPlaceholderText("Full property address"), { target: { value: "1 Test Street" } });
    fireEvent.change(screen.getByPlaceholderText("0000"), { target: { value: "4000" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save Draft" })));
    expect(creates).toHaveLength(0);
  });
});
