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

describe("DocumentExportPackage — honest exports", () => {
  it("offers PDF, Word, ZIP, and JSON — no Coming Soon CTAs", () => {
    render(<DocumentExportPackage reportId="r1" />);
    expect(screen.getByRole("button", { name: /export pdf/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /export word/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /export zip/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /export json/i })).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: /coming soon/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/Email delivery from this screen/i)).toBeInTheDocument();
  });

  it("fires a success toast after a real PDF export", async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      blob: async () => new Blob(["%PDF-1.4"], { type: "application/pdf" }),
    });

    render(<DocumentExportPackage reportId="r1" />);
    fireEvent.click(screen.getByRole("button", { name: /export pdf/i }));

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        expect.stringMatching(/exported successfully as PDF/i),
      );
    });
  });

  it("requests ZIP and saves a .zip download", async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      blob: async () =>
        new Blob(["PK\u0003\u0004"], { type: "application/zip" }),
    });

    render(<DocumentExportPackage reportId="r1" />);
    fireEvent.click(screen.getByRole("button", { name: /export zip/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("format=zip"),
      );
      expect(toast.success).toHaveBeenCalledWith(
        expect.stringMatching(/exported successfully as ZIP/i),
      );
    });
  });
});
