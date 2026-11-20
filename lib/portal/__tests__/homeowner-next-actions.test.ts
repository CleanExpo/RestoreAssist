import { describe, expect, it } from "vitest";
import { buildHomeownerNextActions } from "../homeowner-next-actions";
import type { PortalUpdatesFeed } from "../portal-updates-types";

const baseFeed: PortalUpdatesFeed = {
  currentStep: "Scope prepared",
  progressPct: 60,
  steps: [],
  reportReady: false,
  pendingApprovals: [],
  dryingTimeline: [],
};

describe("buildHomeownerNextActions", () => {
  it("prioritises pending approvals when interactive", () => {
    const actions = buildHomeownerNextActions({
      interactive: true,
      feed: {
        ...baseFeed,
        pendingApprovals: [
          { id: "1", type: "SCOPE", label: "Scope of works" },
        ],
      },
    });
    expect(actions[0]?.id).toBe("approvals");
    expect(actions[0]?.href).toBe("#portal-approvals");
  });

  it("surfaces report PDF when ready", () => {
    const actions = buildHomeownerNextActions({
      interactive: true,
      reportPdfHref: "/api/portal/t/pdf",
      feed: { ...baseFeed, reportReady: true },
    });
    expect(actions.some((a) => a.id === "report")).toBe(true);
  });

  it("does not suggest upload or approvals in view-only mode with pending items", () => {
    const actions = buildHomeownerNextActions({
      interactive: false,
      feed: {
        ...baseFeed,
        pendingApprovals: [
          { id: "1", type: "SCOPE", label: "Scope of works" },
        ],
      },
    });
    expect(actions.some((a) => a.id === "approvals")).toBe(false);
    expect(actions.some((a) => a.id === "upload")).toBe(false);
  });
});
