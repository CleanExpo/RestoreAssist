/**
 * RA-6731 follow-up — derive a real TeacherContext from inspection data so the
 * Live Teacher coaches against where the technician actually is in the job and
 * what a veteran would still capture (the deskilling North Star), instead of
 * generic defaults.
 *
 * Pure, mockable: the only I/O is a single prisma.inspection.findUnique. The
 * derivation (deriveTeacherContext) is exported separately and unit-tested with
 * no DB.
 */

import { prisma } from "@/lib/prisma";
import type { TeacherContext } from "@/lib/live-teacher/claude-cloud";
import { summariseWetReadings } from "@/lib/moisture/reading-dryness";

type Stage = TeacherContext["stage"];

export interface InspectionSnapshot {
  status: string;
  claimType: string | null;
  lossDescription: string | null;
  signedAt: Date | null;
  completedAt: Date | null;
  submittedAt: Date | null;
  affectedAreas: Array<{
    roomZoneId: string;
    category: string | null;
    class: string | null;
  }>;
  latestMoistureRoom: string | null;
  latestAffectedRoom: string | null;
  hasMoistureReadings: boolean;
  /** At least one reading flagged isBaseline — the dry-standard reference. */
  hasBaselineReading: boolean;
  /** Recent readings for wet-vs-dry assessment (surface + level + unit). */
  readings: Array<{
    location: string | null;
    surfaceType: string | null;
    moistureLevel: number;
    unit: string | null;
  }>;
  hasScopeItems: boolean;
  hasPhotos: boolean;
}

const SUBMITTED_STATUSES = new Set([
  "SUBMITTED",
  "PROCESSING",
  "CLASSIFIED",
  "SCOPED",
  "ESTIMATED",
  "IN_BILLING",
  "COMPLETED",
  "CLOSED",
  "ARCHIVED",
]);

/**
 * Pure stage/room/missing-fields derivation from an inspection snapshot.
 * Stage is the furthest-reached step of the S500 inspection flow; missingFields
 * are the gaps a veteran would close next, in priority order.
 */
export function deriveTeacherContext(
  inspectionId: string,
  userId: string,
  jurisdiction: "AU" | "NZ",
  snap: InspectionSnapshot | null,
): TeacherContext {
  if (!snap) {
    return {
      inspectionId,
      userId,
      jurisdiction,
      currentRoom: null,
      stage: "walkthrough",
      missingFields: [],
      wetReadings: [],
    };
  }

  const hasAreas = snap.affectedAreas.length > 0;
  const hasCategory = hasAreas && snap.affectedAreas.every((a) => !!a.category);
  const hasClass = hasAreas && snap.affectedAreas.every((a) => !!a.class);
  const classified = hasCategory && hasClass;
  const submitted =
    !!snap.signedAt ||
    !!snap.completedAt ||
    !!snap.submittedAt ||
    SUBMITTED_STATUSES.has(snap.status);

  let stage: Stage;
  if (submitted) stage = "submission";
  else if (snap.hasScopeItems) stage = "scope";
  else if (classified) stage = "classification";
  else if (snap.hasMoistureReadings) stage = "moisture";
  else if (hasAreas) stage = "walkthrough";
  else stage = "arrival";

  // What a veteran would ensure is captured, ordered by what's needed next.
  const missingFields: string[] = [];
  if (!hasAreas) missingFields.push("affected areas (rooms + water source)");
  if (hasAreas && snap.affectedAreas.some((a) => !a.category))
    missingFields.push("water category — Cat 1/2/3 (S500 §10.5)");
  if (hasAreas && snap.affectedAreas.some((a) => !a.class))
    missingFields.push("drying class — Class 1-4 (S500 §10.6)");
  if (!snap.hasMoistureReadings)
    missingFields.push("moisture readings (incl. a dry-standard reference)");
  // The dry-standard reference (a reading in an unaffected area) is what a
  // veteran always takes and a junior forgets — it's required to validate
  // drying progress against the material's dry standard.
  if (snap.hasMoistureReadings && !snap.hasBaselineReading)
    missingFields.push("dry-standard reference reading (unaffected area, S500 §12.2)");
  if (!snap.hasPhotos) missingFields.push("photo evidence");
  if (!snap.lossDescription)
    missingFields.push("loss description / cause of loss");
  if (classified && snap.hasMoistureReadings && !snap.hasScopeItems)
    missingFields.push("scope of works");

  // Materials still above their dry standard — the veteran wet/dry read.
  const wetReadings = summariseWetReadings(snap.readings).map((w) =>
    w.location ? `${w.location}: ${w.summary}` : w.summary,
  );

  return {
    inspectionId,
    userId,
    jurisdiction,
    currentRoom: snap.latestMoistureRoom ?? snap.latestAffectedRoom,
    stage,
    missingFields,
    wetReadings,
  };
}

/**
 * Load the minimal inspection snapshot and derive the TeacherContext.
 * Resilient: a missing inspection yields safe defaults rather than throwing,
 * so a context-build failure never breaks a Live Teacher turn.
 */
export async function buildTeacherContext(
  inspectionId: string,
  userId: string,
  jurisdiction: "AU" | "NZ",
): Promise<TeacherContext> {
  const [inspection, baselineCount] = await Promise.all([
    prisma.inspection.findUnique({
      where: { id: inspectionId },
      select: {
        status: true,
        claimType: true,
        lossDescription: true,
        signedAt: true,
        completedAt: true,
        submittedAt: true,
        affectedAreas: {
          select: { roomZoneId: true, category: true, class: true },
        },
        moistureReadings: {
          select: {
            location: true,
            surfaceType: true,
            moistureLevel: true,
            unit: true,
          },
          orderBy: { recordedAt: "desc" },
          take: 30,
        },
        scopeItems: { select: { id: true }, take: 1 },
        photos: { select: { id: true }, take: 1 },
      },
    }),
    // count() is unbounded-safe (returns a number) — presence of a baseline
    // (dry-standard reference) reading for this inspection.
    prisma.moistureReading.count({
      where: { inspectionId, isBaseline: true },
    }),
  ]);

  if (!inspection) {
    return deriveTeacherContext(inspectionId, userId, jurisdiction, null);
  }

  const snap: InspectionSnapshot = {
    status: inspection.status,
    claimType: inspection.claimType ?? null,
    lossDescription: inspection.lossDescription ?? null,
    signedAt: inspection.signedAt ?? null,
    completedAt: inspection.completedAt ?? null,
    submittedAt: inspection.submittedAt ?? null,
    affectedAreas: inspection.affectedAreas.map((a) => ({
      roomZoneId: a.roomZoneId,
      category: a.category ?? null,
      class: a.class ?? null,
    })),
    latestMoistureRoom: inspection.moistureReadings[0]?.location ?? null,
    latestAffectedRoom: inspection.affectedAreas[0]?.roomZoneId ?? null,
    hasMoistureReadings: inspection.moistureReadings.length > 0,
    hasBaselineReading: baselineCount > 0,
    readings: inspection.moistureReadings.map((r) => ({
      location: r.location ?? null,
      surfaceType: r.surfaceType ?? null,
      moistureLevel: r.moistureLevel,
      unit: r.unit ?? null,
    })),
    hasScopeItems: inspection.scopeItems.length > 0,
    hasPhotos: inspection.photos.length > 0,
  };

  return deriveTeacherContext(inspectionId, userId, jurisdiction, snap);
}
