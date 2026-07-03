/**
 * Shared types for the continuous-loop work-type router and MOA dispatcher.
 *
 * These types are the contract between the classifier (Task 1), the
 * routing table (Task 2), the MOA trigger decision (Task 3), and the
 * dispatch builders (Tasks 4-6). Plan 1 (Core Loop Mechanics) constructs
 * `LinearIssueInput` from its Linear query result and passes it into
 * `dispatchWorkItem` (see dispatch.ts).
 */

export type WorkTypeBucket =
  | "bug"
  | "feature"
  | "design"
  | "copy"
  | "security"
  | "infra"
  | "video"
  | "marketing";

export interface LinearIssueInput {
  identifier: string;
  title: string;
  description: string;
  labels: string[];
  team: string;
  project?: string;
}

export interface ClassificationResult {
  bucket: WorkTypeBucket;
  /** Which label(s) or keyword(s) drove the classification, for audit/logging. */
  matchedSignals: string[];
  /** "label" when a Linear label directly matched a bucket; "text" when free-text keywords decided it. */
  confidence: "label" | "text";
}

export type ModelTier = "fable-5" | "opus-4.8" | "sonnet-5" | "haiku-4.5";

/**
 * Model-tier SELECTION function. The tier-selection RULE (spec §5) is owned
 * by a separate Pi-Dev-Ops PR to the `nexus` skill — this type is the
 * integration seam this plan consumes it through. See
 * lib/agents/routing/dispatch.ts's `defaultTierSelector` for the temporary
 * placeholder used until that PR lands.
 */
export type TierSelector = (context: {
  bucket: WorkTypeBucket;
  skill: string;
  fanOut: boolean;
}) => ModelTier;

export interface DispatchPlan {
  mode: "single-agent" | "moa";
  /** Primary skill (single-agent mode) or synthesiser skill label (MOA mode: always "boardroom"). */
  skill: string;
  /** Nexus-wrapped prompt ready to hand to the Agent tool or boardroom_query. */
  prompt: string;
  tier: ModelTier;
}
