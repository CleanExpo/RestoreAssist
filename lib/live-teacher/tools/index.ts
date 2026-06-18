import {
  takeReading,
  takeReadingDefinition,
  takeReadingSchema,
} from "./take-reading";
import {
  capturePhoto,
  capturePhotoDefinition,
  capturePhotoSchema,
} from "./capture-photo";
import {
  startLidarScan,
  startLidarScanDefinition,
  startLidarScanSchema,
} from "./start-lidar-scan";
import {
  fillScopeItem,
  fillScopeItemDefinition,
  fillScopeItemSchema,
} from "./fill-scope-item";
import {
  flagWhsHazard,
  flagWhsHazardDefinition,
  flagWhsHazardSchema,
  type FlagWhsHazardContext,
} from "./flag-whs-hazard";
import {
  checkReportGaps,
  checkReportGapsDefinition,
  checkReportGapsSchema,
} from "./check-report-gaps";
import { z } from "zod";

// ─── Anthropic tool-use definition array ─────────────────────────────────────

export const TOOL_DEFINITIONS = [
  takeReadingDefinition,
  capturePhotoDefinition,
  startLidarScanDefinition,
  fillScopeItemDefinition,
  flagWhsHazardDefinition,
  checkReportGapsDefinition,
] as const;

// ─── Tool name union (derived from definitions) ───────────────────────────────

export type ToolName = (typeof TOOL_DEFINITIONS)[number]["name"];

// ─── Handler map ─────────────────────────────────────────────────────────────

type AnySchema = z.ZodTypeAny;

// RA-6798: Owning-user context threaded from the authenticated turn route.
// Required on every handler — dispatch without auth context is not permitted.
// The turn route passes { userId: session.user.id } when wiring tool dispatch.
export interface ToolDispatchContext extends FlagWhsHazardContext {}

type Handler<S extends AnySchema> = (
  args: z.infer<S>,
  context: ToolDispatchContext,
) => Promise<unknown>;

export const TOOL_HANDLERS: Record<ToolName, Handler<AnySchema>> = {
  take_reading: (args, ctx) => takeReading(takeReadingSchema.parse(args), ctx),
  capture_photo: (args, ctx) =>
    capturePhoto(capturePhotoSchema.parse(args), ctx),
  start_lidar_scan: (args, ctx) =>
    startLidarScan(startLidarScanSchema.parse(args), ctx),
  fill_scope_item: (args, ctx) =>
    fillScopeItem(fillScopeItemSchema.parse(args), ctx),
  flag_whs_hazard: (args, ctx) =>
    flagWhsHazard(flagWhsHazardSchema.parse(args), ctx),
  check_report_gaps: (args, ctx) =>
    checkReportGaps(checkReportGapsSchema.parse(args), ctx),
};

// Re-export individual tools for direct import
export {
  takeReading,
  takeReadingDefinition,
  takeReadingSchema,
  capturePhoto,
  capturePhotoDefinition,
  capturePhotoSchema,
  startLidarScan,
  startLidarScanDefinition,
  startLidarScanSchema,
  fillScopeItem,
  fillScopeItemDefinition,
  fillScopeItemSchema,
  flagWhsHazard,
  flagWhsHazardDefinition,
  flagWhsHazardSchema,
  checkReportGaps,
  checkReportGapsDefinition,
  checkReportGapsSchema,
};
export type { TakeReadingArgs } from "./take-reading";
export type { CapturePhotoArgs } from "./capture-photo";
export type { StartLidarScanArgs } from "./start-lidar-scan";
export type { FillScopeItemArgs } from "./fill-scope-item";
export type { FlagWhsHazardArgs } from "./flag-whs-hazard";
export type { CheckReportGapsArgs, ReportGap } from "./check-report-gaps";
