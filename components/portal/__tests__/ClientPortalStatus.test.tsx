// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ClientPortalStatus } from "../ClientPortalStatus";

beforeEach(() => vi.restoreAllMocks());

const feed = {
  currentStep: "Scope prepared",
  progressPct: 75,
  steps: [
    { key: "SUBMITTED", label: "Submitted", done: true },
    { key: "SCOPED", label: "Scope prepared", done: true },
    { key: "COMPLETED", label: "Completed", done: false },
  ],
  reportReady: false,
  pendingApprovals: [
    { id: "ra_1", type: "SCOPE_OF_WORK", label: "Scope of works" },
  ],
  dryingTimeline: [
    {
      areaId: "area_1",
      areaLabel: "Master Bedroom",
      status: "on-track" as const,
      estimateLabel: "Estimate: on track — expected dry by 12 July 2026.",
    },
    {
      areaId: "area_2",
      areaLabel: "Hallway",
      status: "needs-attention" as const,
      estimateLabel:
        "Estimate: needs attention — revised estimate dry by 20 July 2026.",
    },
  ],
};

describe("ClientPortalStatus", () => {
  it("renders the polled feed: step, progress, and pending approvals", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({ ok: true, json: async () => ({ data: feed }) }),
    );
    render(<ClientPortalStatus token="tok" />);
    await waitFor(() =>
      expect(screen.getByRole("progressbar")).toHaveAttribute(
        "aria-valuenow",
        "75",
      ),
    );
    expect(screen.getAllByText("Scope prepared").length).toBeGreaterThan(0);
    expect(screen.getByRole("status")).toHaveTextContent(/Scope of works/);
  });

  it("renders nothing until the feed loads", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    const { container } = render(<ClientPortalStatus token="tok" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the curated per-area drying timeline with on-track/needs-attention badges", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({ ok: true, json: async () => ({ data: feed }) }),
    );
    render(<ClientPortalStatus token="tok" />);

    await waitFor(() => expect(screen.getByText("Master Bedroom")).toBeInTheDocument());
    expect(screen.getByText("Hallway")).toBeInTheDocument();
    expect(screen.getByText("On track")).toBeInTheDocument();
    expect(screen.getByText("Needs attention")).toBeInTheDocument();
    expect(
      screen.getByText(/Estimate: on track — expected dry by/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Estimate: needs attention — revised estimate dry by/),
    ).toBeInTheDocument();
  });

  it("never renders a raw numeric moisture/percentage value in the drying timeline", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({ ok: true, json: async () => ({ data: feed }) }),
    );
    render(<ClientPortalStatus token="tok" />);
    await waitFor(() => expect(screen.getByText("Master Bedroom")).toBeInTheDocument());

    const timelineSection = screen.getByText("Drying progress by area")
      .closest("div") as HTMLElement;
    expect(timelineSection.textContent).not.toMatch(/\d+(\.\d+)?%/);
  });
});
