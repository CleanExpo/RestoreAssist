import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { apiError, fromException } from "@/lib/api-errors";
import { resolveInspectionWrite } from "@/lib/auth/assert-tenancy";
import { prisma } from "@/lib/prisma";
import { sanitizeString } from "@/lib/sanitize";
import { deriveAreaColumns } from "@/lib/units";
import {
  MANUAL_OVERRIDE_JUSTIFICATION,
  MANUAL_OVERRIDE_REFERENCE,
} from "@/lib/nir-classification-engine";
import { persistInspectionClassification } from "@/lib/nir-classification-persist";

const environmentalSchema = z.object({
  ambientTemperature: z.number().finite().min(-20).max(55),
  humidityLevel: z.number().finite().min(0).max(100),
  dewPoint: z.number().finite().nullable().optional(),
  airCirculation: z.boolean(),
  weatherConditions: z.string().max(200).optional(),
});

const moistureSchema = z.object({
  location: z.string().trim().min(1).max(200),
  surfaceType: z.string().trim().min(1).max(100),
  moistureLevel: z.number().finite().min(0).max(100),
  depth: z.string().trim().min(1).max(50),
  mapX: z.number().finite().min(0).max(1).nullable().optional(),
  mapY: z.number().finite().min(0).max(1).nullable().optional(),
  sketchRoomId: z.string().trim().min(1).max(200).nullable().optional(),
});

/** Metres. Out-of-range / non-numeric values store nothing (do not fail the save). */
function coerceRoomHeightMetres(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value < 0 || value > 20) return null;
  return value;
}

const affectedAreaSchema = z.object({
  roomZoneId: z.string().trim().min(1).max(200),
  affectedAreaSqm: z.number().finite().min(0).max(9_290),
  waterSource: z.string().trim().min(1).max(100),
  timeSinceLoss: z.number().finite().min(0).nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
  height: z.preprocess(coerceRoomHeightMetres, z.number().nullable()),
});

const scopeItemSchema = z.object({
  itemType: z.string().trim().min(1).max(100),
  description: z.string().trim().min(1).max(2000),
  specification: z.string().max(2000).nullable().optional(),
});

const snapshotSchema = z.object({
  lossDescription: z.string().max(2000).optional(),
  technicianName: z.string().max(200).optional(),
  environmentalData: environmentalSchema,
  moistureReadings: z.array(moistureSchema).max(500),
  affectedAreas: z.array(affectedAreaSchema).max(100),
  scopeItems: z.array(scopeItemSchema).max(200),
  manualClassification: z
    .object({
      category: z.enum(["1", "2", "3"]),
      class: z.enum(["1", "2", "3", "4"]),
    })
    .nullable()
    .optional(),
});

const categoryMap = {
  "1": "CAT_1",
  "2": "CAT_2",
  "3": "CAT_3",
} as const;

const classMap = {
  "1": "CLASS_1",
  "2": "CLASS_2",
  "3": "CLASS_3",
  "4": "CLASS_4",
} as const;

