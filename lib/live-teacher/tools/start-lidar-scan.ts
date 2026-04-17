import { z } from "zod";

// Sketch model does NOT exist in the current schema.
// ClaimSketch and SketchAnnotation exist but are not linked to inspections in a way
// that supports LiDAR data. Native LiDAR plugin ships in RA-1133.
// Graceful degradation: return status "not_implemented" without throwing.

export const startLidarScanSchema = z.object({
  inspectionId: z.string(),
  roomName: z.string(),
});

export type StartLidarScanArgs = z.infer<typeof startLidarScanSchema>;

export async function startLidarScan(args: StartLidarScanArgs) {
  startLidarScanSchema.parse(args);

  return {
    status: "not_implemented" as const,
    hint: "Native LiDAR plugin ships in RA-1133",
  };
}

export const startLidarScanDefinition = {
  name: "start_lidar_scan",
  description:
    "Initiate a LiDAR room scan for the current inspection. Returns a graceful status until the native plugin ships in RA-1133.",
  input_schema: {
    type: "object" as const,
    properties: {
      inspectionId: { type: "string", description: "The inspection ID" },
      roomName: { type: "string", description: "Name of the room to scan" },
    },
    required: ["inspectionId", "roomName"],
  },
};
