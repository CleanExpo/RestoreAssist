// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CapturePhotoFab } from "../CapturePhotoFab";

vi.mock("@/lib/capture/cocoa-client", () => ({
  computeSha256: vi.fn(async () => "abc123"),
  getCurrentGps: vi.fn(async () => null),
}));

vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

global.fetch = vi.fn() as unknown as typeof fetch;

beforeEach(() => {
  vi.clearAllMocks();
  if (typeof URL.createObjectURL === "undefined") {
    // @ts-expect-error jsdom polyfill
    URL.createObjectURL = vi.fn(() => "blob:mock");
  }
  if (typeof URL.revokeObjectURL === "undefined") {
    // @ts-expect-error jsdom polyfill
    URL.revokeObjectURL = vi.fn();
  }
});

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
  });
});
