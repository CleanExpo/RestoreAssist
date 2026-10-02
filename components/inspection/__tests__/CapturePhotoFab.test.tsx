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
  vi.stubGlobal("crypto", { randomUUID: () => "synthetic-uuid" });
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
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      status: 201,
      ok: true,
      json: async () => ({ photo: { id: "p1", url: "u", thumbnailUrl: null } }),
    }).mockResolvedValueOnce({
      status: 200,
      ok: true,
      json: async () => ({ photos: [{ id: "p1", url: "u", thumbnailUrl: null }] }),
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
    expect(fetch).toHaveBeenCalledTimes(2);
    expect((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].headers).toEqual({ "Idempotency-Key": "photo-synthetic-uuid" });
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
      "Saved on this device — upload will be verified on sync",
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
      "Saved on this device — upload will be verified on sync",
    );
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("reuses the first request key and body when both upload and queue fail", async () => {
    vi.stubGlobal("crypto", { randomUUID: vi.fn().mockReturnValueOnce("first").mockReturnValueOnce("second") });
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 503, ok: false });
    queueEvidenceUpload.mockRejectedValue(new Error("Device storage full"));
    render(<CapturePhotoFab inspectionId="i_1" inspectionStatus="DRAFT" onUploaded={vi.fn()} />);
    await selectFileAndOpenModal();
    const caption = screen.getByPlaceholderText(/Description \(optional/);
    fireEvent.change(caption, { target: { value: "First caption" } });
    clickSave();
    await waitFor(() => expect(queueEvidenceUpload).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole("button", { name: "Save photo" })).toBeEnabled());
    expect(caption).toBeDisabled();
    expect(caption).toHaveValue("First caption");
    expect(screen.getByRole("status")).toHaveTextContent(/photo and caption are fixed/i);
    clickSave();
    await waitFor(() => expect(queueEvidenceUpload).toHaveBeenCalledTimes(2));
    const [first, second] = (fetch as ReturnType<typeof vi.fn>).mock.calls;
    expect(first[1].headers["Idempotency-Key"]).toBe("photo-first");
    expect(second[1].headers["Idempotency-Key"]).toBe("photo-first");
    for (const field of ["file", "caption", "cocoaSha256", "capturedAtUtc"]) {
      expect((second[1].body as FormData).get(field)).toEqual((first[1].body as FormData).get(field));
    }
    expect(screen.getByRole("button", { name: "Save photo" })).toBeEnabled();
  });

  it("retains the first request identity for an uncertain HTTP 429", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 429, ok: false });
    queueEvidenceUpload.mockResolvedValue("photo-synthetic-uuid");
    render(<CapturePhotoFab inspectionId="i_1" inspectionStatus="DRAFT" onUploaded={vi.fn()} />);
    await selectFileAndOpenModal();
    clickSave();
    await waitFor(() => expect(queueEvidenceUpload).toHaveBeenCalledWith(expect.objectContaining({ directRetryKey: "photo-synthetic-uuid" })));
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
      "Saved on this device — upload will be verified on sync",
    );
  });

  it("keeps an unverified 201 response in the queue with the first request key and custody fields", async () => {
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ status: 201, ok: true, json: async () => ({ photo: { id: "p1" } }) })
      .mockResolvedValueOnce({ status: 500, ok: false });
    queueEvidenceUpload.mockResolvedValue("photo-synthetic-uuid");
    const onUploaded = vi.fn();
    render(<CapturePhotoFab inspectionId="i_1" inspectionStatus="DRAFT" onUploaded={onUploaded} />);
    await selectFileAndOpenModal();
    clickSave();
    await waitFor(() => expect(queueEvidenceUpload).toHaveBeenCalledWith(expect.objectContaining({
      directRetryKey: "photo-synthetic-uuid", directCocoaSha256: "abc123",
    })));
    expect(onUploaded).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalledWith("Photo saved");
  });

  it("shows the message from a structured 400 error without clearing the captured file", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: 400,
      ok: false,
      json: async () => ({ error: { code: "VALIDATION", message: "Unsupported image bytes", eventId: "synthetic-event" } }),
    });
    render(<CapturePhotoFab inspectionId="i_1" inspectionStatus="DRAFT" onUploaded={vi.fn()} />);
    await selectFileAndOpenModal();
    clickSave();
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Unsupported image bytes"));
    expect(screen.getByRole("button", { name: "Save photo" })).toBeEnabled();
    expect(queueEvidenceUpload).not.toHaveBeenCalled();
  });
});