/**
 * Replace the editable child data for a DRAFT inspection in one transaction.
 * Draft saves are snapshots, not time-series capture events: repeating the
 * same save must not append duplicate moisture, area, environmental, or scope
 * rows. Once submitted, the dedicated capture routes retain their append-only
 * monitoring semantics.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(request, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }

  const { id } = await params;
  const tenancy = await resolveInspectionWrite(session, id);
  if (!tenancy.ok) {
    return apiError(request, {
      code: tenancy.status === 401 ? "UNAUTHORIZED" : "NOT_FOUND",
      message: tenancy.reason,
      status: tenancy.status,
    });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(request, {
      code: "VALIDATION",
      message: "Invalid JSON body",
      status: 400,
    });
  }

  const parsed = snapshotSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(request, {
      code: "VALIDATION",
      message: "Invalid inspection draft data",
      status: 400,
    });
  }

  try {
    const inspection = await prisma.inspection.findUnique({
      where: tenancy.data.inspectionWhere,
      select: { id: true, status: true },
    });
    if (!inspection) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Inspection not found",
        status: 404,
      });
    }
    if (inspection.status !== "DRAFT") {
      return apiError(request, {
        code: "CONFLICT",
        message: "Only draft inspections can be synchronised",
        status: 409,
      });
    }

    const data = parsed.data;

    const requestedRoomIds = [
      ...new Set(
        data.moistureReadings
          .map((reading) => reading.sketchRoomId)
          .filter((roomId): roomId is string => Boolean(roomId)),
      ),
    ];
    // Existing links to a detached room on THIS job must still save: sketch
    // save detaches rather than deletes rooms that hold moisture readings.
    // New room picks go through POST /moisture, which still requires
    // detachedAt: null. Tenancy is sketch.inspectionId === this job.
    if (requestedRoomIds.length > 0) {
      const rooms = await prisma.sketchRoom.findMany({
        where: {
          id: { in: requestedRoomIds },
          sketch: { inspectionId: id },
        },
        select: { id: true },
        take: requestedRoomIds.length,
      });
      if (rooms.length !== requestedRoomIds.length) {
        return apiError(request, {
          code: "VALIDATION",
          message: "The selected room does not belong to this job.",
          status: 422,
        });
      }
    }

    const affectedAreas = data.affectedAreas.map((area) => {
      const columns = deriveAreaColumns({
        affectedAreaSqm: area.affectedAreaSqm,
      });
      if (!columns) throw new Error("Invalid affected area dimensions");
      return {
        inspectionId: id,
        roomZoneId: sanitizeString(area.roomZoneId, 200),
        affectedAreaSqm: columns.affectedAreaSqm,
        affectedSquareFootage: columns.affectedSquareFootage,
        waterSource: sanitizeString(area.waterSource, 100),
        timeSinceLoss: area.timeSinceLoss ?? null,
        description: area.description
          ? sanitizeString(area.description, 2000)
          : null,
        height: area.height ?? null,
      };
    });

    await prisma.$transaction(async (tx) => {
      await tx.inspection.update({
        where: tenancy.data.inspectionWhere,
        data: {
          lossDescription: data.lossDescription
            ? sanitizeString(data.lossDescription, 2000)
            : null,
          // Absent (an older client) leaves the stored name alone.
          ...(data.technicianName !== undefined && {
            technicianName: data.technicianName
              ? sanitizeString(data.technicianName, 200)
              : null,
          }),
        },
      });

      await tx.environmentalData.deleteMany({ where: { inspectionId: id } });
      await tx.moistureReading.deleteMany({ where: { inspectionId: id } });
      await tx.affectedArea.deleteMany({ where: { inspectionId: id } });
      await tx.scopeItem.deleteMany({ where: { inspectionId: id } });

      await tx.environmentalData.create({
        data: {
          inspectionId: id,
          ambientTemperature: data.environmentalData.ambientTemperature,
          humidityLevel: data.environmentalData.humidityLevel,
          dewPoint: data.environmentalData.dewPoint ?? null,
          airCirculation: data.environmentalData.airCirculation,
          weatherConditions: data.environmentalData.weatherConditions
            ? sanitizeString(data.environmentalData.weatherConditions, 200)
            : null,
        },
      });

      if (data.moistureReadings.length > 0) {
        await tx.moistureReading.createMany({
          data: data.moistureReadings.map((reading) => ({
            inspectionId: id,
            location: sanitizeString(reading.location, 200),
            surfaceType: sanitizeString(reading.surfaceType, 100),
            moistureLevel: reading.moistureLevel,
            depth: sanitizeString(reading.depth, 50),
            mapX: reading.mapX ?? null,
            mapY: reading.mapY ?? null,
            sketchRoomId: reading.sketchRoomId ?? null,
            source: "manual",
          })),
        });
      }

      if (affectedAreas.length > 0) {
        await tx.affectedArea.createMany({ data: affectedAreas });
      }

      if (data.scopeItems.length > 0) {
        await tx.scopeItem.createMany({
          data: data.scopeItems.map((item) => ({
            inspectionId: id,
            itemType: sanitizeString(item.itemType, 100),
            description: sanitizeString(item.description, 2000),
            specification: item.specification
              ? sanitizeString(item.specification, 2000)
              : null,
            autoDetermined: false,
            isRequired: true,
            isSelected: true,
          })),
        });
      }

      if (data.manualClassification) {
        const waterCategory = categoryMap[data.manualClassification.category];
        const damageClass = classMap[data.manualClassification.class];
        await tx.waterDamageClassification.upsert({
          where: { inspectionId: id },
          create: {
            inspectionId: id,
            waterCategory,
            damageClass,
            gateClassificationComplete: true,
          },
          update: {
            waterCategory,
            damageClass,
            gateClassificationComplete: true,
          },
        });
        // RA-7709: the technician's own choice, recorded as theirs so submit
        // honours it. One row per inspection, however often the draft saves.
        await persistInspectionClassification(tx, id, {
          category: data.manualClassification.category,
          class: data.manualClassification.class,
          justification: MANUAL_OVERRIDE_JUSTIFICATION,
          standardReference: MANUAL_OVERRIDE_REFERENCE,
          confidence: 100,
          inputData: JSON.stringify({ source: "draft_snapshot" }),
          isFinal: false,
          reviewedBy: session.user.id,
        });
      } else if (data.manualClassification === null) {
        // An explicit clear from the form: drop the technician choice so
        // submit classifies automatically. A body without the field leaves
        // it alone. Draft only — this route refuses non-DRAFT inspections.
        await tx.classification.deleteMany({
          where: { inspectionId: id, reviewedBy: { not: null } },
        });
      }

      await tx.auditLog.create({
        data: {
          inspectionId: id,
          action: "Draft inspection snapshot synchronised",
          entityType: "Inspection",
          entityId: id,
          userId: session.user.id,
          changes: JSON.stringify({
            moistureReadings: data.moistureReadings.length,
            affectedAreas: data.affectedAreas.length,
            scopeItems: data.scopeItems.length,
            manualClassification: data.manualClassification ?? null,
          }),
        },
      });
    });

    return NextResponse.json({
      saved: true,
      counts: {
        environmentalData: 1,
        moistureReadings: data.moistureReadings.length,
        affectedAreas: data.affectedAreas.length,
        scopeItems: data.scopeItems.length,
      },
    });
  } catch (error) {
    return fromException(request, error, {
      stage: "inspection-draft-snapshot",
    });
  }
}
