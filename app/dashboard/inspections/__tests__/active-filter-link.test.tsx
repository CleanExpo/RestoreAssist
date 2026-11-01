// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

// RA-8022: the dashboard's Active Inspections card links here with
// ?status=active. The page ignored it, so the click listed every job.

const h = vi.hoisted(() => ({
  urls: [] as (string | null)[],
  query: "",
  role: "MANAGER",
}));

vi.mock("@/lib/hooks/useFetch", () => ({
  useFetch: (url: string | null) => {
    h.urls.push(url);
    return {
      data: { inspections: [] },
      loading: false,
      error: null,
      refetch: () => {},
    };
  },
}));
vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { user: { id: "u-1", role: h.role } },
    status: "authenticated",
  }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(h.query),
}));

import InspectionsPage from "@/app/dashboard/inspections/page";

beforeEach(() => {
  h.urls = [];
  h.query = "";
  h.role = "MANAGER";
});
afterEach(cleanup);

describe("jobs list ?status=active (RA-8022)", () => {
  it("asks the server for active jobs when opened from the card", () => {
    h.query = "status=active";
    render(<InspectionsPage />);
    expect(h.urls.at(-1)).toBe("/api/inspections?status=active");
  });

  it("keeps a technician scoped to their own jobs", () => {
    h.query = "status=active";
    h.role = "USER";
    render(<InspectionsPage />);
    expect(h.urls.at(-1)).toBe("/api/inspections?assignee=me&status=active");
  });

  it("lets the owner clear the filter with the All pill", () => {
    h.query = "status=active";
    render(<InspectionsPage />);
    expect(screen.getByRole("button", { name: "Active" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^All/ }));
    expect(h.urls.at(-1)).toBe("/api/inspections");
  });

  it("does not filter without the query", () => {
    render(<InspectionsPage />);
    expect(h.urls.at(-1)).toBe("/api/inspections");
    expect(screen.queryByRole("button", { name: "Active" })).toBeNull();
  });
});
