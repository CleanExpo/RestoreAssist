import { describe, expect, it } from "vitest";
import type {
  ChecklistItem,
  FieldEvidenceChecklist,
} from "../field-evidence-checklist";
import { buildBeforeYouLeaveActions } from "../before-you-leave";

function item(overrides: Partial<ChecklistItem>): ChecklistItem {
  return {
    evidenceClass: "MOISTURE_READING",
    displayName: "Moisture Reading",
    stepKey: "moisture_mapping",
    stepTitle: "Moisture mapping",
    riskTier: 1,
    requiredCount: 3,
    capturedCount: 0,
    status: "missing",
    averageQaScore: null,
    s500Ref: "S500 §12.2",
    ...overrides,
  };
}

function checklist(
  overrides: Partial<FieldEvidenceChecklist> = {},
): FieldEvidenceChecklist {
  return {
    inspectionId: "insp_1",
    claimType: "WATER_DAMAGE",
    generatedAt: "2026-11-05T00:00:00.000Z",
    categories: { required: [], recommended: [] },
    gapsByEvidenceClass: {},
    gapsByAffectedArea: [],
    unlinkedEvidence: [],
    ...overrides,
  };
}

describe("buildBeforeYouLeaveActions (RA-8002 slice 1)", () => {
  it("returns no actions when every item is present and every room has evidence", () => {
    const actions = buildBeforeYouLeaveActions(
      checklist({
        categories: {
          required: [item({ status: "present", capturedCount: 3 })],
          recommended: [],
        },
      }),
    );
    expect(actions).toEqual([]);
  });

  it("turns a missing required class into one action with reason, source, owner and a direct link", () => {
    const [action] = buildBeforeYouLeaveActions(
      checklist({ categories: { required: [item({})], recommended: [] } }),
    );
    expect(action).toEqual({
      key: "required:MOISTURE_READING",
      kind: "missing_required",
      priority: "required",
      roomZoneId: null,
      evidenceClass: "MOISTURE_READING",
      reason: "Moisture Reading not recorded yet: 0 of 3 captured.",
      source: {
        type: "workflow_step",
        stepKey: "moisture_mapping",
        stepTitle: "Moisture mapping",
        s500Ref: "S500 §12.2",
      },
      ownerRole: "technician",
      advisory: true,
      action: {
        label: "Capture Moisture Reading",
        href: "/dashboard/inspections/insp_1/capture?step=moisture_mapping",
      },
    });
  });

  it("says why a weak item is weak: too few captures versus low quality", () => {
    const actions = buildBeforeYouLeaveActions(
      checklist({
        categories: {
          required: [
            item({ status: "weak", capturedCount: 1, averageQaScore: 90 }),
            item({
              evidenceClass: "PHOTO_DAMAGE",
              displayName: "Damage Photo",
              stepKey: "damage_photos",
              stepTitle: "Damage photos",
              requiredCount: 2,
              status: "weak",
              capturedCount: 4,
              averageQaScore: 55,
            }),
          ],
          recommended: [],
        },
      }),
    );
    expect(actions.map((a) => [a.kind, a.reason, a.action.label])).toEqual([
      [
        "weak_required",
        "Moisture Reading is short: 1 of 3 captured.",
        "Capture more Moisture Reading",
      ],
      [
        "weak_required",
        "Damage Photo needs a better capture: average quality score 55 of 100.",
        "Retake Damage Photo",
      ],
    ]);
  });

  it("links a room with no evidence to capture and never claims the room is unaffected", () => {
    const [action] = buildBeforeYouLeaveActions(
      checklist({
        gapsByAffectedArea: [{ roomZoneId: "Kitchen", evidenceCount: 0 }],
      }),
    );
    expect(action).toMatchObject({
      key: "room:kitchen",
      kind: "room_without_evidence",
      priority: "room",
      roomZoneId: "Kitchen",
      evidenceClass: null,
      source: { type: "affected_area", roomZoneId: "Kitchen" },
      action: {
        label: "Capture evidence in Kitchen",
        href: "/dashboard/inspections/insp_1/capture",
      },
    });
    expect(action.reason).toBe(
      "Kitchen is listed as an affected area but has no photos or readings tagged to it yet.",
    );
    expect(action.reason.toLowerCase()).not.toContain("unaffected");
    expect(action.reason.toLowerCase()).not.toContain("no damage");
  });

  it("flags evidence tagged to a room that is not a declared affected area, without moving it", () => {
    const [action] = buildBeforeYouLeaveActions(
      checklist({ unlinkedEvidence: ["Laundry"] }),
    );
    expect(action).toMatchObject({
      key: "unlinked:laundry",
      kind: "unlinked_room_tag",
      priority: "room",
      roomZoneId: "Laundry",
      source: { type: "room_tag", tag: "Laundry" },
      action: {
        label: "Check room assignment",
        href: "/dashboard/inspections/insp_1?tab=areas",
      },
    });
  });

  it("orders required gaps first (lowest risk tier first), then rooms, then room tags, then recommended", () => {
    const actions = buildBeforeYouLeaveActions(
      checklist({
        categories: {
          required: [
            item({
              evidenceClass: "PHOTO_DAMAGE",
              displayName: "Damage Photo",
              riskTier: 2,
            }),
            item({
              evidenceClass: "MOISTURE_READING",
              riskTier: 1,
              status: "weak",
              capturedCount: 1,
            }),
            item({
              evidenceClass: "SCOPE_DOCUMENT",
              displayName: "Scope",
              riskTier: 1,
            }),
          ],
          recommended: [
            item({
              evidenceClass: "THERMAL_IMAGE",
              displayName: "Thermal Image",
              riskTier: 3,
            }),
          ],
        },
        gapsByAffectedArea: [{ roomZoneId: "Hall", evidenceCount: 0 }],
        unlinkedEvidence: ["Garage"],
      }),
    );
    expect(actions.map((a) => a.key)).toEqual([
      "required:SCOPE_DOCUMENT",
      "required:MOISTURE_READING",
      "required:PHOTO_DAMAGE",
      "room:hall",
      "unlinked:garage",
      "recommended:THERMAL_IMAGE",
    ]);
    expect(
      actions.find((a) => a.key === "recommended:THERMAL_IMAGE")?.kind,
    ).toBe("missing_recommended");
    expect(actions.every((a) => a.advisory === true)).toBe(true);
  });

  it("gives every action a unique key so a later accept/dismiss can bind to it", () => {
    const actions = buildBeforeYouLeaveActions(
      checklist({
        categories: {
          required: [item({})],
          recommended: [
            item({
              evidenceClass: "THERMAL_IMAGE",
              status: "weak",
              capturedCount: 1,
            }),
          ],
        },
        gapsByAffectedArea: [
          { roomZoneId: "Kitchen", evidenceCount: 0 },
          { roomZoneId: " kitchen ", evidenceCount: 0 },
        ],
        unlinkedEvidence: ["Kitchen", "kitchen"],
      }),
    );
    const keys = actions.map((a) => a.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.filter((k) => k === "room:kitchen")).toHaveLength(1);
  });

  it("is pure: same input, same output, input not mutated", () => {
    const input = checklist({
      categories: { required: [item({})], recommended: [] },
      gapsByAffectedArea: [{ roomZoneId: "Kitchen", evidenceCount: 0 }],
    });
    const snapshot = JSON.parse(JSON.stringify(input));
    expect(buildBeforeYouLeaveActions(input)).toEqual(
      buildBeforeYouLeaveActions(input),
    );
    expect(input).toEqual(snapshot);
  });
});
