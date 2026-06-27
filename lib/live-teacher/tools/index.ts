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
import type { FlagWhsHazardContext } from "./flag-whs-hazard";
import {
  checkReportGaps,
  checkReportGapsDefinition,
  checkReportGapsSchema,
} from "./check-report-gaps";
import { assertInspectionTenancy } from "@/lib/auth/assert-tenancy";
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

// Owning-user context threaded from the authenticated turn route. Additive +
// optional so existing callers keep working unchanged; only flag_whs_hazard
// consumes it today (to attribute AI-flagged incidents to the real user
// instead of the "system" placeholder). Other handlers ignore the extra arg.
export interface ToolDispatchContext extends FlagWhsHazardContext {
  /** Authenticated user's role; enables the admin tenancy path. */
  role?: string;
}

type Handler<S extends AnySchema> = (
  args: z.infer<S>,
  context?: ToolDispatchContext,
) => Promise<unknown>;

export const TOOL_HANDLERS: Record<ToolName, Handler<AnySchema>> = {
  take_reading: (args) => takeReading(takeReadingSchema.parse(args)),
  capture_photo: (args) => capturePhoto(capturePhotoSchema.parse(args)),
  start_lidar_scan: (args) => startLidarScan(startLidarScanSchema.parse(args)),
  fill_scope_item: (args) => fillScopeItem(fillScopeItemSchema.parse(args)),
  flag_whs_hazard: (args, context) =>
    flagWhsHazard(flagWhsHazardSchema.parse(args), context),
  check_report_gaps: (args) =>
    checkReportGaps(checkReportGapsSchema.parse(args)),
};

/**
 * Central, FAIL-CLOSED entrypoint for executing a Live-Teacher tool.
 *
 * SECURITY — tool-layer IDOR guard (RA-1132f / Shipit H1):
 * Every tool takes a model-controlled `inspectionId`. Calling a handler
 * directly with that id would let a crafted prompt reference another tenant's
 * inspection (cross-tenant read/write). This dispatcher refuses to run unless
 *   (a) an authenticated owner context is present, AND
 *   (b) the target inspection is owned by — or in an active workspace of —
 *       that user (admins by id), verified via assertInspectionTenancy.
 * The model-supplied id is thus always re-scoped to the caller; a foreign or
 * non-existent id fails with 403/404 BEFORE the handler runs.
 *
 * When RA-1132f wires tool dispatch, it MUST call dispatchTool — never
 * TOOL_HANDLERS directly — or the IDOR re-opens.
 */
export async function dispatchTool(
  name: ToolName,
  args: unknown,
  context?: ToolDispatchContext,
): Promise<unknown> {
  if (!context?.userId) {
    throw new Error(
      `Refusing to dispatch Live-Teacher tool "${name}" without an authenticated user context (tool-layer IDOR guard)`,
    );
  }
  const inspectionId = (args as { inspectionId?: unknown } | null)?.inspectionId;
  if (typeof inspectionId !== "string" || inspectionId.length === 0) {
    throw new Error(`Live-Teacher tool "${name}" requires a string inspectionId`);
  }
  const tenancy = await assertInspectionTenancy(
    { user: { id: context.userId, role: context.role ?? null } },
    inspectionId,
  );
  if (!tenancy.ok) {
    throw new Error(
      `Live-Teacher tool "${name}" tenancy check failed (${tenancy.status}): ${tenancy.reason}`,
    );
  }
  return TOOL_HANDLERS[name](args, context);
}

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
