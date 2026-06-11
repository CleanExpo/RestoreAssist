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
});
