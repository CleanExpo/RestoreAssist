import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { apiError, fromException } from "@/lib/api-errors";
import { resolveInspectionWrite } from "@/lib/auth/assert-tenancy";
import { prisma } from "@/lib/prisma";
import { sanitizeString } from "@/lib/sanitize";
import { parseInspectionDate } from "@/lib/parse-date";
import { deriveAreaColumns } from "@/lib/units";
import {
  MANUAL_OVERRIDE_JUSTIFICATION,
  MANUAL_OVERRIDE_REFERENCE,
} from "@/lib/nir-classification-engine";
import { persistInspectionClassification } from "@/lib/nir-classification-persist";

const rowIdSchema = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/);

const environmentalSchema = z.object({
  id: rowIdSchema.optional(),
  ambientTemperature: z.number().finite().min(-20).max(55),
  humidityLevel: z.number().finite().min(0).max(100),
  dewPoint: z.number().finite().nullable().optional(),
  airCirculation: z.boolean(),
  weatherConditions: z.string().max(200).optional(),
});

const moistureSchema = z.object({
  id: rowIdSchema.optional(),
  location: z.string().trim().min(1).max(200),
  surfaceType: z.string().trim().min(1).max(100),
  moistureLevel: z.number().finite().min(0).max(100),
  depth: z.string().trim().min(1).max(50),
  mapX: z.number().finite().min(0).max(1).nullable().optional(),
  mapY: z.number().finite().min(0).max(1).nullable().optional(),
  sketchRoomId: z.string().trim().min(1).max(200).nullable().optional(),
  isBaseline: z.boolean().optional(),
  isMonitoringPoint: z.boolean().optional(),
});

/** Metres. Out-of-range / non-numeric values store nothing (do not fail the save). */
function coerceRoomHeightMetres(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value < 0 || value > 20) return null;
  return value;
}

const affectedAreaSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/).optional(),
  roomZoneId: z.string().trim().min(1).max(200),
  affectedAreaSqm: z.number().finite().min(0).max(9_290),
  waterSource: z.string().trim().min(1).max(100),
  timeSinceLoss: z.number().finite().min(0).nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
  height: z.preprocess(
    (value) => value === undefined ? undefined : coerceRoomHeightMetres(value),
    z.number().nullable().optional(),
  ),
});

const scopeItemSchema = z.object({
  itemType: z.string().trim().min(1).max(100),
  description: z.string().trim().min(1).max(2000),
  specification: z.string().max(2000).nullable().optional(),
});

