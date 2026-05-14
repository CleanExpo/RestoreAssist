// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CapturePhotoTagModal } from "../CapturePhotoTagModal";

const blob = new Blob([new Uint8Array([0xff, 0xd8, 0xff])], {
  type: "image/jpeg",
});
const sampleFile = new File([blob], "head.jpg", { type: "image/jpeg" });

beforeEach(() => {
  if (typeof URL.createObjectURL === "undefined") {
    // @ts-expect-error — jsdom polyfill
    URL.createObjectURL = vi.fn(() => "blob:mock");
  }
  if (typeof URL.revokeObjectURL === "undefined") {
    // @ts-expect-error — jsdom polyfill
    URL.revokeObjectURL = vi.fn();
  }
});

describe("CapturePhotoTagModal", () => {
  it("returns null when file is null", () => {
    const { container } = render(
      <CapturePhotoTagModal
        file={null}
        sha256={null}
        gps={null}
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders preview when file is provided", () => {
    render(
      <CapturePhotoTagModal
        file={sampleFile}
        sha256="abc123"
        gps={null}
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByAltText(/preview/i)).toBeInTheDocument();
  });

  it("shows GPS readout when gps is provided", () => {
    render(
      <CapturePhotoTagModal
        file={sampleFile}
        sha256="abc123"
        gps={{ lat: -27.4698, lng: 153.0251 }}
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByText(/-27.4698/)).toBeInTheDocument();
  });

  it("shows GPS unavailable when gps is null", () => {
    render(
      <CapturePhotoTagModal
        file={sampleFile}
        sha256="abc123"
        gps={null}
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByText(/GPS unavailable/i)).toBeInTheDocument();
  });

  it("calls onSubmit with caption + file + sha256 + gps + capturedAtUtc", () => {
    const onSubmit = vi.fn();
    render(
      <CapturePhotoTagModal
        file={sampleFile}
        sha256="abc123"
        gps={{ lat: 1, lng: 2 }}
        onCancel={vi.fn()}
        onSubmit={onSubmit}
      />,
    );
    fireEvent.change(screen.getByPlaceholderText(/Description/i), {
      target: { value: " moisture in north wall " },
    });
    fireEvent.click(screen.getByRole("button", { name: /Save photo/i }));
    expect(onSubmit).toHaveBeenCalledWith({
      file: sampleFile,
      caption: "moisture in north wall",
      sha256: "abc123",
      gps: { lat: 1, lng: 2 },
      capturedAtUtc: expect.any(String),
    });
  });
});
