import { describe, expect, it } from "vitest";
import { buildInspectionJourneySteps } from "../inspection-journey-steps";

const base = {
  inspectionId: "insp_1",
  status: "DRAFT",
  clientId: "client_1",
  reportId: null,
  sketchRoomCount: 0,
  photoCount: 0,
  moistureCount: 0,
  hasClassification: false,
  showCompletenessInbox: true,
};

const step = (
  over: Partial<Parameters<typeof buildInspectionJourneySteps>[0]>,
  id: string,
) => buildInspectionJourneySteps({ ...base, ...over }).find((s) => s.id === id);

describe("journey steps when a check could not run", () => {
  it("says the completeness check did not run rather than showing nothing", () => {
    const shown = step({ completenessGapCount: null }, "completeness");
    expect(shown?.label).toBe("Completeness not checked");
    expect(shown?.description).toContain("Could not check");
  });

  it("shows no completeness step for a real zero", () => {
    expect(step({ completenessGapCount: 0 }, "completeness")).toBeUndefined();
  });

  it("still counts real gaps", () => {
    expect(step({ completenessGapCount: 2 }, "completeness")?.description).toContain(
      "2 evidence gaps",
    );
  });

  it("does not assume email is configured when readiness could not be read", () => {
    const shown = step({ emailServiceConfigured: null }, "email");
    expect(shown?.description).toContain("Could not check");
    expect(shown?.description).not.toContain("Send the claim portal link");
  });

  it("keeps the configured and unconfigured wording", () => {
    expect(step({ emailServiceConfigured: true }, "email")?.description).toContain(
      "Send the claim portal link",
    );
    expect(step({ emailServiceConfigured: false }, "email")?.description).toContain(
      "not configured",
    );
  });
});
