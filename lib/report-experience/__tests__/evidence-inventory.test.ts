import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  INSPECTION_FIELDS,
  INSPECTION_LINKS,
  REPORT_FIELDS,
  REPORT_LINKS,
  inventoryOmissions,
  inventorySelect,
} from "../evidence-inventory";

/**
 * RA-8104: the inventory must name every stored field and linked record on
 * Report and Inspection, so a new column or relation cannot hold evidence the
 * preview drops without saying so.
 */

type MinimalField = { name: string; kind: string; type: string };
type MinimalModel = { name: string; fields: MinimalField[] };

function model(name: string): MinimalModel {
  const found = (Prisma.dmmf.datamodel.models as unknown as MinimalModel[]).find((m) => m.name === name);
  if (!found) throw new Error(name + " is not in the generated client");
  return found;
}

// The generated field list does not say whether a link holds one record or
// many, so that is read from the schema text.
function linkSizes(name: string): Record<string, "one" | "many"> {
  const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf-8");
  const block = schema.match(new RegExp("^model " + name + " \\{([\\s\\S]*?)^\\}", "m"));
  if (!block) throw new Error("model " + name + " not found in prisma/schema.prisma");
  const sizes: Record<string, "one" | "many"> = {};
  for (const field of model(name).fields.filter((f) => f.kind === "object")) {
    const line = block[1].match(new RegExp("^\\s+" + field.name + "\\s+" + field.type + "(\\[\\])?", "m"));
    if (!line) throw new Error(name + "." + field.name + " not found in the schema text");
    sizes[field.name] = line[1] ? "many" : "one";
  }
  return sizes;
}

const CASES = [
  { name: "Report", fields: REPORT_FIELDS, links: REPORT_LINKS },
  { name: "Inspection", fields: INSPECTION_FIELDS, links: INSPECTION_LINKS },
];

describe("evidence inventory", () => {
  for (const c of CASES) {
    it(c.name + ": names every stored field, and only stored fields", () => {
      const stored = model(c.name).fields.filter((f) => f.kind !== "object").map((f) => f.name).sort();
      expect(stored.length).toBeGreaterThan(40);
      expect(Object.keys(c.fields).sort()).toEqual(stored);
    });

    it(c.name + ": names every link with its real size, and only real links", () => {
      const sizes = linkSizes(c.name);
      expect(Object.keys(sizes).length).toBeGreaterThan(15);
      const listed = Object.fromEntries(Object.entries(c.links).map(([k, v]) => [k, v[1]]));
      expect(listed).toEqual(sizes);
    });

    it(c.name + ": every single linked record it reads has an id", () => {
      for (const [name, [use, size]] of Object.entries(c.links)) {
        if (size !== "one" || use === "shown" || use === "context") continue;
        const target = model(c.name).fields.find((f) => f.name === name)!.type;
        expect(model(target).fields.map((f) => f.name), target).toContain("id");
      }
    });
  }

  it("selects evidence only, counting many-record links", () => {
    const select = inventorySelect(REPORT_FIELDS, REPORT_LINKS);
    expect(select.safetyHazards).toBe(true);
    expect(select.scope).toEqual({ select: { id: true } });
    expect(select._count).toEqual(expect.objectContaining({ select: expect.objectContaining({ invoices: true }) }));
    expect(select.clientName).toBeUndefined();
    expect(select.reportNumber).toBeUndefined();
    expect((select._count as { select: Record<string, true> }).select.shareAccess).toBeUndefined();
  });

  it("lists filled evidence by name only, and skips blank, empty and context values", () => {
    const omitted = inventoryOmissions(
      "Report",
      {
        safetyHazards: "SECRET-HAZARD-TEXT",
        electricalHazards: "   ",
        biologicalMouldDetected: true,
        hvacAffected: false,
        totalCost: 0,
        methamphetamineScreen: null,
        clientName: "SECRET-CLIENT",
        scope: { id: "scope_rec_1" },
        _count: { invoices: 2, restorationDocuments: 0, shareAccess: 5 },
      },
      REPORT_FIELDS,
      REPORT_LINKS,
    );
    expect(omitted).toEqual([
      { kind: "financials", reason: "Report field totalCost holds evidence this preview does not show yet" },
      { kind: "hazard", reason: "Report field safetyHazards holds evidence this preview does not show yet" },
      { kind: "hazard", reason: "Report field biologicalMouldDetected holds evidence this preview does not show yet" },
      { kind: "scope-item", id: "scope_rec_1", reason: "The linked Report.scope record: not shown in this preview yet" },
      { kind: "financials", reason: "2 linked Report.invoices record(s): not shown in this preview yet" },
    ]);
    expect(JSON.stringify(omitted)).not.toContain("SECRET");
  });

  it("says sketches are shown only in part", () => {
    const omitted = inventoryOmissions("Inspection", { _count: { claimSketches: 1 } }, INSPECTION_FIELDS, INSPECTION_LINKS);
    expect(omitted).toEqual([
      { kind: "finding", reason: "1 linked Inspection.claimSketches record(s): only their hazards are shown" },
    ]);
  });
});
