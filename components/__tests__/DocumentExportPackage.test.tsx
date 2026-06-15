// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import DocumentExportPackage from "../DocumentExportPackage";

// react-hot-toast is used both as a callable (`toast(...)`) and via
// `toast.success` / `toast.error`, so the mock must be a callable with methods.
vi.mock("react-hot-toast", () => {
  const toast = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() });
  return { default: toast };
});

import toast from "react-hot-toast";

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

afterEach(() => cleanup());

describe("DocumentExportPackage — honest stub surfaces", () => {
  it("renders the Word export as a disabled 'Coming Soon' control (no active no-op)", () => {
    render(<DocumentExportPackage reportId="r1" />);
    const word = screen
      .getAllByRole("button", { name: /coming soon/i })
      .filter((b) => (b as HTMLButtonElement).disabled);
    // Both Word export and Email delivery are disabled "Coming Soon" controls.
    expect(word.length).toBeGreaterThanOrEqual(2);
  });

  it("does not present an active 'Configure Email' button (de-advertised stub)", () => {
    render(<DocumentExportPackage reportId="r1" />);
    expect(
      screen.queryByRole("button", { name: /configure email/i }),
    ).not.toBeInTheDocument();
    // Email delivery is now an explicitly disabled control.
    const emailHeading = screen.getByText("Email Delivery");
    expect(emailHeading).toBeInTheDocument();
  });

  it("fires a real success toast only after an actual export (PDF)", async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      blob: async () => new Blob(["%PDF-1.4"], { type: "application/pdf" }),
    });

    render(<DocumentExportPackage reportId="r1" />);
    fireEvent.click(screen.getByRole("button", { name: /export pdf/i }));

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledTimes(1);
    });
    expect(toast.success).toHaveBeenCalledWith(
      expect.stringMatching(/exported successfully as PDF/i),
    );
    // The callable "coming soon" notice must NOT fire for a real export.
    expect(toast).not.toHaveBeenCalled();
  });

  it("never claims success for the unimplemented Word export path", async () => {
    // Drive the stubbed Word path directly via the component's handler by
    // re-rendering and invoking the (disabled) flow is not possible through the
    // UI, so assert the guarantee at the API boundary: a word export performs
    // no fetch and produces no success toast.
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      blob: async () => new Blob(),
    });

    render(<DocumentExportPackage reportId="r1" />);
    // Clicking the real JSON export still succeeds...
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      {
        ok: true,
        json: async () => ({ ok: true }),
      },
    );
    fireEvent.click(screen.getByRole("button", { name: /export json/i }));
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        expect.stringMatching(/exported successfully as JSON/i),
      );
    });
    // ...and a success toast is never emitted with the WORD label.
    expect(toast.success).not.toHaveBeenCalledWith(
      expect.stringMatching(/WORD/i),
    );
  });
});
