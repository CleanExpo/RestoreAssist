/**
 * Composing a job-specific SWMS.
 *
 * The bar these tests hold: `buildActivitySwms` either returns a document that
 * names the PCBU, the project and the law that applies at the project address,
 * or it throws. It never returns a partially populated SWMS, because a document
 * missing its jurisdiction is one a worker will still sign.
 */
import { describe, expect, it } from "vitest";
import {
  buildActivitySwms,
  highestResidualRisk,
  isValidAbn,
  SwmsCompositionError,
  type BuildActivitySwmsInput,
} from "../build-activity-swms";
import { SWMS_ACTIVITY_TEMPLATES } from "../activity-templates";
import { SWMS_ACTIVITY_IDS } from "../activity-templates";

function input(
  overrides: Partial<BuildActivitySwmsInput> = {},
): BuildActivitySwmsInput {
  return {
    activityId: "carpet-removal",
    pcbu: {
      companyName: "Disaster Recovery QLD",
      address: "4/17 Tile St, Wacol QLD 4076",
      abn: "42 633 062 307",
      contactName: "Paul Lederhose",
      contactPosition: "Director",
      contactPhone: "07 3879 4677",
    },
    project: {
      name: "Kitchen flood - carpet make-safe",
      address: "1 Test St, Brisbane QLD 4000",
      jurisdictionCode: "QLD",
    },
    ...overrides,
  };
}

describe("buildActivitySwms", () => {
  it.each(SWMS_ACTIVITY_IDS)("%s composes into a complete document", (id) => {
    const swms = buildActivitySwms(input({ activityId: id }));

    expect(swms.activityId).toBe(id);
    expect(swms.title.trim()).not.toBe("");
    expect(swms.rows.length).toBeGreaterThan(0);
    expect(swms.pcbu.companyName).toBe("Disaster Recovery QLD");
    expect(swms.project.address).toContain("Brisbane");
    expect(swms.reviewTriggers).toHaveLength(6);
    expect(swms.workerDeclaration.length).toBeGreaterThan(0);
    expect(swms.referenceJurisdictions).toHaveLength(10);
  });

  it("cites the law of the project's jurisdiction, not a default", () => {
    const qld = buildActivitySwms(input());
    expect(qld.applicableJurisdiction.act).toBe(
      "Work Health and Safety Act 2011 (Qld)",
    );

    const vic = buildActivitySwms(
      input({
        project: {
          name: "Burst pipe",
          address: "1 Test St, Melbourne VIC 3000",
          jurisdictionCode: "VIC",
        },
      }),
    );
    expect(vic.applicableJurisdiction.act).toBe(
      "Occupational Health and Safety Act 2004 (Vic)",
    );
    // The whole point: the same template, two jurisdictions, two Acts.
    expect(vic.applicableJurisdiction.act).not.toBe(
      qld.applicableJurisdiction.act,
    );
  });

  it("refuses an unknown activity", () => {
    expect(() =>
      buildActivitySwms(input({ activityId: "working-at-heights" })),
    ).toThrow(SwmsCompositionError);
  });

  it("refuses a jurisdiction it has no law for", () => {
    expect(() =>
      buildActivitySwms(
        input({
          project: {
            name: "Overseas job",
            address: "1 Test St, Auckland",
            jurisdictionCode: "XX",
          },
        }),
      ),
    ).toThrow(/No safety legislation is recorded/);
  });

  it("accepts New Zealand, which has no getStateInfo entry", () => {
    const nz = buildActivitySwms(
      input({
        project: {
          name: "Storm damage",
          address: "1 Test St, Auckland",
          jurisdictionCode: "NZ",
        },
      }),
    );
    expect(nz.applicableJurisdiction.act).toBe(
      "Health and Safety at Work Act 2015 (NZ)",
    );
  });

  it.each([
    ["companyName", { companyName: "" }],
    ["address", { address: "  " }],
    ["contactName", { contactName: "" }],
  ] as const)("refuses a SWMS with no PCBU %s", (_field, patch) => {
    expect(() =>
      buildActivitySwms(input({ pcbu: { ...input().pcbu, ...patch } })),
    ).toThrow(SwmsCompositionError);
  });

  it.each(["1234", "42 633 062 30", "abcdefghijk", ""])(
    "rejects %s as an ABN on shape",
    (abn) => {
      expect(() =>
        buildActivitySwms(input({ pcbu: { ...input().pcbu, abn } })),
      ).toThrow(SwmsCompositionError);
    },
  );

  it("accepts a real ABN with or without spaces", () => {
    for (const abn of ["42 633 062 307", "42633062307"]) {
      expect(() =>
        buildActivitySwms(input({ pcbu: { ...input().pcbu, abn } })),
      ).not.toThrow();
    }
  });

  it("rejects eleven digits that fail the ABN checksum", () => {
    // Eleven digits and correctly shaped, so the regex passes it. Only the
    // modulus-89 check catches a transposition like this.
    const transposed = "42 633 062 370";
    expect(transposed.replace(/\s/g, "")).toHaveLength(11);
    expect(() =>
      buildActivitySwms(input({ pcbu: { ...input().pcbu, abn: transposed } })),
    ).toThrow(/fails the ABN checksum/);
  });
});

