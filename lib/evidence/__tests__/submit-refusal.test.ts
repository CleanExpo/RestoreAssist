// RA-8388: a refused submit must tell the technician what is missing and
// where to fix it. Before this, the capture page toasted `data.error`, so a
// job with no affected area showed the raw code "MISSING_AFFECTED_AREAS" and
// nothing to click.
import { describe, it, expect } from "vitest";
import { describeSubmitRefusal } from "../submit-refusal";
import { CRITICAL_FIELDS } from "@/lib/nir-tiered-completion";
import type { SubmissionValidationReason } from "@/lib/services/inspection/validate-submission";

const ID = "insp-1";

describe("describeSubmitRefusal", () => {
  it("turns MISSING_AFFECTED_AREAS into a plain sentence and a link to the Areas tab", () => {
    const refusal = describeSubmitRefusal(ID, {
      error: "MISSING_AFFECTED_AREAS",
    });
    expect(refusal.message).not.toMatch(/MISSING_/);
    expect(refusal.items).toEqual([
      {
        key: "affectedAreas",
        label: "No affected area has been added to this job",
        href: "/dashboard/inspections/insp-1?tab=areas&addArea=1",
        action: "Add an affected area",
      },
    ]);
  });

  it("gives every 422 code the service can return a named item and a page", () => {
    // Typed against the service's own union: a new reason added there fails
    // to compile here until it is given somewhere to go.
    const codes: Record<
      Exclude<SubmissionValidationReason, "INVALID_STATUS">,
      string
    > = {
      MISSING_AFFECTED_AREAS: "tab=areas",
      MISSING_MOISTURE_READINGS: "tab=moisture",
      MISSING_PHOTOS: "tab=photos",
    };
    for (const [code, tab] of Object.entries(codes)) {
      const refusal = describeSubmitRefusal(ID, { error: code });
      expect(refusal.items, code).toHaveLength(1);
      expect(refusal.items[0].href, code).toContain(tab);
      expect(refusal.message, code).not.toContain(code);
    }
  });

  it("explains INVALID_STATUS without showing the code and offers nothing to fix", () => {
    const refusal = describeSubmitRefusal(ID, {
      error: "INVALID_STATUS",
      detail: "Inspection is in 'SUBMITTED', expected 'DRAFT'",
    });
    expect(refusal.message).toMatch(/already been submitted/);
    expect(refusal.message).not.toMatch(/INVALID_STATUS/);
    expect(refusal.items).toEqual([]);
  });

  it("maps every critical field the tiered gate can report to a link", () => {
    // Driven from the gate's own list, so a critical field added there is
    // covered here without anyone remembering to update this test.
    const refusal = describeSubmitRefusal(ID, {
      error: "Inspection cannot be submitted — critical fields missing",
      missingCritical: CRITICAL_FIELDS.map((f) => ({
        field: f.fieldName,
        label: f.label,
      })),
    });
    expect(refusal.items).toHaveLength(CRITICAL_FIELDS.length);
    for (const item of refusal.items) {
      expect(item.href.startsWith("/dashboard/inspections/insp-1")).toBe(true);
      expect(item.label.length).toBeGreaterThan(0);
      expect(item.action.length).toBeGreaterThan(0);
    }
    const areas = refusal.items.find((i) => i.key === "affectedAreas");
    expect(areas?.href).toBe(
      "/dashboard/inspections/insp-1?tab=areas&addArea=1",
    );
    const postcode = refusal.items.find((i) => i.key === "propertyPostcode");
    expect(postcode?.label).toBe("Missing: Property postcode");
    expect(refusal.message).toBe(
      `${CRITICAL_FIELDS.length} things are missing before this inspection can be submitted.`,
    );
  });

  it("uses the server's sentence for the shared error envelope", () => {
    const refusal = describeSubmitRefusal(ID, {
      error: {
        code: "VALIDATION",
        message:
          "A location-only moisture reading may refer to a renamed affected area",
      },
    });
    expect(refusal.message).toBe(
      "A location-only moisture reading may refer to a renamed affected area",
    );
    expect(refusal.items).toEqual([]);
  });

  // The bodies below are copied from what the submit route builds for each
  // gate after the two above (app/api/inspections/[id]/submit/route.ts), so
  // none of them can fall through to "Please try again".
  it("names each stabilisation blocker instead of dropping the list", () => {
    const refusal = describeSubmitRefusal(ID, {
      error:
        "Stabilisation checklist incomplete — required per ANSI/IICRC S500:2021",
      blockers: [
        { action: "ELECTRICAL_ISOLATION", label: "Electrical isolation" },
        { action: "WATER_SHUTOFF", label: "Water shut-off" },
      ],
    });
    expect(refusal.message).toBe(
      "Stabilisation checklist incomplete — required per ANSI/IICRC S500:2021",
    );
    expect(refusal.items).toEqual([
      { key: "blocker-0", label: "Electrical isolation" },
      { key: "blocker-1", label: "Water shut-off" },
    ]);
    // No screen is known for these, so no link is invented.
    expect(refusal.items.every((i) => i.href === undefined)).toBe(true);
  });

  it("names sentence blockers from the scope-variation and NZ building gates", () => {
    const variation = describeSubmitRefusal(ID, {
      error: "Scope variations pending approval",
      blockers: ["Variation pending approval: extra drying (delta: $120.00)"],
    });
    expect(variation.message).toBe("Scope variations pending approval");
    expect(variation.items).toEqual([
      {
        key: "blocker-0",
        label: "Variation pending approval: extra drying (delta: $120.00)",
      },
    ]);
    const nz = describeSubmitRefusal(ID, {
      error: "NZBS clauses not addressed",
      blockers: ["NZBC E2 (External moisture) must be evaluated before submission"],
      requiredClauses: [],
    });
    expect(nz.items).toHaveLength(1);
  });

  it("passes the fire walkthrough and tenancy sentences through unchanged", () => {
    const fire = describeSubmitRefusal(ID, {
      error:
        "The fire and smoke walkthrough has not been signed off by the technician.",
      code: "UNSIGNED",
      openSectionIds: [],
    });
    expect(fire.message).toBe(
      "The fire and smoke walkthrough has not been signed off by the technician.",
    );
    expect(fire.message).not.toContain("UNSIGNED");
    const tenancy = describeSubmitRefusal(ID, { error: "Inspection not found" });
    expect(tenancy.message).toBe("Inspection not found");
  });

  it("never shows an unknown raw code", () => {
    for (const body of [
      { error: "SOME_NEW_CODE" },
      { error: { code: "X", message: "SOME_NEW_CODE" } },
      { error: "" },
      {},
      null,
      "nope",
    ]) {
      const refusal = describeSubmitRefusal(ID, body);
      expect(refusal.message).toBe(
        "This inspection could not be submitted. Please try again.",
      );
      expect(refusal.items).toEqual([]);
    }
  });

  it("ignores malformed missingCritical entries instead of inventing items", () => {
    const refusal = describeSubmitRefusal(ID, {
      error: "Inspection cannot be submitted — critical fields missing",
      missingCritical: [null, { label: "no field" }, 7],
    });
    expect(refusal.items).toEqual([]);
    expect(refusal.message).toBe(
      "Inspection cannot be submitted — critical fields missing",
    );
  });
});
