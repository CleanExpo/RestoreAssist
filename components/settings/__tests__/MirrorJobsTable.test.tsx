// @vitest-environment jsdom
/**
 * RA-8451 — a DEAD_LETTER mirror job shows a coloured badge and a Retry
 * button, and a retry the server refuses never shows the row as PENDING.
 */
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

import toast from "react-hot-toast";
import { MirrorJobsTable } from "@/components/settings/MirrorJobsTable";

const deadJob = {
  id: "job_dead",
  kind: "PHOTO",
  status: "DEAD_LETTER",
  filename: "photo.jpg",
  attempts: 5,
  lastError: "download failed",
  lastAttemptAt: null,
  nextAttemptAt: "2026-11-18T00:00:00.000Z",
  completedAt: null,
  createdAt: "2026-11-18T00:00:00.000Z",
  driveViewUrl: null,
};

const stats = {
  total: 1,
  pending: 0,
  processing: 0,
  completed: 0,
  failed: 0,
  deadLettered: 1,
  lastCompletedAt: null,
};

function mockFetch(
  retryResponse: { ok: boolean; status: number; body: unknown },
  job: Record<string, unknown> = deadJob,
) {
  global.fetch = vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === "POST") {
      return {
        ok: retryResponse.ok,
        status: retryResponse.status,
        json: async () => retryResponse.body,
      } as Response;
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ data: { jobs: [job], stats } }),
    } as Response;
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("MirrorJobsTable", () => {
  it("renders a coloured badge and a Retry button for a DEAD_LETTER job", async () => {
    mockFetch({ ok: true, status: 200, body: { data: { retried: true } } });
    render(<MirrorJobsTable />);
    const badge = await screen.findByText("DEAD_LETTER");
    expect(badge.className).not.toContain("undefined");
    expect(badge.className).toMatch(/bg-/);
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("shows PENDING only after the server confirms the retry", async () => {
    mockFetch({ ok: true, status: 200, body: { data: { retried: true } } });
    render(<MirrorJobsTable />);
    fireEvent.click(await screen.findByRole("button", { name: /retry/i }));
    await waitFor(() => expect(screen.getByText("PENDING")).toBeInTheDocument());
    expect(toast.success).toHaveBeenCalled();
  });

  it("keeps the row DEAD_LETTER and shows the reason when the retry is refused", async () => {
    mockFetch({
      ok: false,
      status: 409,
      body: { error: "This job is no longer waiting for a retry" },
    });
    render(<MirrorJobsTable />);
    fireEvent.click(await screen.findByRole("button", { name: /retry/i }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringContaining("no longer waiting"),
      ),
    );
    expect(screen.queryByText("PENDING")).not.toBeInTheDocument();
    expect(screen.getByText("DEAD_LETTER")).toBeInTheDocument();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("does not show PENDING when the server answers 200 with retried:false", async () => {
    mockFetch(
      { ok: true, status: 200, body: { data: { retried: false } } },
      { ...deadJob, status: "FAILED" },
    );
    render(<MirrorJobsTable />);
    fireEvent.click(await screen.findByRole("button", { name: /retry/i }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(screen.queryByText("PENDING")).not.toBeInTheDocument();
    expect(toast.success).not.toHaveBeenCalled();
  });
});
