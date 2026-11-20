import { describe, expect, it } from "vitest";
import { buildInspectionJourneySteps } from "../inspection-journey-steps";

describe("buildInspectionJourneySteps", () => {
  it("marks floor plan done when rooms exist", () => {
    const steps = buildInspectionJourneySteps({
      inspectionId: "i1",
      status: "DRAFT",
      clientId: "c1",
      reportId: null,
      sketchRoomCount: 2,
      photoCount: 0,
      moistureCount: 0,
      hasClassification: false,
    });
    const plan = steps.find((s) => s.id === "floor-plan");
    expect(plan?.state).toBe("done");
    expect(plan?.href).toContain("tab=sketch");
  });

  it("points report step at linked report", () => {
    const steps = buildInspectionJourneySteps({
      inspectionId: "i1",
      status: "SCOPED",
      clientId: "c1",
      reportId: "r1",
      sketchRoomCount: 1,
      photoCount: 3,
      moistureCount: 2,
      hasClassification: true,
    });
    expect(steps.find((s) => s.id === "report")?.href).toBe(
      "/dashboard/reports/r1",
    );
  });

  it("marks email step done when clientEmailSent", () => {
    const steps = buildInspectionJourneySteps({
      inspectionId: "i1",
      status: "COMPLETED",
      clientId: "c1",
      reportId: "r1",
      sketchRoomCount: 1,
      photoCount: 1,
      moistureCount: 1,
      hasClassification: true,
      clientEmailSent: true,
    });
    expect(steps.find((s) => s.id === "email")?.state).toBe("done");
  });
});
