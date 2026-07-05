import { describe, it, expect } from "vitest";
import {
  renderDryingUpdateEmail,
  renderStepTransitionEmail,
} from "../templates";
import { buildClientStatusFeed } from "@/lib/portal/client-status-feed";
import { buildDryingTimeline } from "@/lib/portal/drying-timeline";

const PORTAL_URL = "https://app.example.com/portal/tok_123";

describe("renderStepTransitionEmail", () => {
  it("renders the curated stage label, progress and portal deep link", () => {
    const feed = buildClientStatusFeed({
      status: "SCOPED",
      workflow: null,
      reportStatus: null,
      pendingApprovals: [],
    });
    const email = renderStepTransitionEmail(feed, PORTAL_URL);

    expect(email.templateKey).toBe("pulse-step-transition");
    expect(email.subject).toContain("Scope prepared");
    expect(email.html).toContain("Scope prepared");
    expect(email.html).toContain("75%");
    expect(email.html).toContain(PORTAL_URL);
    expect(email.text).toContain("Scope prepared");
    expect(email.text).toContain(PORTAL_URL);
  });
});

describe("renderDryingUpdateEmail", () => {
  it("renders each curated area state with a plain-English status label", () => {
    const email = renderDryingUpdateEmail(
      [
        {
          areaId: "a1",
          areaLabel: "Kitchen",
          status: "on-track",
          estimateLabel: "Estimate: on track — expected dry by 10 July 2026.",
        },
        {
          areaId: "a2",
          areaLabel: "Hallway",
          status: "needs-attention",
          estimateLabel:
            "Estimate: needs attention — revised estimate dry by 14 July 2026.",
        },
      ],
      PORTAL_URL,
    );

    expect(email.templateKey).toBe("pulse-drying-update");
    expect(email.html).toContain("Kitchen");
    expect(email.html).toContain("On track");
    expect(email.html).toContain("Hallway");
    expect(email.html).toContain("Needs attention");
    expect(email.html).toContain(PORTAL_URL);
  });

  // Mirrors PR #1777 (RA-6950): drying logs are legal exhibits — the client
  // email must never expose a raw moisture reading, threshold or MC% value.
  it("never exposes raw moisture readings, thresholds or percentages", () => {
    const rawMoistureValues = [37.42, 68.91];
    const areas = buildDryingTimeline({
      areas: [
        { id: "a1", roomZoneId: "Kitchen" },
        { id: "a2", roomZoneId: "Hallway" },
      ],
      readings: [
        {
          location: "Kitchen",
          surfaceType: "plasterboard",
          moistureLevel: rawMoistureValues[0],
          recordedAt: "2026-07-01T00:00:00.000Z",
        },
        {
          location: "Kitchen",
          surfaceType: "plasterboard",
          moistureLevel: 22,
          recordedAt: "2026-07-04T00:00:00.000Z",
        },
        {
          location: "Hallway",
          surfaceType: "timber",
          moistureLevel: rawMoistureValues[1],
          recordedAt: "2026-07-01T00:00:00.000Z",
        },
        {
          location: "Hallway",
          surfaceType: "timber",
          moistureLevel: 60,
          recordedAt: "2026-07-04T00:00:00.000Z",
        },
      ],
      now: new Date("2026-07-06T00:00:00.000Z"),
    });

    expect(areas.length).toBeGreaterThan(0); // both areas have readings

    const email = renderDryingUpdateEmail(areas, PORTAL_URL);
    const serialized = `${email.subject}\n${email.html}\n${email.text}`;

    for (const raw of rawMoistureValues) {
      expect(serialized).not.toContain(String(raw));
    }
    // No MC percentage or moisture jargon leaks into the body copy (curated
    // dates + status labels only).
    expect(email.text).not.toMatch(/%/);
    expect(serialized.toLowerCase()).not.toContain("moisture");
    expect(serialized.toLowerCase()).not.toContain("mc%");
  });
});
