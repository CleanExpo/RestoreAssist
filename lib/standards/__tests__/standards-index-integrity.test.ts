import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// The section indexes are the source the citation gate
// (scripts/check-standards-citations.ts) checks every other file against.
// An exemption token inside an index file means the gate stops reading the
// line that defines what is true, so the indexes may never carry one.
const INDEX_FILES = ["s500-sections.ts", "s520-sections.ts"];
const IGNORE_TOKEN = "standards-cite-ignore";

describe("standards section indexes", () => {
  it.each(INDEX_FILES)("%s carries no citation-gate exemption", (file) => {
    const source = readFileSync(resolve(__dirname, "..", file), "utf8");
    const exempted = source
      .split("\n")
      .map((line, i) => ({ line: i + 1, text: line }))
      .filter(({ text }) => text.includes(IGNORE_TOKEN));
    expect(exempted).toEqual([]);
  });
});
