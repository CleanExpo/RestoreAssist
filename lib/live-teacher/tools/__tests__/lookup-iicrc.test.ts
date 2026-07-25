import { describe, expect, it } from "vitest";

import { S500_FIELD_MAP, standardCite } from "@/lib/nir-standards-mapping";

import { lookupIicrc, lookupIicrcSchema } from "../lookup-iicrc";

// Copyright-safe by construction: matches carry section numbers, short titles
// and OUR paraphrased guidance — never verbatim standard prose (the section
// indexes are enforced by scripts/check-no-verbatim-standards.ts).
describe("lookup_iicrc", () => {
  it("resolves a direct section reference with edition-qualified citation", async () => {
    const { matches } = await lookupIicrc({
      inspectionId: "insp_1",
      query: "§10.4.1",
    });

    expect(matches[0]).toMatchObject({
      standard: "S500",
      section: "10.4.1",
      citation: standardCite("S500", "10.4.1"),
    });
    expect(matches[0].title).toBeTruthy();
  });

  it("finds sections by keyword across titles", async () => {
    const { matches } = await lookupIicrc({
      inspectionId: "insp_1",
      query: "personal protective equipment",
    });

    expect(matches.length).toBeGreaterThan(0);
    expect(matches.some((m) => m.section.startsWith("8.4"))).toBe(true);
    for (const m of matches) {
      expect(m.citation).toMatch(/^S\d{3}:\d{4} §/u);
    }
  });

  it("scopes to a single standard when requested", async () => {
    const { matches } = await lookupIicrc({
      inspectionId: "insp_1",
      query: "containment",
      standard: "S520",
    });

    for (const m of matches) {
      expect(m.standard).toBe("S520");
    }
  });

  it("returns empty matches (never throws) for gibberish", async () => {
    const { matches } = await lookupIicrc({
      inspectionId: "insp_1",
      query: "zzzz-nonexistent-topic",
    });

    expect(matches).toEqual([]);
  });

  it("caps results and requires inspectionId in the schema (dispatch guard contract)", async () => {
    const parsed = lookupIicrcSchema.safeParse({ query: "moisture" });
    expect(parsed.success).toBe(false);

    const { matches } = await lookupIicrc({
      inspectionId: "insp_1",
      query: "water", // broad — many title hits
    });
    expect(matches.length).toBeLessThanOrEqual(5);
  });

  it("field-map anchored lookup agrees with the canonical S500 map", async () => {
    const { matches } = await lookupIicrc({
      inspectionId: "insp_1",
      query: S500_FIELD_MAP.waterCategory.clauseRef.replace(/^S500:2021 §/u, ""),
    });
    expect(matches[0].citation).toBe(S500_FIELD_MAP.waterCategory.clauseRef);
  });
});
