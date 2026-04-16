/**
 * Live Teacher — shared types.
 *
 * Pure TypeScript definitions used by the router, context engine, and
 * (in follow-up tickets) the Prisma-backed persistence + cloud/edge callers.
 *
 * Keep this file free of runtime imports so it can be consumed by both the
 * Next.js server and the Capacitor mobile bundle without extra tree-shaking.
 */

export type Jurisdiction = "AU" | "NZ";

export type DeviceOs = "ios" | "android" | "web";

export type TeacherStage =
  | "arrival"
  | "walkthrough"
  | "moisture"
  | "classification"
  | "scope"
  | "submission";

export type WaterCategory = 1 | 2 | 3;
export type WaterClass = 1 | 2 | 3 | 4;

export type TeacherContext = {
  inspectionId: string;
  userId: string;
  jurisdiction: Jurisdiction;
  currentRoom: string | null;
  stage: TeacherStage;
  waterCategory: WaterCategory | null;
  waterClass: WaterClass | null;
  /** Dotted field paths the user still needs to fill, e.g. "moisture.bathroom". */
  missingFields: string[];
  capturedPhotoCount: number;
  lastMoistureReadingAt: Date | null;
  hasLidarScan: boolean;
};

export type ToolName =
  | "take_reading"
  | "capture_photo"
  | "start_lidar_scan"
  | "fill_scope_item"
  | "flag_whs_hazard"
  | "check_report_gaps";

export type TeacherTurn = {
  role: "user" | "assistant" | "system";
  content: string;
  /** IICRC clause references cited in the reply, e.g. ["S500:2025 §7.1"]. */
  clauseRefs?: string[];
  /** Model self-reported confidence, 0-1. */
  confidence?: number;
};

export type RoutingTarget = "gemma_local" | "claude_cloud";

export type RoutingDecision = {
  target: RoutingTarget;
  reason: string;
  /** true when the turn must never leave the device (offline, PII, etc). */
  bypassCloud: boolean;
};
