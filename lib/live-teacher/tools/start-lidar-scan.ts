import { z } from "zod";
import {
  getRoomPlanCapability,
  type RoomPlanCapability,
} from "../../sketch/roomplan-capability";

export const startLidarScanSchema = z.object({
  inspectionId: z.string(),
  roomName: z.string(),
});

export type StartLidarScanArgs = z.infer<typeof startLidarScanSchema>;

export interface StartLidarScanDeps {
  /** Defaults to `getRoomPlanCapability`; injectable for deterministic tests. */
  resolveCapability?: () => Promise<RoomPlanCapability>;
}

export async function startLidarScan(
  args: StartLidarScanArgs,
  deps: StartLidarScanDeps = {},
) {
  startLidarScanSchema.parse(args);

  const resolveCapability = deps.resolveCapability ?? getRoomPlanCapability;
  const capability = await resolveCapability();

  if (capability.mode === "manual") {
    return {
      status: "manual_required" as const,
      captureAdapter: "manual" as const,
      reason: capability.reason,
      hint: "RestoreAssist could not confirm native LiDAR capture for this session. Continue documenting this room in the existing Floor Plan manual drawing / entered-measurement workflow.",
    };
  }

  return {
    status: "native_scanner_pending" as const,
    captureAdapter: "roomplan" as const,
    hint: "Native RoomPlan support was detected on this device, but the native capture lifecycle is not yet wired up — no scan has been started. Continue using the Floor Plan manual drawing / entered-measurement workflow for this room.",
  };
}

export const startLidarScanDefinition = {
  name: "start_lidar_scan",
  description:
    "Detect whether native LiDAR room scanning is supported on the current device, and fall back to the existing Floor Plan manual drawing / entered-measurement workflow when it is not. Does not perform any capture itself.",
  input_schema: {
    type: "object" as const,
    properties: {
      inspectionId: { type: "string", description: "The inspection ID" },
      roomName: { type: "string", description: "Name of the room to scan" },
    },
    required: ["inspectionId", "roomName"],
  },
};
