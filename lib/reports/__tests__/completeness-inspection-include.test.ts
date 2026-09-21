import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { COMPLETENESS_INSPECTION_INCLUDE } from "../completeness-inspection-include";

type MinimalField = { name: string; kind: string };
type MinimalModel = { name: string; fields: MinimalField[] };

function inspectionModel(): MinimalModel {
  const found = (
    Prisma.dmmf.datamodel.models as unknown as MinimalModel[]
  ).find((model) => model.name === "Inspection");
  if (!found) throw new Error("Inspection is not in the generated client");
  return found;
}

/**
 * RA-7571 — Prisma `include` accepts relations only. The completeness-check
 * route used to name `contentsManifestDraft` (an Inspection scalar) inside
 * include{}, which throws on every call.
 *
 * This check is the schema-level gate: it fails on the include shape that
 * shipped on main, and passes once that scalar is gone. The DMMF / enum
 * assertions run first so a missing generated client cannot produce a
 * silent green.
 */
describe("COMPLETENESS_INSPECTION_INCLUDE (RA-7571)", () => {
  it("treats contentsManifestDraft as an Inspection scalar, not a relation", () => {
    const field = inspectionModel().fields.find(
      (item) => item.name === "contentsManifestDraft",
    );
    expect(field, "contentsManifestDraft missing from Inspection DMMF").toMatchObject(
      { name: "contentsManifestDraft", kind: "scalar" },
    );
    expect(Prisma.InspectionScalarFieldEnum.contentsManifestDraft).toBe(
      "contentsManifestDraft",
    );
  });

  it("does not put Inspection scalars in include{}", () => {
    const includeKeys = Object.keys(COMPLETENESS_INSPECTION_INCLUDE);
    const scalarFields = new Set<string>(
      Object.values(Prisma.InspectionScalarFieldEnum),
    );
    const scalarsInInclude = includeKeys.filter((key) => scalarFields.has(key));

    expect(scalarsInInclude).toEqual([]);
    expect(includeKeys).not.toContain("contentsManifestDraft");
  });

  it("is assignable to Prisma.InspectionInclude", () => {
    const typed: Prisma.InspectionInclude = COMPLETENESS_INSPECTION_INCLUDE;
    expect(typed.moistureReadings).toEqual({ select: { id: true } });
  });
});
