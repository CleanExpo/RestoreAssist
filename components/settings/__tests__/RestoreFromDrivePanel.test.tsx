// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("react-hot-toast", () => ({ default: { success: vi.fn(), error: vi.fn() } }));

import { RestoreFromDrivePanel } from "@/components/settings/RestoreFromDrivePanel";

beforeEach(() => {
  global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (!init || init.method !== "POST") {
      return { ok: true, json: async () => ({ data: { fileCount: 4, stats: {} } }) } as Response;
    }
    return { ok: true, json: async () => ({ data: { enqueued: 4 } }) } as Response;
  }) as unknown as typeof fetch;
});

describe("RestoreFromDrivePanel", () => {
  it("previews the restore count, then enqueues on confirm", async () => {
    render(<RestoreFromDrivePanel />);
    fireEvent.click(screen.getByRole("button", { name: /preview/i }));
    await waitFor(() => expect(screen.getByText(/4 file/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /restore/i }));
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/storage/restore",
        expect.objectContaining({ method: "POST" }),
      ),
    );
  });
});
