// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const prepareInspectionPhoto = vi.fn();
const uploadInspectionPhoto = vi.fn();
const queueEvidenceUpload = vi.fn();
vi.mock("@/lib/inspection-photo-upload", () => ({
  PhotoUploadError: class PhotoUploadError extends Error { constructor(message: string, public queueable: boolean) { super(message); } },
  prepareInspectionPhoto: (...args: unknown[]) => prepareInspectionPhoto(...args),
  uploadInspectionPhoto: (...args: unknown[]) => uploadInspectionPhoto(...args),
}));
vi.mock("@/lib/evidence-upload-queue", () => ({ queueEvidenceUpload: (...args: unknown[]) => queueEvidenceUpload(...args) }));

import { InspectionPhotoUploadControl } from "../InspectionPhotoUploadControl";
import { PhotoUploadError } from "@/lib/inspection-photo-upload";

beforeEach(() => {
  vi.clearAllMocks();
  queueEvidenceUpload.mockReset();
  queueEvidenceUpload.mockRejectedValue(new Error("Device queue unavailable"));
  vi.stubGlobal("crypto", { randomUUID: () => "synthetic-uuid" });
  prepareInspectionPhoto.mockImplementation(async (file: File) => file);
});

describe("InspectionPhotoUploadControl", () => {
  it("keeps a rejected photo available and retries with the same idempotency key", async () => {
    uploadInspectionPhoto.mockRejectedValueOnce(new PhotoUploadError("Invalid file type", false))
      .mockResolvedValueOnce({ id: "photo-1", url: "signed" });
    const verified = vi.fn();
    render(<InspectionPhotoUploadControl inspectionId="inspection-1" onVerified={verified} />);
    const file = new File(["synthetic"], "room.heic", { type: "image/heic" });
    fireEvent.change(screen.getByLabelText("Choose inspection photos"), { target: { files: [file] } });
    await screen.findByText(/Invalid file type/);
    expect(verified).not.toHaveBeenCalled();
    expect(queueEvidenceUpload).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Retry this photo" }));
    await waitFor(() => expect(verified).toHaveBeenCalledWith({ id: "photo-1", url: "signed" }));
    expect(uploadInspectionPhoto).toHaveBeenCalledTimes(2);
    expect(uploadInspectionPhoto.mock.calls[0][2]).toBe(uploadInspectionPhoto.mock.calls[1][2]);
    expect(screen.queryByText(/Invalid file type/)).not.toBeInTheDocument();
  });

  it("does not mark an unverified readback as attached", async () => {
    uploadInspectionPhoto.mockRejectedValue(new Error("could not verify"));
    const verified = vi.fn();
    render(<InspectionPhotoUploadControl inspectionId="inspection-1" onVerified={verified} />);
    fireEvent.change(screen.getByLabelText("Choose inspection photos"), { target: { files: [new File(["synthetic"], "room.jpg", { type: "image/jpeg" })] } });
    await screen.findByText(/could not verify/);
    expect(verified).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Retry this photo" })).toBeEnabled();
  });

  it("parks an uncertain upload with its original bytes and first POST key", async () => {
    uploadInspectionPhoto.mockRejectedValue(new TypeError("Network failed"));
    queueEvidenceUpload.mockResolvedValue("photo-synthetic-uuid");
    const verified = vi.fn();
    render(<InspectionPhotoUploadControl inspectionId="inspection-1" onVerified={verified} />);
    const file = new File(["synthetic"], "room.jpg", { type: "image/jpeg" });
    fireEvent.change(screen.getByLabelText("Choose inspection photos"), { target: { files: [file] } });
    await waitFor(() => expect(queueEvidenceUpload).toHaveBeenCalledTimes(1));
    const key = uploadInspectionPhoto.mock.calls[0][2];
    expect(queueEvidenceUpload).toHaveBeenCalledWith(expect.objectContaining({
      inspectionId: "inspection-1", blob: file, directRetryKey: key,
    }));
    expect(verified).not.toHaveBeenCalled();
  });
});
