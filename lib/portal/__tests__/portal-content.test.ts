import { describe, it, expect } from "vitest";
import { parseSimpleMarkdown } from "@/lib/portal/portal-content";

describe("parseSimpleMarkdown", () => {
  it("parses ## headings and paragraphs", () => {
    const blocks = parseSimpleMarkdown(
      "## First\n\nHello world.\n\n## Second\n\nMore text.",
    );
    expect(blocks).toEqual([
      { type: "heading", level: 2, text: "First" },
      { type: "paragraph", text: "Hello world." },
      { type: "heading", level: 2, text: "Second" },
      { type: "paragraph", text: "More text." },
    ]);
  });
});
