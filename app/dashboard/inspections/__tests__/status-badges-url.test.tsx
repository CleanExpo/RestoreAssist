// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const h = vi.hoisted(() => ({
  urls: [] as (string | null)[],
  query: "",
  rows: [] as Array<Record<string, unknown>>,
  replace: vi.fn(),
}));

vi.mock("@/lib/hooks/useFetch", () => ({
  useFetch: (url: string | null) => {
    h.urls.push(url);
    return {
      data: { inspections: h.rows },
      loading: false,
      error: null,
      refetch: () => {},
    };
  },
}));
vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { user: { id: "u-1", role: "MANAGER" } },
    status: "authenticated",
  }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: h.replace }),
  useSearchParams: () => new URLSearchParams(h.query),
}));

import InspectionsPage from "@/app/dashboard/inspections/page";

const row = (id: string, status: string) => ({
  id,
  inspectionNumber: id,
  propertyAddress: "1 Test St",
  propertyPostcode: "4000",
  technicianName: null,
  technicianId: null,
  status,
  inspectionDate: null,
  createdAt: "2026-10-01T00:00:00Z",
  submittedAt: null,
  processedAt: null,
  moistureReadings: [],
  affectedAreas: [],
  environmentalData: null,
  classifications: [],
  photos: [],
});

const SCHEMA = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
const ENUM_BODY = /enum InspectionStatus \{([^}]*)\}/.exec(SCHEMA)?.[1] ?? "";
const ENUM_VALUES = ENUM_BODY.split("\n")
  .map((line) => line.replace(/\/\/.*/, "").trim())
  .filter(Boolean)
  .map((line) => line.split(/\s+/)[0]);

const LABELS: Record<string, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  PROCESSING: "Processing",
  CLASSIFIED: "Classified",
  SCOPED: "Scoped",
  ESTIMATED: "Estimated",
  COMPLETED: "Completed",
  REJECTED: "Rejected",
  IN_BILLING: "In billing",
  CLOSED: "Closed",
  ARCHIVED: "Archived",
};

beforeEach(() => {
  h.urls = [];
  h.query = "";
  h.rows = [];
  h.replace.mockReset();
});
afterEach(cleanup);

describe("job status badges (RA-8146)", () => {
  it("reads the real enum, as a positive control", () => {
    expect(ENUM_VALUES).toContain("IN_BILLING");
    expect(ENUM_VALUES.length).toBeGreaterThanOrEqual(11);
  });

  it.each(ENUM_VALUES)("gives %s its own badge, not Draft", (status) => {
    h.rows = [row("JOB-1", status)];
    render(<InspectionsPage />);
    expect(LABELS[status]).toBeDefined();
    // Once as the pill and once as the badge on the row.
    expect(screen.getByRole("button", { name: `${LABELS[status]} (1)` })).toBeInTheDocument();
    expect(screen.getByText(LABELS[status])).toBeInTheDocument();
    if (status !== "DRAFT") expect(screen.queryByText("Draft")).toBeNull();
  });

  it("never calls an unknown status a draft", () => {
    h.rows = [row("JOB-1", "SOMETHING_NEW")];
    render(<InspectionsPage />);
    expect(screen.queryByText("Draft")).toBeNull();
    expect(screen.getByText("SOMETHING_NEW")).toBeInTheDocument();
  });
});

describe("the status pill lives in the URL (RA-8146)", () => {
  beforeEach(() => {
    h.rows = [row("JOB-DRAFT", "DRAFT"), row("JOB-CLOSED", "CLOSED")];
  });

  it("writes a chosen pill to the URL and filters only once the URL says so", () => {
    h.replace.mockImplementation((url: string) => {
      h.query = url.split("?")[1] ?? "";
    });
    const { rerender } = render(<InspectionsPage />);
    expect(screen.getByText("JOB-DRAFT")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Closed (1)" }));
    expect(h.replace).toHaveBeenCalledWith("/dashboard/inspections?status=CLOSED");
    rerender(<InspectionsPage />);
    expect(screen.queryByText("JOB-DRAFT")).toBeNull();
    expect(screen.getByText("JOB-CLOSED")).toBeInTheDocument();
  });

  it("holds no filter the URL does not hold, so Back cannot bring one back", () => {
    // Choose Draft, then arrive on ?status=active, then go Back to no query.
    h.replace.mockImplementation((url: string) => {
      h.query = url.split("?")[1] ?? "";
    });
    const { rerender } = render(<InspectionsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Draft (1)" }));
    rerender(<InspectionsPage />);
    h.query = "status=active";
    rerender(<InspectionsPage />);
    h.query = "";
    rerender(<InspectionsPage />);
    expect(screen.getByText("JOB-CLOSED")).toBeInTheDocument();
    expect(screen.getByText("JOB-DRAFT")).toBeInTheDocument();
  });

  it("clears a chosen pill from the URL when it is clicked again", () => {
    h.query = "status=DRAFT";
    render(<InspectionsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Draft (1)" }));
    expect(h.replace).toHaveBeenCalledWith("/dashboard/inspections");
  });

  it("opens a shared link on its filter, and still fetches the whole list", () => {
    h.query = "status=CLOSED";
    render(<InspectionsPage />);
    expect(screen.queryByText("JOB-DRAFT")).toBeNull();
    expect(screen.getByText("JOB-CLOSED")).toBeInTheDocument();
    expect(h.urls.at(-1)).toBe("/api/inspections");
  });

  it("ignores a status it does not know", () => {
    h.query = "status=%3Cscript%3E";
    render(<InspectionsPage />);
    expect(screen.getByText("JOB-DRAFT")).toBeInTheDocument();
    expect(screen.getByText("JOB-CLOSED")).toBeInTheDocument();
    expect(h.urls.at(-1)).toBe("/api/inspections");
  });
});
