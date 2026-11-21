// @vitest-environment jsdom
/**
 * RA-8534 — the Photos page accepts several photos at once and uploads them
 * a few at a time. One failed photo must not stop the others.
 */
import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
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

import { InspectionPhotoUploadControl, PHOTO_UPLOAD_CONCURRENCY } from "../InspectionPhotoUploadControl";
import { PhotoUploadError } from "@/lib/inspection-photo-upload";

let uuid = 0;
beforeEach(() => {
  vi.clearAllMocks();
  uuid = 0;
  vi.stubGlobal("crypto", { randomUUID: () => `uuid-${++uuid}` });
  prepareInspectionPhoto.mockImplementation(async (file: File) => file);
  queueEvidenceUpload.mockRejectedValue(new Error("Device queue unavailable"));
});

function files(n: number) {
  return Array.from({ length: n }, (_, i) => new File(["synthetic"], `room-${i + 1}.jpg`, { type: "image/jpeg" }));
}

describe("InspectionPhotoUploadControl — multiple files (RA-8534)", () => {
  it("uploads at most PHOTO_UPLOAD_CONCURRENCY photos at once and finishes every one", async () => {
    expect(PHOTO_UPLOAD_CONCURRENCY).toBe(3);
    let inFlight = 0;
    let peak = 0;
    const releases: Array<() => void> = [];
    uploadInspectionPhoto.mockImplementation((_id: string, file: File) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      return new Promise((resolve) => {
        releases.push(() => {
          inFlight--;
          resolve({ id: file.name, url: "signed" });
        });
      });
    });
    const verified = vi.fn();
    render(<InspectionPhotoUploadControl inspectionId="inspection-1" onVerified={verified} multiple />);
    const input = screen.getByLabelText("Choose inspection photos");
    expect(input).toHaveAttribute("multiple");

    fireEvent.change(input, { target: { files: files(7) } });
    await waitFor(() => expect(uploadInspectionPhoto).toHaveBeenCalledTimes(3));
    // Release one at a time; the pool must never exceed three.
    while (verified.mock.calls.length < 7) {
      await waitFor(() => expect(releases.length).toBeGreaterThan(0));
      releases.shift()!();
      await new Promise((r) => setTimeout(r, 0));
    }
    expect(peak).toBe(3);
    expect(uploadInspectionPhoto).toHaveBeenCalledTimes(7);
    expect(verified.mock.calls.map((c) => c[0].id).sort()).toEqual(files(7).map((f) => f.name).sort());
    await waitFor(() => expect(screen.getByRole("button", { name: "Upload Photo" })).toBeEnabled());
  });

  it("keeps going after one photo fails and reports that photo's error alone", async () => {
    uploadInspectionPhoto.mockImplementation(async (_id: string, file: File) => {
      if (file.name === "room-2.jpg") throw new PhotoUploadError("Invalid file type", false);
      return { id: file.name, url: "signed" };
    });
    const verified = vi.fn();
    render(<InspectionPhotoUploadControl inspectionId="inspection-1" onVerified={verified} multiple />);
    fireEvent.change(screen.getByLabelText("Choose inspection photos"), { target: { files: files(5) } });

    await waitFor(() => expect(verified).toHaveBeenCalledTimes(4));
    expect(await screen.findByText("room-2.jpg: Invalid file type")).toBeInTheDocument();
    expect(screen.queryByText(/room-1\.jpg/)).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Retry this photo" })).toHaveLength(1);
  });

  it("the Photos page lets technicians pick several photos at once", () => {
    const source = readFileSync(
      path.join(process.cwd(), "app/dashboard/inspections/[id]/photos/page.tsx"),
      "utf8",
    );
    const usage = source.match(/<InspectionPhotoUploadControl[\s\S]*?\/>/);
    expect(usage?.[0]).toMatch(/\bmultiple\b/);
  });
});
