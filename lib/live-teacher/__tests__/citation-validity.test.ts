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

  it("strips an optional leading IICRC prefix (parses same as un-prefixed)", () => {
    expect(parseClauseRef("[IICRC S500:2021 §10.5]")).toEqual(
      parseClauseRef("[S500:2021 §10.5]"),
    );
    expect(parseClauseRef("[IICRC S500:2021 §10.5]")).toEqual({
      standard: "IICRC_S500",
      clause: "10.5",
      edition: "2021",
    });
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

  it("IICRC-prefixed ref yields the same verdict as the un-prefixed form", () => {
    expect(classifyClauseRef("[IICRC S500:2021 §10.3.2]", corpus)).toBe(
      classifyClauseRef("[S500:2021 §10.3.2]", corpus),
    );
    expect(classifyClauseRef("[IICRC S500:2021 §10.3.2]", corpus)).toBe("valid");
  });

  it("invalid_no_such_clause — standard IS in corpus, clause genuinely absent (the gate error)", () => {
    expect(classifyClauseRef("[S500:2021 §99.99]", corpus)).toBe( // standards-cite-ignore (intentional negative-test fixture)
      "invalid_no_such_clause",
    );
  });

  it("S500 validates from the in-repo section map even when the corpus is EMPTY", () => {
    // The whole point of RA-7058: S500 no longer depends on StandardsChunk (empty
    // on production) — §10.3.2 → chapter 10 exists in S500_SECTIONS → valid.
    const emptyCorpus = buildCorpusIndex([]);
    expect(classifyClauseRef("[S500:2021 §10.3.2]", emptyCorpus)).toBe("valid");
    // Chapter-only citation resolves to the same chapter.
    expect(classifyClauseRef("[S500:2021 §7]", emptyCorpus)).toBe("valid");
  });

  it("invalid_no_such_clause — S500 chapter absent from the section map (empty corpus, still a fabrication)", () => {
    const emptyCorpus = buildCorpusIndex([]);
    expect(classifyClauseRef("[S500:2021 §99.99]", emptyCorpus)).toBe( // standards-cite-ignore (intentional negative-test fixture)
      "invalid_no_such_clause",
    );
  });

  it("unknown — a NON-S500 standard has no in-repo section map and no corpus rows (collecting, NOT fabricated)", () => {
    const emptyCorpus = buildCorpusIndex([]);
    expect(classifyClauseRef("[AS/NZS 4360 §4.4]", emptyCorpus)).toBe("unknown");
  });

  it("unknown — corpus carries no clauses for a NON-S500 ref's standard (collecting, NOT the gate error)", () => {
    // `corpus` has AS_NZS_4360 + S500 only; an NZBS ref cannot be validated → unknown.
    expect(classifyClauseRef("[NZBS E2 §3.1]", corpus)).toBe("unknown");
  });

  it("edition_mismatch — S500 real chapter cited under a non-2021 edition (SOFT, from the section map)", () => {
    // §10 exists in the 2021 map; a 2018 edition token is a soft mismatch, not a fabrication.
    const emptyCorpus = buildCorpusIndex([]);
    expect(classifyClauseRef("[S500:2018 §10.3.2]", emptyCorpus)).toBe( // standards-cite-ignore (intentional negative-test fixture)
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
    expect(classifyClauseRef("[S500:2021 §99.99]", corpusIndex)).toBe( // standards-cite-ignore (intentional negative-test fixture)
      "invalid_no_such_clause",
    );
  });
});

describe("collectDistinctPairs", () => {
  it("dedupes (standard, clause) pairs and drops unparseable refs", () => {
    const pairs = collectDistinctPairs([
      "[S500:2021 §10.3.2]",
      "[S500:2018 §10.3.2]", // same standard+clause, different edition → one pair // standards-cite-ignore (intentional negative-test fixture)
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
      classifyRefs(["[S500:2021 §10.3.2]", "[S500:2021 §99.99]"], corpus), // standards-cite-ignore (intentional negative-test fixture)
    ).toEqual([
      { ref: "[S500:2021 §10.3.2]", verdict: "valid" },
      { ref: "[S500:2021 §99.99]", verdict: "invalid_no_such_clause" }, // standards-cite-ignore (intentional negative-test fixture)
    ]);
  });
});
