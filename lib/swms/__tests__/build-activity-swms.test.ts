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
  SwmsCompositionError,
  type BuildActivitySwmsInput,
} from "../build-activity-swms";
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
    "rejects %s as an ABN",
    (abn) => {
      expect(() =>
        buildActivitySwms(input({ pcbu: { ...input().pcbu, abn } })),
      ).toThrow(SwmsCompositionError);
    },
  );

  it("accepts an ABN with or without spaces", () => {
    for (const abn of ["42 633 062 307", "42633062307"]) {
      expect(() =>
        buildActivitySwms(input({ pcbu: { ...input().pcbu, abn } })),
      ).not.toThrow();
    }
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
