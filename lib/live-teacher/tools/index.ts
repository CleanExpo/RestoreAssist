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
type Handler<S extends AnySchema> = (args: z.infer<S>) => Promise<unknown>;

export const TOOL_HANDLERS: Record<ToolName, Handler<AnySchema>> = {
  take_reading: (args) => takeReading(takeReadingSchema.parse(args)),
  capture_photo: (args) => capturePhoto(capturePhotoSchema.parse(args)),
  start_lidar_scan: (args) => startLidarScan(startLidarScanSchema.parse(args)),
  fill_scope_item: (args) => fillScopeItem(fillScopeItemSchema.parse(args)),
  flag_whs_hazard: (args) => flagWhsHazard(flagWhsHazardSchema.parse(args)),
  check_report_gaps: (args) =>
    checkReportGaps(checkReportGapsSchema.parse(args)),
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
