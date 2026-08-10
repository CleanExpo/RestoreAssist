/**
 * Scan → waiting → plan-ready phase for floor-plan UX.
 * LiDAR / underlay fill the "scan" role (RestoreAssist has no Encircle video SLA).
 */

export type PlanLifecyclePhase =
  | "empty"
  | "scanning"
  | "waiting"
  | "needs_confirm"
  | "plan_ready";

export interface PlanLifecycleInput {
  /** User dismissed start chooser or already has content. */
  startDismissed: boolean;
  /** Native scan / RoomPlan capture in flight. */
  scanning: boolean;
  /** Non-empty Fabric geometry (rooms / walls / etc.). */
  hasPlanGeometry: boolean;
  /** Underlay uploaded but no rooms yet. */
  hasUnderlayOnly: boolean;
  /** Any room still needs operator confirm (RoomPlan provenance). */
  hasUnconfirmedRooms: boolean;
  /** Explicit user ack that plan is ready for annotate. */
  planReadyAck?: boolean;
}

/**
 * Derive the UX phase for start overlay / lifecycle banner.
 * Does not invent carrier sync — confirm is operator_measured style only.
 */
export function derivePlanLifecyclePhase(
  input: PlanLifecycleInput,
): PlanLifecyclePhase {
  if (input.scanning) return "scanning";

  if (!input.hasPlanGeometry && !input.hasUnderlayOnly) {
    return input.startDismissed ? "waiting" : "empty";
  }

  if (input.hasUnderlayOnly && !input.hasPlanGeometry) {
    return "waiting";
  }

  if (input.hasUnconfirmedRooms && !input.planReadyAck) {
    return "needs_confirm";
  }

  return "plan_ready";
}

/** Prefer Quick edit when a plan just arrived for confirm / annotate. */
export function shouldDefaultToQuickEdit(phase: PlanLifecyclePhase): boolean {
  return phase === "needs_confirm" || phase === "plan_ready";
}
