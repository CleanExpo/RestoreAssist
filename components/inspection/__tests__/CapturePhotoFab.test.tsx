// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CapturePhotoFab } from "../CapturePhotoFab";

vi.mock("@/lib/capture/cocoa-client", () => ({
  computeSha256: vi.fn(async () => "abc123"),
  getCurrentGps: vi.fn(async () => null),
}));

vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

const queueEvidenceUpload = vi.fn();
vi.mock("@/lib/evidence-upload-queue", () => ({
  queueEvidenceUpload: (...args: unknown[]) => queueEvidenceUpload(...args),
}));

import toast from "react-hot-toast";

global.fetch = vi.fn() as unknown as typeof fetch;

beforeEach(() => {
  vi.clearAllMocks();
  queueEvidenceUpload.mockReset();
  Object.defineProperty(window.navigator, "onLine", {
    value: true,
    configurable: true,
  });
  if (typeof URL.createObjectURL === "undefined") {
    // @ts-expect-error jsdom polyfill
    URL.createObjectURL = vi.fn(() => "blob:mock");
  }
  if (typeof URL.revokeObjectURL === "undefined") {
    // @ts-expect-error jsdom polyfill
    URL.revokeObjectURL = vi.fn();
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function selectFileAndOpenModal() {
  const blob = new Blob([new Uint8Array([0xff, 0xd8, 0xff])], {
    type: "image/jpeg",
  });
  const file = new File([blob], "head.jpg", { type: "image/jpeg" });
  const input = document.querySelector(
    'input[type="file"]',
  ) as HTMLInputElement;
  Object.defineProperty(input, "files", { value: [file] });
  fireEvent.change(input);
  await waitFor(() => {
    expect(screen.getByText(/Capture evidence/i)).toBeInTheDocument();
  });
}

function clickSave() {
  fireEvent.click(screen.getByRole("button", { name: /Save photo/i }));
}

describe("CapturePhotoFab", () => {
  it("renders FAB with accessible label", () => {
    render(
      <CapturePhotoFab
        inspectionId="i_1"
        inspectionStatus="DRAFT"
        onUploaded={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: /Capture photo/i }),
    ).toBeInTheDocument();
  });

  it("renders even when inspection status is COMPLETED (gating is at mount site)", () => {
    const { container } = render(
      <CapturePhotoFab
        inspectionId="i_1"
        inspectionStatus="COMPLETED"
        onUploaded={vi.fn()}
      />,
    );
    expect(container.firstChild).not.toBeNull();
  });

  it("opens the tag modal after file is selected via the hidden input", async () => {
    render(
      <CapturePhotoFab
        inspectionId="i_1"
        inspectionStatus="DRAFT"
        onUploaded={vi.fn()}
      />,
    );
    await selectFileAndOpenModal();
  });

  it("uses the direct upload path when online and the route succeeds (regression guard)", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: 201,
      ok: true,
      json: async () => ({ photo: { id: "p1", url: "u", thumbnailUrl: null } }),
    });
    const onUploaded = vi.fn();

    render(
      <CapturePhotoFab
        inspectionId="i_1"
        inspectionStatus="DRAFT"
        onUploaded={onUploaded}
      />,
    );
    await selectFileAndOpenModal();
    clickSave();

    await waitFor(() =>
      expect(onUploaded).toHaveBeenCalledWith({
        id: "p1",
        url: "u",
        thumbnailUrl: null,
      }),
    );
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(queueEvidenceUpload).not.toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith("Photo saved");
  });

  it("queues the capture instead of hard-failing when offline", async () => {
    Object.defineProperty(window.navigator, "onLine", {
      value: false,
      configurable: true,
    });
    queueEvidenceUpload.mockResolvedValue("ev-1");

    render(
      <CapturePhotoFab
        inspectionId="i_1"
        inspectionStatus="DRAFT"
        onUploaded={vi.fn()}
      />,
    );
    await selectFileAndOpenModal();
    clickSave();

    await waitFor(() => expect(queueEvidenceUpload).toHaveBeenCalledTimes(1));
    expect(queueEvidenceUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        inspectionId: "i_1",
        filename: "head.jpg",
        mimeType: "image/jpeg",
      }),
    );
    expect(fetch).not.toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith(
      "Saved — will upload when back online",
    );
  });

  it("falls back to the queue when the direct upload returns a 5xx", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: 503,
      ok: false,
      json: async () => ({ error: "Storage unavailable" }),
    });
    queueEvidenceUpload.mockResolvedValue("ev-2");

    render(
      <CapturePhotoFab
        inspectionId="i_1"
        inspectionStatus="DRAFT"
        onUploaded={vi.fn()}
      />,
    );
    await selectFileAndOpenModal();
    clickSave();

    await waitFor(() => expect(queueEvidenceUpload).toHaveBeenCalledTimes(1));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalledWith(
      "Saved — will upload when back online",
    );
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("falls back to the queue on a network error even when navigator.onLine reports true", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
      new TypeError("Failed to fetch"),
    );
    queueEvidenceUpload.mockResolvedValue("ev-3");

    render(
      <CapturePhotoFab
        inspectionId="i_1"
        inspectionStatus="DRAFT"
        onUploaded={vi.fn()}
      />,
    );
    await selectFileAndOpenModal();
    clickSave();

    await waitFor(() => expect(queueEvidenceUpload).toHaveBeenCalledTimes(1));
    expect(toast.success).toHaveBeenCalledWith(
      "Saved — will upload when back online",
    );
  });
});
