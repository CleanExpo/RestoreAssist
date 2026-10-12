// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const queueEvidenceUpload = vi.fn();
vi.mock("@/lib/evidence-upload-queue", () => ({ queueEvidenceUpload: (...args: unknown[]) => queueEvidenceUpload(...args) }));

import { InspectionPhotoUploadControl } from "../InspectionPhotoUploadControl";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("crypto", { randomUUID: () => "synthetic-uuid" });
});

describe("structured API error at the real upload control", () => {
  it("renders a validation message string, keeps retry, and does not queue invalid bytes", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: false, status: 400,
      json: async () => ({ error: { code: "VALIDATION", message: "Unsupported image bytes", eventId: "synthetic-event" } }),
    });
    vi.stubGlobal("fetch", fetcher);
    const verified = vi.fn();
    render(<InspectionPhotoUploadControl inspectionId="job-1" onVerified={verified} />);
    fireEvent.change(screen.getByLabelText("Choose inspection photos"), { target: {
      files: [new File(["synthetic"], "room.jpg", { type: "image/jpeg" })],
    } });
    expect(await screen.findByText(/Unsupported image bytes/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry this photo" })).toBeEnabled();
    expect(verified).not.toHaveBeenCalled();
    expect(queueEvidenceUpload).not.toHaveBeenCalled();
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  });
});
