/**
 * RA-8510: lib/anz/materials.ts used to carry its own per-material moisture
 * values, which disagreed with the guide table in lib/iicrc-dry-standards.ts.
 * The guide table is the one owner. Every ANZ material either names a guide row
 * and takes its dry value from it, or names none and carries no value (the
 * job's reference reading is then the only drying goal).
 */
import { describe, expect, it } from "vitest";
import { getDryStandard } from "@/lib/iicrc-dry-standards";
import { ANZ_MATERIALS } from "../materials";

describe("ANZ materials take guide values from the one owner (RA-8510)", () => {
  it.each(ANZ_MATERIALS.map((m) => [m.id, m] as const))(
    "%s matches the guide table",
    (_id, m) => {
      if (m.guideMaterial == null) {
        expect(m.dryStandardMc).toBeNull();
        return;
      }
      const row = getDryStandard(m.guideMaterial);
      // getDryStandard falls back to "other"; a mapping must name a real row.
      expect(row.material).toBe(m.guideMaterial);
      expect(m.dryStandardMc).toBe(row.dryThreshold);
    },
  );

  it("never maps a material to the catch-all row", () => {
    for (const m of ANZ_MATERIALS) {
      expect(m.guideMaterial).not.toBe("other");
    }
  });
});