const snapshotSchema = z.object({
  lossDescription: z.string().max(2000).optional(),
  inspectionDate: z.string().nullable().optional(),
  technicianName: z.string().max(200).optional(),
  environmentalData: environmentalSchema.nullable(),
  moistureReadings: z.array(moistureSchema).max(500),
  // The readings this form loaded or has since saved (B23). A save deletes
  // only these, so evidence captured on another screen is never erased.
  baseIds: z
    .object({
      moistureReadings: z.array(rowIdSchema).max(1000),
      environmentalData: z.array(rowIdSchema).max(1000).optional(),
    })
    .optional(),
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

const clientAreaUuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

class AreaIdCollisionError extends Error {}
class ReadingIdCollisionError extends Error {}
class ReadingChangedError extends Error {}
class InspectionNotDraftError extends Error {}

/** A client UUID that collides with a stored row is refused, never merged. */
async function createOrCollide<T>(create: () => Promise<T>): Promise<T> {
  try {
    return await create();
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      throw new ReadingIdCollisionError();
    }
    throw error;
  }
}

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
    const inspectionDate = parseInspectionDate(data.inspectionDate);
    if (data.inspectionDate && !inspectionDate) {
      return apiError(request, {
        code: "VALIDATION",
        message: "Invalid inspectionDate",
        status: 400,
      });
    }

    // B23: a save that does not say which readings it loaded cannot tell a
    // removed reading from one captured on another screen since. Refuse it
    // rather than guess, and change nothing.
    if (!data.baseIds) {
      return apiError(request, {
        code: "CONFLICT",
        message: "This form is out of date. Reload the job, then save again.",
        status: 409,
      });
    }
    const readingIds = data.moistureReadings.flatMap((reading) =>
      reading.id ? [reading.id] : [],
    );
    if (new Set(readingIds).size !== readingIds.length) {
      return apiError(request, {
        code: "VALIDATION",
        message: "Duplicate moisture reading ID",
        status: 400,
      });
    }
    const environmentalId = data.environmentalData?.id;
    const [existingReadings, existingEnvironmental] = await Promise.all([
      readingIds.length > 0
        ? prisma.moistureReading.findMany({
          where: { id: { in: readingIds }, inspectionId: id },
          select: { id: true },
          take: readingIds.length,
        })
        : [],
      environmentalId
        ? prisma.environmentalData.findMany({
          where: { id: environmentalId, inspectionId: id },
          select: { id: true },
          take: 1,
        })
        : [],
    ]);
    const retainedReadingIds = new Set(existingReadings.map((row) => row.id));
    const environmentalRetained = existingEnvironmental.length === 1;
    // An ID this job does not hold must be a fresh client UUID: never let a
    // save claim, probe or overwrite a row by guessing its stored ID.
    if (
      readingIds.some((readingId) =>
        !retainedReadingIds.has(readingId) && !clientAreaUuidV4.test(readingId)
      ) ||
      (environmentalId && !environmentalRetained && !clientAreaUuidV4.test(environmentalId))
    ) {
      return apiError(request, {
        code: "VALIDATION",
        message: "Invalid reading ID",
        status: 422,
      });
    }

    // A new NIR row carries a UUID; a resumed row carries its stored cuid.
    // Look up only this inspection's rows, never probing whether an ID exists
    // on another tenant. Older clients omit IDs and keep server-generated IDs.
    const areaIds = data.affectedAreas.flatMap((area) =>
      area.id ? [area.id] : [],
    );
    if (new Set(areaIds).size !== areaIds.length) {
      return apiError(request, {
        code: "VALIDATION",
        message: "Duplicate affected area ID",
        status: 400,
      });
    }
    const existingAreas = areaIds.length > 0
      ? await prisma.affectedArea.findMany({
        where: { id: { in: areaIds }, inspectionId: id },
        select: { id: true },
        take: areaIds.length,
      })
      : [];
    const retainedAreaIds = new Set(existingAreas.map((area) => area.id));
    if (areaIds.some((areaId) =>
      !retainedAreaIds.has(areaId) && !clientAreaUuidV4.test(areaId)
    )) {
        return apiError(request, {
          code: "VALIDATION",
          message: "Invalid affected area ID",
          status: 422,
        });
    }

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
        ...(area.id && { id: area.id }),
        inspectionId: id,
        roomZoneId: sanitizeString(area.roomZoneId, 200),
        affectedAreaSqm: columns.affectedAreaSqm,
        affectedSquareFootage: columns.affectedSquareFootage,
        waterSource: sanitizeString(area.waterSource, 100),
        timeSinceLoss: area.timeSinceLoss ?? null,
        ...(area.description !== undefined && {
          description: area.description
            ? sanitizeString(area.description, 2000)
            : null,
        }),
        ...(area.height !== undefined && { height: area.height }),
      };
    });

    await prisma.$transaction(async (tx) => {
      // Re-check DRAFT inside the transaction, as submit's CAS does. The read
      // above can be stale: a submit that commits between it and here must
      // stop this save before any child row below is deleted.
      const parent = await tx.inspection.updateMany({
        where: { ...tenancy.data.inspectionManyWhere, status: "DRAFT" },
        data: {
          ...(data.inspectionDate !== undefined && { inspectionDate }),
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
      if (parent.count !== 1) throw new InspectionNotDraftError();

      // B23: delete only rows this form loaded or saved and no longer holds.
      // A reading captured elsewhere after the form loaded is not in baseIds,
      // so it survives with its pin, room, photo links and history.
      const baseIds = data.baseIds!;
      await tx.environmentalData.deleteMany({
        where: {
          inspectionId: id,
          id: {
            in: baseIds.environmentalData ?? [],
            ...(environmentalId && { notIn: [environmentalId] }),
          },
        },
      });
      await tx.moistureReading.deleteMany({
        where: {
          inspectionId: id,
          id: { in: baseIds.moistureReadings, notIn: readingIds },
        },
      });
      // Reconcile by stable ID. Updating in place retains roomId, photos,
      // classification and other metadata that this NIR form never edits.
      // Omitted IDs still use the old snapshot replacement behaviour.
      await tx.affectedArea.deleteMany({
        where: {
          inspectionId: id,
          ...(areaIds.length > 0 && { id: { notIn: areaIds } }),
        },
      });
      await tx.scopeItem.deleteMany({ where: { inspectionId: id } });

      if (data.environmentalData) {
        const { id: _environmentalId, ...environmental } = data.environmentalData;
        const environmentalValues = {
          ambientTemperature: environmental.ambientTemperature,
          humidityLevel: environmental.humidityLevel,
          dewPoint: environmental.dewPoint ?? null,
          airCirculation: environmental.airCirculation,
          weatherConditions: environmental.weatherConditions
            ? sanitizeString(environmental.weatherConditions, 200)
            : null,
        };
        if (environmentalRetained) {
          const updated = await tx.environmentalData.updateMany({
            where: { id: environmentalId, inspectionId: id },
            data: environmentalValues,
          });
          if (updated.count !== 1) throw new ReadingChangedError();
        } else {
          await createOrCollide(() =>
            tx.environmentalData.create({
              data: {
                ...(environmentalId && { id: environmentalId }),
                inspectionId: id,
                ...environmentalValues,
              },
            }),
          );
        }
      }

      // A kept reading is updated in place: only the fields this save sends
      // change, so its pin, room, flags, device, notes and recorded time stay.
      for (const reading of data.moistureReadings) {
        if (!reading.id || !retainedReadingIds.has(reading.id)) continue;
        const updated = await tx.moistureReading.updateMany({
          where: { id: reading.id, inspectionId: id },
          data: {
            location: sanitizeString(reading.location, 200),
            surfaceType: sanitizeString(reading.surfaceType, 100),
            moistureLevel: reading.moistureLevel,
            depth: sanitizeString(reading.depth, 50),
            ...(reading.mapX !== undefined && { mapX: reading.mapX }),
            ...(reading.mapY !== undefined && { mapY: reading.mapY }),
            ...(reading.sketchRoomId !== undefined && {
              sketchRoomId: reading.sketchRoomId,
            }),
            ...(reading.isBaseline !== undefined && {
              isBaseline: reading.isBaseline,
            }),
            ...(reading.isMonitoringPoint !== undefined && {
              isMonitoringPoint: reading.isMonitoringPoint,
            }),
          },
        });
        if (updated.count !== 1) throw new ReadingChangedError();
      }

      const newReadings = data.moistureReadings.filter(
        (reading) => !reading.id || !retainedReadingIds.has(reading.id),
      );
      if (newReadings.length > 0) {
        await createOrCollide(() =>
          tx.moistureReading.createMany({
            data: newReadings.map((reading) => ({
              ...(reading.id && { id: reading.id }),
              inspectionId: id,
              location: sanitizeString(reading.location, 200),
              surfaceType: sanitizeString(reading.surfaceType, 100),
              moistureLevel: reading.moistureLevel,
              depth: sanitizeString(reading.depth, 50),
              mapX: reading.mapX ?? null,
              mapY: reading.mapY ?? null,
              sketchRoomId: reading.sketchRoomId ?? null,
              isBaseline: reading.isBaseline ?? false,
              isMonitoringPoint: reading.isMonitoringPoint ?? false,
              source: "manual",
            })),
          }),
        );
      }

      if (affectedAreas.length > 0) {
        for (const area of affectedAreas) {
          if (!area.id || !retainedAreaIds.has(area.id)) continue;
          const { id: areaId, inspectionId: _inspectionId, ...changes } = area;
          const updated = await tx.affectedArea.updateMany({
            where: { id: areaId, inspectionId: id },
            data: changes,
          });
          if (updated.count !== 1) {
            throw new Error("Affected area changed during draft save");
          }
        }
        const newAreas = affectedAreas.filter(
          (area) => !area.id || !retainedAreaIds.has(area.id),
        );
        if (newAreas.length > 0) {
          try {
            await tx.affectedArea.createMany({ data: newAreas });
          } catch (error) {
            if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
              throw new AreaIdCollisionError();
            }
            throw error;
          }
        }
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
        environmentalData: data.environmentalData ? 1 : 0,
        moistureReadings: data.moistureReadings.length,
        affectedAreas: data.affectedAreas.length,
        scopeItems: data.scopeItems.length,
      },
    });
  } catch (error) {
    if (error instanceof ReadingIdCollisionError) {
      return apiError(request, {
        code: "VALIDATION",
        message: "Invalid reading ID",
        status: 422,
      });
    }
    if (error instanceof ReadingChangedError) {
      return apiError(request, {
        code: "CONFLICT",
        message: "A reading changed while saving. Reload the job, then save again.",
        status: 409,
      });
    }
    if (error instanceof InspectionNotDraftError) {
      return apiError(request, {
        code: "CONFLICT",
        message: "Only draft inspections can be synchronised",
        status: 409,
      });
    }
    if (error instanceof AreaIdCollisionError) {
      return apiError(request, {
        code: "VALIDATION",
        message: "Invalid affected area ID",
        status: 422,
      });
    }
    return fromException(request, error, {
      stage: "inspection-draft-snapshot",
    });
  }
}
