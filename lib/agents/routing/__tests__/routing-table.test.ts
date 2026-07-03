import { describe, it, expect } from "vitest";
import { ROUTING_TABLE, routeToSkills } from "../routing-table";
import type { WorkTypeBucket } from "../types";

const ALL_BUCKETS: WorkTypeBucket[] = [
  "bug",
  "feature",
  "design",
  "copy",
  "security",
  "infra",
  "video",
  "marketing",
];

describe("ROUTING_TABLE", () => {
  it("has an entry for all 8 work-type buckets", () => {
    for (const bucket of ALL_BUCKETS) {
      expect(ROUTING_TABLE[bucket]).toBeDefined();
      expect(ROUTING_TABLE[bucket].length).toBeGreaterThan(0);
    }
  });

  it("every bucket has exactly one primary skill", () => {
    for (const bucket of ALL_BUCKETS) {
      const primaries = ROUTING_TABLE[bucket].filter((s) => s.role === "primary");
      expect(primaries).toHaveLength(1);
    }
  });

  it("routes design to design-audit as primary", () => {
    const skills = routeToSkills("design");
    expect(skills.find((s) => s.role === "primary")?.skill).toBe("design-audit");
    expect(skills.map((s) => s.skill)).toContain("design-intelligence");
  });

  it("routes copy to marketing-copywriter as primary", () => {
    const skills = routeToSkills("copy");
    expect(skills.find((s) => s.role === "primary")?.skill).toBe("marketing-copywriter");
    expect(skills.map((s) => s.skill)).toContain("eeat");
  });

  it("routes security to security-audit as primary", () => {
    const skills = routeToSkills("security");
    expect(skills.find((s) => s.role === "primary")?.skill).toBe("security-audit");
  });

  it("routes video to remotion-orchestrator as primary", () => {
    const skills = routeToSkills("video");
    expect(skills.find((s) => s.role === "primary")?.skill).toBe("remotion-orchestrator");
    expect(skills.map((s) => s.skill)).toContain("heygen-director");
  });

  it("routes infra to use-railway as primary", () => {
    const skills = routeToSkills("infra");
    expect(skills.find((s) => s.role === "primary")?.skill).toBe("use-railway");
    expect(skills.map((s) => s.skill)).toContain("deployment");
  });

  it("routes marketing to marketing-copywriter as primary with campaign supporting skills", () => {
    const skills = routeToSkills("marketing");
    expect(skills.find((s) => s.role === "primary")?.skill).toBe("marketing-copywriter");
    expect(skills.map((s) => s.skill)).toContain("marketing-seo-researcher");
  });

  it("routes bug to linear-task-processor as primary with service-layer-architecture supporting", () => {
    const skills = routeToSkills("bug");
    expect(skills.find((s) => s.role === "primary")?.skill).toBe("linear-task-processor");
    expect(skills.map((s) => s.skill)).toContain("service-layer-architecture");
  });

  it("routes feature to linear-task-processor as primary with spm supporting", () => {
    const skills = routeToSkills("feature");
    expect(skills.find((s) => s.role === "primary")?.skill).toBe("linear-task-processor");
    expect(skills.map((s) => s.skill)).toContain("spm");
  });

  it("returns a defensive copy, not the live table array", () => {
    const skills = routeToSkills("bug");
    skills.push({ skill: "should-not-persist", role: "supporting" });
    expect(routeToSkills("bug").map((s) => s.skill)).not.toContain("should-not-persist");
  });
});