describe("isValidAbn", () => {
  it("accepts known-good ABNs", () => {
    // Disaster Recovery QLD, from the source SWMS documents.
    expect(isValidAbn("42 633 062 307")).toBe(true);
    expect(isValidAbn("42633062307")).toBe(true);
  });

  it("rejects a single transposed pair", () => {
    expect(isValidAbn("42 633 062 370")).toBe(false);
  });

  it("rejects wrong-length and non-numeric input", () => {
    for (const bad of ["", "4263306230", "426330623070", "4263306230x"]) {
      expect(isValidAbn(bad), bad).toBe(false);
    }
  });

  it("rejects every single-digit corruption of a valid ABN", () => {
    // Exhaustive: the checksum's whole job is catching one wrong digit.
    const valid = "42633062307";
    let checked = 0;
    for (let i = 0; i < valid.length; i++) {
      for (let d = 0; d <= 9; d++) {
        if (String(d) === valid[i]) continue;
        const corrupted = valid.slice(0, i) + d + valid.slice(i + 1);
        expect(isValidAbn(corrupted), corrupted).toBe(false);
        checked++;
      }
    }
    // Positive control on the loop itself: 11 positions x 9 alternatives.
    expect(checked).toBe(99);
  });
});

describe("returned documents own their data", () => {
  it("mutating a returned row does not affect later compositions", () => {
    const first = buildActivitySwms(input());
    const before = first.rows[0].hazards.length;

    // A consumer doing something ordinary — filtering a row in place.
    first.rows[0].hazards.push("INJECTED");
    first.rows[0].controls[0].items.push("INJECTED");
    first.rows.push(first.rows[0]);
    first.ppe[0].item = "INJECTED";

    const second = buildActivitySwms(input());
    expect(second.rows[0].hazards).not.toContain("INJECTED");
    expect(second.rows[0].controls[0].items).not.toContain("INJECTED");
    expect(second.rows[0].hazards).toHaveLength(before);
    expect(second.ppe[0].item).not.toBe("INJECTED");
  });

  it("the shared template constants are left untouched", () => {
    // The rows live in common-rows.ts and are reused by every template, so a
    // leak here would corrupt all seven, not just this one.
    const tpl = SWMS_ACTIVITY_TEMPLATES["carpet-removal"];
    const swms = buildActivitySwms(input());
    expect(swms.rows).not.toBe(tpl.rows);
    expect(swms.rows[0]).not.toBe(tpl.rows[0]);
    expect(swms.rows[0].hazards).not.toBe(tpl.rows[0].hazards);
    expect(swms.rows[0].controls[0].items).not.toBe(
      tpl.rows[0].controls[0].items,
    );
    // Same content, different identity.
    expect(swms.rows[0].hazards).toEqual(tpl.rows[0].hazards);
  });
});

describe("HRCW categories", () => {
  it("separates categories to assess from categories that apply", () => {
    const demo = buildActivitySwms(
      input({ activityId: "demolition-non-structural" }),
    );
    expect(demo.hrcwCategoriesToAssess.length).toBeGreaterThan(0);
    // The template cannot know which apply — that is a site determination.
    expect(demo.hrcwCategoriesApplying).toEqual([]);
  });

  it("an activity with no checklist reports none to assess", () => {
    // Negative control for the assertion above: prove the field can be empty,
    // so "greater than 0" for demolition is distinguishing something.
    expect(buildActivitySwms(input()).hrcwCategoriesToAssess).toEqual([]);
  });

  it("refuses a SWMS with no project name or address", () => {
    for (const patch of [{ name: "" }, { address: "" }]) {
      expect(() =>
        buildActivitySwms(
          input({ project: { ...input().project, ...patch } }),
        ),
      ).toThrow(/Project name and address are required/);
    }
  });

  it("carries the consulted-persons register through unchanged", () => {
    const consulted = [{ name: "Jye Diesing", position: "Site Supervisor" }];
    expect(buildActivitySwms(input({ consulted })).consulted).toEqual(consulted);
    // Defaults to empty rather than undefined, so a renderer can map over it.
    expect(buildActivitySwms(input()).consulted).toEqual([]);
  });

  it("reports the highest residual risk on the document", () => {
    const swms = buildActivitySwms(input());
    const residual = highestResidualRisk(swms);
    expect(residual).toBeGreaterThanOrEqual(1);
    expect(residual).toBe(Math.max(...swms.rows.map((r) => r.riskAfter)));
  });
});
