// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const notification = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: { user: { id: "synthetic-owner" } } }) }));
const photoUpload = vi.hoisted(() => ({ prepare: vi.fn(), upload: vi.fn() }));
vi.mock("react-hot-toast", () => ({ default: notification }));
vi.mock("@/lib/inspection-photo-upload", () => ({
  prepareInspectionPhoto: photoUpload.prepare,
  uploadInspectionPhoto: photoUpload.upload,
}));
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

describe("NIR photo attachment", () => {
  it("keeps a converted iPhone photo and its idempotency key until readback verifies attachment", async () => {
    const converted = new File(["converted"], "kitchen.webp", { type: "image/webp" });
    photoUpload.prepare.mockResolvedValue(converted);
    photoUpload.upload
      .mockRejectedValueOnce(new Error("Photo readback unavailable"))
      .mockResolvedValueOnce({ id: "verified-photo", url: "https://example.test/photo.webp" });
    let deleteCount = 0;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => ({
      ok: init?.method === "DELETE" ? ++deleteCount > 1 : true,
      json: async () => url.startsWith("/api/inspections?reportId=")
        ? { inspection: {
            id: "synthetic-inspection",
            propertyAddress: "1 Test Street",
            propertyPostcode: "4000",
            claimType: "WATER",
            environmentalData: [],
            moistureReadings: [],
            photos: [],
            affectedAreas: [],
            scopeItems: [],
          } }
        : { creditsRemaining: 0 },
    }));
    vi.stubGlobal("fetch", fetchMock);
    await act(async () => render(<NIRTechnicianInputForm reportId="synthetic-report" />));

    const fileInput = document.querySelector<HTMLInputElement>('input[type="file"][multiple]');
    if (!fileInput) throw new Error("Missing NIR photo picker");
    const original = new File(["heic bytes"], "kitchen.heic", { type: "image/heic" });
    await act(async () => fireEvent.change(fileInput, { target: { files: [original] } }));

    expect(photoUpload.prepare).toHaveBeenCalledExactlyOnceWith(original);
    expect(photoUpload.upload).toHaveBeenCalledTimes(1);
    expect(photoUpload.upload.mock.calls[0][0]).toBe("synthetic-inspection");
    expect(photoUpload.upload.mock.calls[0][1]).toBe(converted);
    expect(photoUpload.upload.mock.calls[0][2]).toMatch(/^nir-photo-/);
    expect(screen.getByRole("status")).toHaveTextContent("Photo readback unavailable");
    expect(screen.getByRole("status")).toHaveTextContent("may have reached this inspection");

    const objectUrl = vi.fn(() => "blob:synthetic-original");
    vi.stubGlobal("URL", { ...URL, createObjectURL: objectUrl, revokeObjectURL: vi.fn() });
    const download = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    fireEvent.click(screen.getByRole("button", { name: "Save original copy" }));
    expect(objectUrl).toHaveBeenCalledWith(original);
    expect(download).toHaveBeenCalledOnce();
    download.mockRestore();
    const confirm = vi.fn(() => false);
    vi.stubGlobal("confirm", confirm);
    fireEvent.click(screen.getByRole("button", { name: "Remove selection" }));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("attachment was not verified"));
    expect(screen.getByRole("button", { name: "Retry this photo" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Review & Submit" }));
    expect(notification.error).toHaveBeenCalledWith("Please fix validation errors before reviewing");
    expect(screen.getByRole("button", { name: "Retry this photo" })).toBeInTheDocument();

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Retry this photo" })));
    await waitFor(() => expect(photoUpload.upload).toHaveBeenCalledTimes(2));
    expect(photoUpload.prepare).toHaveBeenCalledTimes(1);
    expect(photoUpload.upload.mock.calls[1][1]).toBe(converted);
    expect(photoUpload.upload.mock.calls[1][2]).toBe(photoUpload.upload.mock.calls[0][2]);
    expect(screen.queryByRole("button", { name: "Retry this photo" })).not.toBeInTheDocument();
    expect(screen.getByAltText("Photo 1")).toHaveAttribute("src", "https://example.test/photo.webp");
    const remove = screen.getByTitle("Remove photo");
    fireEvent.click(remove);
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "DELETE")).toHaveLength(0);
    expect(screen.getByAltText("Photo 1")).toBeInTheDocument();
    confirm.mockReturnValue(true);
    await act(async () => fireEvent.click(remove));
    expect(screen.getByAltText("Photo 1")).toBeInTheDocument();
    expect(notification.error).toHaveBeenCalledWith(
      "Could not verify photo removal. The photo remains visible; please try again.",
    );
    await act(async () => fireEvent.click(screen.getByTitle("Remove photo")));
    expect(screen.queryByAltText("Photo 1")).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([url, init]) =>
      url === "/api/inspections/synthetic-inspection/photos/verified-photo" && init?.method === "DELETE",
    )).toHaveLength(2);
  });

  it("removes an uncertain local selection only after explicit confirmation", async () => {
    photoUpload.prepare.mockImplementation(async (file: File) => file);
    photoUpload.upload.mockRejectedValue(new Error("Readback unavailable"));
    vi.stubGlobal("fetch", vi.fn(async (url: string) => ({
      ok: true,
      json: async () => url.startsWith("/api/inspections?reportId=")
        ? { inspection: {
            id: "synthetic-inspection",
            propertyAddress: "1 Test Street",
            propertyPostcode: "4000",
            claimType: "WATER",
            environmentalData: [],
            moistureReadings: [],
            photos: [],
            affectedAreas: [],
            scopeItems: [],
          } }
        : { creditsRemaining: 0 },
    })));
    await act(async () => render(<NIRTechnicianInputForm reportId="synthetic-report" />));
    const fileInput = document.querySelector<HTMLInputElement>('input[type="file"][multiple]');
    if (!fileInput) throw new Error("Missing NIR photo picker");
    await act(async () => fireEvent.change(fileInput, {
      target: { files: [new File(["jpeg bytes"], "kitchen.jpg", { type: "image/jpeg" })] },
    }));
    const confirm = vi.fn(() => true);
    vi.stubGlobal("confirm", confirm);
    fireEvent.click(screen.getByRole("button", { name: "Remove selection" }));
    expect(confirm).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: "Retry this photo" })).not.toBeInTheDocument();
    expect(photoUpload.upload).toHaveBeenCalledTimes(1);
  });

  it("holds review while deleting and reconciles uncertain DELETE responses from the inspection list", async () => {
    let resolveFirstDelete: ((value: { ok: boolean }) => void) | undefined;
    const firstDelete = new Promise<{ ok: boolean }>((resolve) => { resolveFirstDelete = resolve; });
    let deletes = 0;
    let readbacks = 0;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/photos/verified-photo") && init?.method === "DELETE") {
        deletes++;
        return deletes === 1 ? firstDelete : { ok: false, status: 404 };
      }
      if (url.endsWith("/photos") && init?.cache === "no-store") {
        readbacks++;
        return readbacks === 1
          ? { ok: false, status: 503 }
          : { ok: true, json: async () => ({ photos: [] }) };
      }
      return {
        ok: true,
        json: async () => url.startsWith("/api/inspections?reportId=")
          ? { inspection: {
              id: "synthetic-inspection",
              propertyAddress: "1 Test Street",
              propertyPostcode: "4000",
              claimType: "WATER",
              environmentalData: [],
              moistureReadings: [],
              photos: [{ id: "verified-photo", url: "https://example.test/photo.webp" }],
              affectedAreas: [],
              scopeItems: [],
            } }
          : { creditsRemaining: 0 },
      };
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("confirm", vi.fn(() => true));
    await act(async () => render(<NIRTechnicianInputForm reportId="synthetic-report" />));
    fireEvent.click(screen.getByTitle("Remove photo"));
    expect(screen.getByRole("button", { name: "Review & Submit" })).toBeDisabled();
    expect(screen.getByAltText("Photo 1")).toBeInTheDocument();

    await act(async () => resolveFirstDelete?.({ ok: false }));
    await waitFor(() => expect(readbacks).toBe(1));
    expect(screen.getByAltText("Photo 1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Review & Submit" })).toBeEnabled();

    await act(async () => fireEvent.click(screen.getByTitle("Remove photo")));
    expect(readbacks).toBe(2);
    expect(deletes).toBe(2);
    expect(screen.queryByAltText("Photo 1")).not.toBeInTheDocument();
  });
});
