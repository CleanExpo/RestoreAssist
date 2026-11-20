// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

// RA-8388 bench (contract seat, finding 1). A reading taken in Guided Capture
// is signed, and the draft save refuses to change or remove it. On this form
// that refusal was invisible twice over:
//
// 1. Removing a signed reading showed "Moisture reading removed". Nothing was
//    removed: the next save was refused, and so was every save after it,
//    because the form kept naming the row it no longer held.
// 2. Save Draft reported the refusal as "Draft not fully saved. These parts
//    did not save: inspection details. Try Save Draft again." The server's
//    own words, which say which reading and what to do, never reached the
//    screen, and trying again cannot work.
//
// These pin the form's side: a signed reading is not removed here and the
// form says why at the tap, and a signed-row refusal from the server is shown
// in the server's words.

const toast = vi.hoisted(() =>
  Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
);
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: { user: { id: "synthetic-owner" } } }) }));
vi.mock("react-hot-toast", () => ({ default: toast }));
vi.mock("@/components/inspection/MoistureMappingCanvas", () => ({ default: () => null }));
vi.mock("@/components/inspection/ClassificationSuggestion", () => ({ default: () => null }));
vi.mock("@/components/inspection/NIRClaimAssessmentPanel", () => ({ default: () => null }));
vi.mock("@/components/inspection/MakeSafeChecklist", () => ({ MakeSafeChecklist: () => null }));
vi.mock("@/components/inspection/ClaimTypePicker", () => ({ default: () => null }));

import NIRTechnicianInputForm from "@/components/NIRTechnicianInputForm";

beforeEach(() => {
  toast.mockClear();
  toast.error.mockClear();
  toast.success.mockClear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const reading = (
  id: string,
  location: string,
  moistureLevel: number,
  evidenceItemId: string | null,
) => ({
  id, location, surfaceType: "Plasterboard", moistureLevel, depth: "Surface",
  mapX: null, mapY: null, sketchRoomId: null, evidenceItemId,
});

const REFUSAL =
  "The ambient reading of 22.5°C and 68% humidity is part of the signed evidence record and cannot be changed here.";

async function renderLoaded(draftSnapshotAnswer?: { status: number; body: unknown }) {
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
              // Taken in Guided Capture: it carries the evidence link.
              reading("reading-signed", "Kitchen north wall", 18.4, "ev_1"),
              // Typed into this form: no link.
              reading("reading-plain", "Western wall", 13.9, null),
            ],
            affectedAreas: [], scopeItems: [], photos: [],
          },
        }),
      };
    }
    if (url.endsWith("/draft-snapshot") && draftSnapshotAnswer) {
      return {
        ok: draftSnapshotAnswer.status < 400,
        status: draftSnapshotAnswer.status,
        json: async () => draftSnapshotAnswer.body,
      };
    }
    return { ok: true, json: async () => ({}) };
  }));
  await act(async () => { render(<NIRTechnicianInputForm reportId="rep-1" />); });
  await screen.findByText("Western wall");
  return calls;
}

async function pressSaveDraft(calls: Array<{ url: string }>) {
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save Draft" })); });
  await waitFor(() => {
    if (!calls.some((call) => call.url.endsWith("/draft-snapshot"))) {
      throw new Error("no draft save yet");
    }
  });
}

describe("NIR form and a reading signed in Guided Capture (RA-8388)", () => {
  it("does not remove a signed reading, and says why instead of saying it was removed", async () => {
    await renderLoaded();
    // The first row is the signed one.
    fireEvent.click(screen.getAllByTitle("Remove reading")[0]);

    expect(screen.getByText("Kitchen north wall")).toBeInTheDocument();
    expect(toast.success).not.toHaveBeenCalledWith("Moisture reading removed");
    expect(toast.error).toHaveBeenCalledTimes(1);
    const said = String(toast.error.mock.calls[0][0]);
    expect(said).toContain("Kitchen north wall");
    expect(said).toContain("18.4%");
    expect(said).toContain("signed evidence record");
    expect(said).toContain("Guided Capture");
  });

  it("still removes a reading typed into this form", async () => {
    await renderLoaded();
    fireEvent.click(screen.getAllByTitle("Remove reading")[1]);

    expect(screen.queryByText("Western wall")).not.toBeInTheDocument();
    expect(toast.success).toHaveBeenCalledWith("Moisture reading removed");
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("keeps a signed reading in the next save, so the save is not refused for a removal that never happened", async () => {
    const calls = await renderLoaded();
    fireEvent.click(screen.getAllByTitle("Remove reading")[0]);
    await pressSaveDraft(calls);

    const sent = JSON.parse(
      String(calls.find((call) => call.url.endsWith("/draft-snapshot"))?.init?.body),
    );
    expect(sent.moistureReadings.map((r: { id: string }) => r.id)).toContain("reading-signed");
  });

  it("Save Draft shows the server's own words for a signed-row refusal", async () => {
    const calls = await renderLoaded({
      status: 409,
      body: {
        error: {
          code: "SIGNED_ROW_REFUSED",
          message: REFUSAL,
          eventId: "e1",
          fields: { rowId: "env-loaded-1", table: "environmentalData", action: "edit", changedFields: "humidityLevel" },
        },
      },
    });
    await pressSaveDraft(calls);

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    const said = toast.error.mock.calls.map((call) => String(call[0]));
    expect(said).toContain(REFUSAL);
    // "Try Save Draft again" is wrong advice for a refusal that will repeat.
    expect(said.join(" ")).not.toContain("Try Save Draft again");
    expect(toast.success).not.toHaveBeenCalledWith("Draft saved.");
  });

  // The same fault for every other refusal this route sends. The assigned
  // technician's 403 is the plainest case: "Try Save Draft again" can never
  // work, and the server had already said what to do instead.
  it("Save Draft shows the server's own words for any refusal, not only the signed-row one", async () => {
    const said403 =
      "Saving the whole draft is for the job owner or a manager. Record field data on each screen instead.";
    const calls = await renderLoaded({
      status: 403,
      body: { error: { code: "FORBIDDEN", message: said403, eventId: "e3" } },
    });
    await pressSaveDraft(calls);

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    const said = toast.error.mock.calls.map((call) => String(call[0]));
    expect(said).toContain(said403);
    expect(said.join(" ")).not.toContain("Try Save Draft again");
  });

  it("Save Draft shows a reload-and-retry answer in the server's words", async () => {
    const said409 = "A reading changed while saving. Reload the job, then save again.";
    const calls = await renderLoaded({
      status: 409,
      body: { error: { code: "CONFLICT", message: said409, eventId: "e2" } },
    });
    await pressSaveDraft(calls);

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(toast.error.mock.calls.map((call) => String(call[0]))).toContain(said409);
  });

  it("a server fault keeps the existing part-by-part message, where trying again is right", async () => {
    const calls = await renderLoaded({
      status: 500,
      body: { error: { code: "INTERNAL", message: "Internal server error", eventId: "e4" } },
    });
    await pressSaveDraft(calls);

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(String(toast.error.mock.calls[0][0])).toContain(
      "These parts did not save: inspection details. Try Save Draft again.",
    );
  });
});
