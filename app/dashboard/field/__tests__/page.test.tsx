// @vitest-environment jsdom
/**
 * RA-7711 (B) — Field Mode hid active jobs.
 *
 * Observed live 2026-09-23: /dashboard/field showed an August DRAFT as the
 * only active job while the ESTIMATED job NIR-2026-09-F1C142, with a
 * technician assigned, was missing. The page asked only for DRAFT, SUBMITTED,
 * PROCESSING, CLASSIFIED and SCOPED, then filtered to the same list.
 *
 * A failed load must never read as "0 active jobs": it must render a visible
 * error (role="alert") with a Retry control.
 */
import type { ReactNode } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/components/mobile/MobileNav", () => ({ MobileNav: () => null }));
vi.mock("@/lib/capacitor", () => ({ isCapacitor: () => false }));
const getCachedJobs = vi.fn();
vi.mock("@/lib/offline/job-cache", () => ({
  cacheJobs: vi.fn(async () => undefined),
  getCachedJobs: (...a: unknown[]) => getCachedJobs(...a),
}));

import FieldDashboardPage from "../page";

const fetchMock = vi.fn();

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const ESTIMATED_JOB = {
  id: "insp-est",
  inspectionNumber: "NIR-2026-09-F1C142",
  propertyAddress: "12 Estimate Road, Parramatta NSW 2150",
  status: "ESTIMATED",
  inspectionDate: "2026-09-20T00:00:00.000Z",
};
const DRAFT_JOB = {
  id: "insp-draft",
  inspectionNumber: "NIR-2026-08-AAAAAA",
  propertyAddress: "1 August Street, Sydney NSW 2000",
  status: "DRAFT",
  inspectionDate: "2026-08-10T00:00:00.000Z",
};

beforeEach(() => {
  fetchMock.mockReset();
  getCachedJobs.mockReset();
  getCachedJobs.mockResolvedValue({ jobs: [], fetchedAt: null });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function listUrl(): string {
  const call = fetchMock.mock.calls.find(([u]) =>
    String(u).startsWith("/api/inspections?"),
  );
  return String(call?.[0] ?? "");
}

describe("Field Mode active jobs (RA-7711)", () => {
  it("lists an ESTIMATED job and asks for every active status for this technician", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.startsWith("/api/inspections?")) {
        return jsonResponse({ inspections: [DRAFT_JOB, ESTIMATED_JOB] });
      }
      return jsonResponse({ criticalMissing: [], readyToLeave: false });
    });

    render(<FieldDashboardPage />);

    expect(await screen.findByText("NIR-2026-09-F1C142")).toBeInTheDocument();
    expect(screen.getByText("2 active jobs")).toBeInTheDocument();

    const url = new URL(listUrl(), "http://localhost");
    expect(url.searchParams.get("status")?.split(",")).toEqual([
      "DRAFT",
      "SUBMITTED",
      "PROCESSING",
      "CLASSIFIED",
      "SCOPED",
      "ESTIMATED",
      "IN_BILLING",
    ]);
    expect(url.searchParams.get("assignee")).toBe("me");
  });

  it("asks for the route's largest page, so owners see more than one default page", async () => {
    // GET /api/inspections reads `limit` (default 20, capped at 100) and
    // ignores `take`, so take=10 returned 20 jobs at most.
    fetchMock.mockImplementation(async (url: string) => {
      if (url.startsWith("/api/inspections?")) {
        return jsonResponse({ inspections: [ESTIMATED_JOB] });
      }
      return jsonResponse({ criticalMissing: [], readyToLeave: false });
    });

    render(<FieldDashboardPage />);
    expect(await screen.findByText("NIR-2026-09-F1C142")).toBeInTheDocument();

    const url = new URL(listUrl(), "http://localhost");
    expect(url.searchParams.get("limit")).toBe("100");
    expect(url.searchParams.has("take")).toBe(false);
  });

  it("shows an alert with Retry, not '0 active jobs', when the server refuses", async () => {
    fetchMock.mockImplementation(async () =>
      jsonResponse({ error: "Internal server error" }, 500),
    );

    render(<FieldDashboardPage />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/could not load/i);
    expect(
      screen.getByRole("button", { name: /retry/i }),
    ).toBeVisible();
    expect(screen.queryByText("0 active jobs")).not.toBeInTheDocument();
    expect(screen.queryByText("No active jobs")).not.toBeInTheDocument();
  });

  it("shows an alert with Retry when the request itself fails and nothing is cached", async () => {
    fetchMock.mockImplementation(async () => {
      throw new TypeError("Failed to fetch");
    });

    render(<FieldDashboardPage />);

    await screen.findByRole("alert");
    expect(screen.getByRole("button", { name: /retry/i })).toBeVisible();
    expect(screen.queryByText("0 active jobs")).not.toBeInTheDocument();
  });

  it("Retry reloads and then lists the jobs", async () => {
    let fail = true;
    fetchMock.mockImplementation(async (url: string) => {
      if (url.startsWith("/api/inspections?")) {
        return fail
          ? jsonResponse({ error: "Internal server error" }, 500)
          : jsonResponse({ inspections: [ESTIMATED_JOB] });
      }
      return jsonResponse({ criticalMissing: [], readyToLeave: false });
    });

    render(<FieldDashboardPage />);
    await screen.findByRole("alert");

    fail = false;
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    });

    await waitFor(() =>
      expect(screen.getByText("NIR-2026-09-F1C142")).toBeInTheDocument(),
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
