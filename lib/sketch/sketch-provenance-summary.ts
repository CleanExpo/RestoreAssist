/**
 * Summarise floor-plan provenance for PDF / portal legends.
 *
 * Measured rooms (operator_measured) may bill; underlay_reference never does.
 * RoomPlan captureAdapter distinguishes LiDAR from hand-drawn measured rooms.
 */

export interface SketchProvenanceSummary {
  /** Confirmed / measured rooms from RoomPlan. */
  lidarMeasured: number;
  /** Measured rooms without RoomPlan (hand-drawn / other adapters). */
  handDrawnMeasured: number;
  /** RoomPlan still pending technician confirmation — not billed. */
  lidarPending: number;
  /** Other underlay_reference rooms (imported plans, etc.). */
  referenceOther: number;
}

type FabricObj = {
  type?: string;
  data?: {
    type?: string;
    provenance?: string;
    captureAdapter?: string;
  };
};

export function summarizeSketchProvenance(
  fabricJson: Record<string, unknown> | null | undefined,
): SketchProvenanceSummary {
  const summary: SketchProvenanceSummary = {
    lidarMeasured: 0,
    handDrawnMeasured: 0,
    lidarPending: 0,
    referenceOther: 0,
  };
  if (!fabricJson) return summary;

  const objects = (fabricJson.objects as FabricObj[] | undefined) ?? [];
  for (const obj of objects) {
    if (obj.type?.toLowerCase() !== "polygon") continue;
    // Match extractRooms: room polygons. Explicit non-room tags are skipped.
    if (obj.data?.type && obj.data.type !== "room") continue;

    const provenance = obj.data?.provenance ?? "operator_measured";
    const isLidar = obj.data?.captureAdapter === "roomplan";

    if (provenance === "underlay_reference") {
      if (isLidar) summary.lidarPending += 1;
      else summary.referenceOther += 1;
      continue;
    }

    if (isLidar) summary.lidarMeasured += 1;
    else summary.handDrawnMeasured += 1;
  }

  return summary;
}

/** Compact WinAnsi-safe legend line for PDF footer / portal exports. */
export function formatProvenanceLegend(
  summary: SketchProvenanceSummary,
): string | null {
  const parts: string[] = [];
  if (summary.lidarMeasured > 0) {
    parts.push(
      `${summary.lidarMeasured} LiDAR confirmed`,
    );
  }
  if (summary.handDrawnMeasured > 0) {
    parts.push(
      `${summary.handDrawnMeasured} hand-drawn`,
    );
  }
  if (summary.lidarPending > 0) {
    parts.push(
      `${summary.lidarPending} LiDAR pending confirmation (not billed)`,
    );
  }
  if (summary.referenceOther > 0) {
    parts.push(
      `${summary.referenceOther} reference only (not billed)`,
    );
  }
  if (parts.length === 0) return null;
  return `Provenance: ${parts.join(" · ")}`;
}

export function hasAnyProvenanceSignal(
  summary: SketchProvenanceSummary,
): boolean {
  return (
    summary.lidarMeasured +
      summary.handDrawnMeasured +
      summary.lidarPending +
      summary.referenceOther >
    0
  );
}
