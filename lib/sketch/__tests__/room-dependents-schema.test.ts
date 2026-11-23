/**
 * RA-8501 review (repeated finding): the list of things that hang off a
 * SketchRoom with onDelete: SetNull was written by hand, and twice a relation
 * was missing from it (contents items, then RA-7694's room observations), so a
 * sketch save deleted a room and silently blanked those rows' room link.
 *
 * This reads prisma/schema.prisma itself. Every model that points at SketchRoom
 * with onDelete: SetNull must have its SketchRoom list field in
 * ROOM_DEPENDENT_RELATIONS, and nothing else may be in it. Adding such a
 * relation to the schema without updating the list now fails here.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ROOM_DEPENDENT_RELATIONS } from "../sync-room-graph";

const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");

function modelBodies(source: string): Map<string, string> {
  const out = new Map<string, string>();
  const re = /^model (\w+) \{\n([\s\S]*?)^\}/gm;
  for (let m = re.exec(source); m; m = re.exec(source)) out.set(m[1], m[2]);
  return out;
}

/** Models holding a SetNull link to SketchRoom, mapped to nothing but a name. */
function setNullChildren(models: Map<string, string>): string[] {
  const names: string[] = [];
  for (const [name, body] of models) {
    if (name === "SketchRoom") continue;
    const links = body
      .split("\n")
      .filter((line) => /\sSketchRoom\??\s/.test(line) && line.includes("@relation("));
    if (links.some((line) => /onDelete:\s*SetNull/.test(line))) names.push(name);
  }
  return names;
}

/** SketchRoom's list fields, as [fieldName, childModel]. */
function roomListFields(models: Map<string, string>): [string, string][] {
  const body = models.get("SketchRoom") ?? "";
  const out: [string, string][] = [];
  for (const line of body.split("\n")) {
    const m = /^\s+(\w+)\s+(\w+)\[\]/.exec(line);
    if (m) out.push([m[1], m[2]]);
  }
  return out;
}

describe("ROOM_DEPENDENT_RELATIONS matches the Prisma schema", () => {
  const models = modelBodies(schema);
  const children = setNullChildren(models);
  const fields = roomListFields(models);

  it("finds the SetNull children (positive control: the parser sees them)", () => {
    expect(children).toEqual(
      expect.arrayContaining(["EvidencePin", "ScopeItem", "ContentsPackOutItem"]),
    );
    expect(fields.length).toBeGreaterThanOrEqual(7);
  });

  it("lists every SketchRoom field whose child model is SetNull", () => {
    const required = fields
      .filter(([, child]) => children.includes(child))
      .map(([field]) => field)
      .sort();
    expect([...ROOM_DEPENDENT_RELATIONS].sort()).toEqual(required);
  });
});
