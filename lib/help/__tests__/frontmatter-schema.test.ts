import { describe, it, expect } from "vitest";
import { parseHelpFrontmatter } from "../frontmatter-schema";

const valid = {
  title: "Your first inspection in 8 minutes",
  slug: "first-inspection",
  category: "getting-started",
  order: 1,
  audience: ["tradie", "admin"],
  readTimeMin: 5,
  updatedAt: "2026-05-15",
  status: "published",
  heroImage: "ra-help/getting-started/first-inspection-hero",
  relatedSlugs: ["claim-types"],
  aiSummary: "Walks a tradie from new inspection through close.",
  userIntents: ["how do I create an inspection"],
  successCriteria: ["Inspection in CLOSED status"],
};

describe("parseHelpFrontmatter", () => {
  it("parses a valid frontmatter object", () => {
    const result = parseHelpFrontmatter(valid);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.slug).toBe("first-inspection");
      expect(result.data.category).toBe("getting-started");
    }
  });

  it("rejects unknown category", () => {
    const result = parseHelpFrontmatter({
      ...valid,
      category: "not-a-real-category",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing aiSummary (required for SP-G)", () => {
    const { aiSummary: _omit, ...rest } = valid;
    const result = parseHelpFrontmatter(rest);
    expect(result.success).toBe(false);
  });

  it("rejects invalid status enum", () => {
    const result = parseHelpFrontmatter({ ...valid, status: "shipped" });
    expect(result.success).toBe(false);
  });

  it("defaults relatedSlugs to empty array when missing", () => {
    const { relatedSlugs: _omit, ...rest } = valid;
    const result = parseHelpFrontmatter(rest);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.relatedSlugs).toEqual([]);
  });
});
