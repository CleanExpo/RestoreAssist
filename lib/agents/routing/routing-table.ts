/**
 * Skill-routing table for the continuous MOA loop (spec §4).
 *
 * Mirrors the shape/style of .claude/rules/review-dimensions.md's Dimension
 * Activation Matrix, but maps Linear-issue work-type buckets (pre-hoc, from
 * issue content) rather than changed file paths (post-hoc). One row per
 * work-type bucket; each row lists the skills that would be dispatched for
 * an issue of that type, in priority order.
 *
 * | Bucket    | Primary skill            | Supporting skill(s)                                          |
 * | --------- | ------------------------ | ------------------------------------------------------------- |
 * | bug       | linear-task-processor    | service-layer-architecture, ci-parity-verification            |
 * | feature   | linear-task-processor    | spm, service-layer-architecture                                |
 * | design    | design-audit             | design-intelligence, ui-component-builder, ui-ux-pro-max       |
 * | copy      | marketing-copywriter     | eeat, brand-ambassador                                         |
 * | security  | security-audit           | security, architectural-integrity-protocol                     |
 * | infra     | use-railway              | deployment, supabase                                           |
 * | video     | remotion-orchestrator    | heygen-director                                                |
 * | marketing | marketing-copywriter     | marketing-seo-researcher, geo-optimization, eeat               |
 *
 * Skill names above are Claude Code skill identifiers as registered under
 * ~/.claude/skills/ (Pi-Dev-Ops-owned, symlinked) or RestoreAssist's own
 * .claude/skills/ (service-layer-architecture, ci-parity-verification,
 * architectural-integrity-protocol) — confirmed present at plan-writing time.
 *
 * NOTE: `linear-task-processor` is registered as a Claude Code *agent* type
 * (see the Agent tool's agent list), not a `.claude/skills/` skill. It is
 * kept here as the primary dispatch target for `bug` and `feature` because
 * downstream tasks (MOA trigger/dispatch) route on this table's `skill`
 * field to select a dispatch target, and `linear-task-processor` is the
 * correct target for those buckets. This is documentation of dispatch
 * intent, not a runtime guarantee that every listed name resolves through
 * the same registry.
 */

import type { WorkTypeBucket } from "./types";

export interface RoutedSkill {
  skill: string;
  role: "primary" | "supporting";
}

export const ROUTING_TABLE: Record<WorkTypeBucket, RoutedSkill[]> = {
  bug: [
    { skill: "linear-task-processor", role: "primary" },
    { skill: "service-layer-architecture", role: "supporting" },
    { skill: "ci-parity-verification", role: "supporting" },
  ],
  feature: [
    { skill: "linear-task-processor", role: "primary" },
    { skill: "spm", role: "supporting" },
    { skill: "service-layer-architecture", role: "supporting" },
  ],
  design: [
    { skill: "design-audit", role: "primary" },
    { skill: "design-intelligence", role: "supporting" },
    { skill: "ui-component-builder", role: "supporting" },
    { skill: "ui-ux-pro-max", role: "supporting" },
  ],
  copy: [
    { skill: "marketing-copywriter", role: "primary" },
    { skill: "eeat", role: "supporting" },
    { skill: "brand-ambassador", role: "supporting" },
  ],
  security: [
    { skill: "security-audit", role: "primary" },
    { skill: "security", role: "supporting" },
    { skill: "architectural-integrity-protocol", role: "supporting" },
  ],
  infra: [
    { skill: "use-railway", role: "primary" },
    { skill: "deployment", role: "supporting" },
    { skill: "supabase", role: "supporting" },
  ],
  video: [
    { skill: "remotion-orchestrator", role: "primary" },
    { skill: "heygen-director", role: "supporting" },
  ],
  marketing: [
    { skill: "marketing-copywriter", role: "primary" },
    { skill: "marketing-seo-researcher", role: "supporting" },
    { skill: "geo-optimization", role: "supporting" },
    { skill: "eeat", role: "supporting" },
  ],
};

/**
 * Returns the routed skill list for a bucket. Always returns a fresh copy
 * so callers can freely push/sort without mutating the shared table.
 */
export function routeToSkills(bucket: WorkTypeBucket): RoutedSkill[] {
  return ROUTING_TABLE[bucket].map((entry) => ({ ...entry }));
}
