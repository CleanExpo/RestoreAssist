import { describe, it, expect } from "vitest";
import { getTutorialsForDbType, type DbType } from "../db-tutorials";

describe("getTutorialsForDbType", () => {
  const known: DbType[] = ["supabase", "neon", "aws-rds", "self-hosted"];

  it("returns a non-empty curated set for each known DB type", () => {
    for (const t of known) {
      const set = getTutorialsForDbType(t);
      expect(set.length).toBeGreaterThan(0);
    }
  });

  it("every entry has a title, an https url, a kind and a source", () => {
    for (const link of getTutorialsForDbType("supabase")) {
      expect(link.title).toBeTruthy();
      expect(link.url).toMatch(/^https:\/\//);
      expect(["doc", "video"]).toContain(link.kind);
      expect(link.source).toBeTruthy();
    }
  });

  it("falls back to the generic set for an unknown / empty type", () => {
    expect(getTutorialsForDbType("cockroach").length).toBeGreaterThan(0);
    expect(getTutorialsForDbType("").length).toBeGreaterThan(0);
  });

  it("normalises case and whitespace", () => {
    expect(getTutorialsForDbType("  Supabase ")).toEqual(
      getTutorialsForDbType("supabase"),
    );
  });
});
