import { describe, expect, it } from "vitest";
import { buildAdjusterScopeCsvFromInspection } from "../scope-adjuster-csv";

describe("scope-adjuster-csv", () => {
  it("renders selected scope lines with linked costs", () => {
    const csv = buildAdjusterScopeCsvFromInspection({
      jobNumber: "JOB-1",
      claimReference: "CLM-9",
      propertyAddress: "1 Test St",
      scopeItems: [
        {
          id: "s1",
          itemType: "install_dehumidification",
          description: "LGR dehumidifier",
          quantity: 3,
          unit: "days",
          clauseRef: "S500:2021 §12",
          isRequired: true,
          isSelected: true,
          justification: "Class 2 water",
        },
        {
          id: "s2",
          itemType: "remove_carpet",
          description: "Lift carpet",
          quantity: 12,
          unit: "m2",
          clauseRef: null,
          isRequired: false,
          isSelected: false,
          justification: null,
        },
      ],
      costEstimates: [
        {
          scopeItemId: "s1",
          category: "Equipment",
          description: "LGR dehumidifier",
          quantity: 3,
          unit: "days",
          rate: 120,
          subtotal: 360,
        },
      ],
    });

    expect(csv).toMatch(/claim_reference,CLM-9/);
    expect(csv).toMatch(/install_dehumidification/);
    expect(csv).toMatch(/360\.00/);
    expect(csv).not.toMatch(/remove_carpet/);
  });
});