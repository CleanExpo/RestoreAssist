/**
 * RA-7053 — citation-validity parser + classifier unit tests.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  parseClauseRef,
  buildCorpusIndex,
  classifyClauseRef,
  collectDistinctPairs,
  classifyRefs,
} from "../citation-validity";

// Real corpus — a true-valid assertion must reference a clause that exists.
const corpusJson = JSON.parse(
  readFileSync(
    resolve(__dirname, "../../../scripts/data/standards-corpus.json"),
    "utf8",
  ),
) as { standard: string; edition: string; clause: string }[];
const realS500 = corpusJson.find((c) => c.standard === "IICRC_S500");

describe("parseClauseRef", () => {
  it("parses the bracketed stored form into parts", () => {
    expect(parseClauseRef("[S500:2021 §10.3.2]")).toEqual({
      standard: "IICRC_S500",
      clause: "10.3.2",
      edition: "2021",
    });
  });

  it("parses a ref with no edition (no colon)", () => {
    expect(parseClauseRef("[AS/NZS 4360 §4.4]")).toEqual({
      standard: "AS_NZS_4360",
      clause: "4.4",
      edition: null,
    });
  });

  it("maps every recognised standard token", () => {
    expect(parseClauseRef("[AS/NZS 4849.1 §2.1]")?.standard).toBe(
      "AS_NZS_4849_1",
    );
    expect(parseClauseRef("[NZBS E2 §3.1]")?.standard).toBe("NZBS_E2");
    expect(parseClauseRef("[NZBS E3 §1.2]")?.standard).toBe("NZBS_E3");
  });

  it("returns null for an unrecognised token (unparseable)", () => {
    expect(parseClauseRef("[ISO 9001 §7.1]")).toBeNull();
  });

  it("returns null when the section marker is absent", () => {
    expect(parseClauseRef("[S500:2021 10.3.2]")).toBeNull();
  });
});

describe("classifyClauseRef", () => {
  const corpus = buildCorpusIndex([
    { standard: "IICRC_S500", edition: "2021", clause: "10.3.2" },
    { standard: "AS_NZS_4360", edition: "2004", clause: "4.4" },
  ]);

  it("valid — standard + clause present", () => {
    expect(classifyClauseRef("[S500:2021 §10.3.2]", corpus)).toBe("valid");
  });

  it("valid — clause present, ref carries no edition", () => {
    expect(classifyClauseRef("[AS/NZS 4360 §4.4]", corpus)).toBe("valid");
  });

  it("invalid_no_such_clause — parseable but absent (the gate error)", () => {
    expect(classifyClauseRef("[S500:2021 §99.99]", corpus)).toBe(
      "invalid_no_such_clause",
    );
  });

  it("edition_mismatch — clause present, edition absent (SOFT)", () => {
    expect(classifyClauseRef("[S500:2018 §10.3.2]", corpus)).toBe(
      "edition_mismatch",
    );
  });

  it("unparseable — matched shape but token unknown", () => {
    expect(classifyClauseRef("[ISO 9001 §7.1]", corpus)).toBe("unparseable");
  });

  it("classifies a real corpus clause as valid and a fabricated one as no_such_clause", () => {
    expect(realS500).toBeDefined();
    const corpusIndex = buildCorpusIndex(corpusJson);
    const validRef = `[S500:${realS500!.edition} §${realS500!.clause}]`;
    expect(classifyClauseRef(validRef, corpusIndex)).toBe("valid");
    expect(classifyClauseRef("[S500:2021 §99.99]", corpusIndex)).toBe(
      "invalid_no_such_clause",
    );
  });
});

describe("collectDistinctPairs", () => {
  it("dedupes (standard, clause) pairs and drops unparseable refs", () => {
    const pairs = collectDistinctPairs([
      "[S500:2021 §10.3.2]",
      "[S500:2018 §10.3.2]", // same standard+clause, different edition → one pair
      "[NZBS E2 §3.1]",
      "[ISO 9001 §7.1]", // unparseable → dropped
    ]);
    expect(pairs).toHaveLength(2);
    expect(pairs).toContainEqual({ standard: "IICRC_S500", clause: "10.3.2" });
    expect(pairs).toContainEqual({ standard: "NZBS_E2", clause: "3.1" });
  });
});

describe("classifyRefs", () => {
  it("returns a verdict per ref", () => {
    const corpus = buildCorpusIndex([
      { standard: "IICRC_S500", edition: "2021", clause: "10.3.2" },
    ]);
    expect(
      classifyRefs(["[S500:2021 §10.3.2]", "[S500:2021 §99.99]"], corpus),
    ).toEqual([
      { ref: "[S500:2021 §10.3.2]", verdict: "valid" },
      { ref: "[S500:2021 §99.99]", verdict: "invalid_no_such_clause" },
    ]);
  });
});
