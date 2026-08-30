import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertInspectionTenancy } from "@/lib/auth/assert-tenancy";
import { apiError, fromException } from "@/lib/api-errors";
import { decomposeElements } from "@/lib/sketch/decompose-elements";
import { pinsToMoistureReadingInputs } from "@/lib/sketch/moisture-readings-sync";
import {
  extractRoomGraphNodes,
  partitionStaleRooms,
} from "@/lib/sketch/sync-room-graph";
import { signStoredMediaUrl } from "@/lib/storage/sign-stored-url";
import {
  enforceUnverifiedUnderlayProvenance,
  evaluateUnderlayVerification,
} from "@/lib/sketch/underlay-verification";
import { stableStringify } from "@/lib/sketch/roomplan-custody-queue";

// GET /api/inspections/[id]/sketches — list all sketches for an inspection
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    const { id } = await params;

    // RA-1711 batch 4 — adopt shared tenancy helper.
    const tenancy = await assertInspectionTenancy(session, id);
    if (!tenancy.ok) {
      return apiError(request, {
        code: tenancy.status === 404 ? "NOT_FOUND" : "FORBIDDEN",
        message: tenancy.reason ?? "Forbidden",
        status: tenancy.status,
      });
    }

    const sketches = await (prisma as any).claimSketch.findMany({
      where: { inspectionId: id },
      include: {
        annotations: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            sketchId: true,
            type: true,
            data: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
      orderBy: [{ floorNumber: "asc" }, { createdAt: "asc" }],
      take: 50,
    });

    const signedSketches = await Promise.all(
      sketches.map(async (sketch: Record<string, unknown>) => ({
        ...sketch,
        backgroundImageUrl:
          typeof sketch.backgroundImageUrl === "string"
            ? await signStoredMediaUrl(sketch.backgroundImageUrl)
            : sketch.backgroundImageUrl,
        renderedPngUrl:
          typeof sketch.renderedPngUrl === "string"
            ? await signStoredMediaUrl(sketch.renderedPngUrl)
            : sketch.renderedPngUrl,
      })),
    );
    return NextResponse.json({ sketches: signedSketches });
  } catch (error) {
    return fromException(request, error, { stage: "sketches:list" });
  }
}

// POST /api/inspections/[id]/sketches — create or upsert a sketch
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    const { id } = await params;

    // RA-1711 batch 4 — adopt shared tenancy helper.
    const tenancy = await assertInspectionTenancy(session, id);
    if (!tenancy.ok) {
      return apiError(request, {
        code: tenancy.status === 404 ? "NOT_FOUND" : "FORBIDDEN",
        message: tenancy.reason ?? "Forbidden",
        status: tenancy.status,
      });
    }

    const body = await request.json();
    const {
      floorNumber = 0,
      floorLabel = "Ground Floor",
      sketchType = "structural",
      sketchData,
      renderedPngUrl,
      backgroundImageOpacity,
      backgroundImageScale,
      backgroundImageOffsetX,
      backgroundImageOffsetY,
      moisturePoints,
      equipmentPoints,
      country,
      captureAdapter: captureAdapterRaw,
      confirmUnderlayVerification,
      requestCanonicalRender,
    } = body;

    // RA-120 (PR4): underlay opacity is a 0..1 slider value; clamp defensively
    // so a malformed client can't store an out-of-range opacity.
    const opacity =
      typeof backgroundImageOpacity === "number"
        ? Math.max(0, Math.min(1, backgroundImageOpacity))
        : undefined;

    // RA-120 (PR4b): underlay transform. Clamp scale to a sane range and drop
    // non-finite offsets so a malformed client can't store NaN/Infinity that
    // would blank the canvas. `undefined` leaves the column NULL (legacy fit).
    const clampNumber = (v: unknown, min: number, max: number) =>
      typeof v === "number" && Number.isFinite(v)
        ? Math.max(min, Math.min(max, v))
        : undefined;
    const bgScale = clampNumber(backgroundImageScale, 0.1, 10);
    const bgOffsetX = clampNumber(backgroundImageOffsetX, -100000, 100000);
    const bgOffsetY = clampNumber(backgroundImageOffsetY, -100000, 100000);

    // Canonical report images are generated from allowlisted geometry below.
    // Client PNG locators are retired because a source image can be relabelled
    // as a render even when its object path is tenant-scoped.
    let renderLocator: string | null | undefined;
    if (renderedPngUrl != null) {
      return apiError(request, {
        code: "FEATURE_UNAVAILABLE",
        message:
          "Client floor-plan renders are retired; request a canonical server render with the sketch save.",
        status: 409,
      });
    }

    // If a sketch already exists for this floor, update it; otherwise create
    const existing = await (prisma as any).claimSketch.findFirst({
      where: { inspectionId: id, floorNumber },
    });

    // Reject stale queue entries before storage, verification or database
    // state can change.
    const clientUpdatedAtRaw = request.headers.get("x-client-updated-at");
    if (existing && clientUpdatedAtRaw) {
      const clientMs = Number.isFinite(Number(clientUpdatedAtRaw))
        ? Number(clientUpdatedAtRaw)
        : Date.parse(clientUpdatedAtRaw);
      const serverMs = new Date(existing.updatedAt).getTime();
      if (Number.isFinite(clientMs) && clientMs < serverMs) {
        return NextResponse.json(
          {
            stale: true,
            reason: "Server has a newer sketch for this floor",
            serverUpdatedAt: existing.updatedAt,
          },
          { status: 409 },
        );
      }
    }

    const activeUnderlay = await (
      prisma as any
    ).sketchUnderlayReference.findFirst({
      where: {
        inspectionId: id,
        floorNumber,
        replacedAt: null,
        removedAt: null,
      },
      select: { id: true },
      orderBy: { createdAt: "desc" },
    });
    const underlayVerification = activeUnderlay
      ? confirmUnderlayVerification === true
        ? evaluateUnderlayVerification(sketchData)
        : {
            ok: false as const,
            reason: "Technician confirmation is required for this reference.",
          }
      : null;
    const securedSketchData =
      activeUnderlay &&
      !underlayVerification?.ok &&
      sketchData &&
      typeof sketchData === "object"
        ? enforceUnverifiedUnderlayProvenance(
            sketchData as Record<string, unknown>,
          )
        : sketchData;

    // Every canonical claim image is rendered from allowlisted geometry on the
    // server. Underlay pixels are never an input. An active underlay must also
    // pass explicit technician verification before a canonical render exists.
    let cleanRenderReceipt:
      | { storagePath: string; renderSha256: string }
      | undefined;
    if (activeUnderlay) {
      renderLocator = null;
    }
    if (
      requestCanonicalRender === true &&
      (!activeUnderlay || underlayVerification?.ok)
    ) {
      const { storeVerifiedCleanRender } = await import(
        "@/lib/sketch/server-clean-render"
      );
      const clean = await storeVerifiedCleanRender(
        id,
        floorNumber,
        securedSketchData,
      );
      renderLocator = clean.storageLocator;
      cleanRenderReceipt = clean;
    }

    const { resolveSketchCaptureAdapter } =
      await import("@/lib/sketch/ingest-roomplan");
    const captureAdapter = resolveSketchCaptureAdapter({
      sketchData: securedSketchData,
      explicit: captureAdapterRaw,
      previous: existing?.captureAdapter ?? null,
    });

    // Guard: never let an empty Fabric blob (common after dispose-on-unmount)
    // wipe a previously saved drawing. Explicit clears should send objects:[].
    const incomingObjects = Array.isArray(securedSketchData?.objects)
      ? securedSketchData.objects.length
      : -1;
    const existingObjects = Array.isArray(existing?.sketchData?.objects)
      ? existing.sketchData.objects.length
      : 0;
    const skipEmptyOverwrite =
      !!existing &&
      incomingObjects === 0 &&
      existingObjects > 0 &&
      !securedSketchData?.backgroundImage &&
      !securedSketchData?.background;

    const sketchDataToPersist = skipEmptyOverwrite
      ? undefined
      : (securedSketchData ?? undefined);

    // Verification belongs to the complete save + normalized room graph, not
    // merely to a floor number. Revoke any previous verification before the
    // new blob is written; only the successful graph-sync path below may grant
    // it again. A graph failure therefore fails closed for report export.
    if (activeUnderlay) {
      await (prisma as any).sketchUnderlayReference.update({
        where: { id: activeUnderlay.id },
        data: {
          verifiedByUserId: null,
          verifiedAt: null,
          verificationMethod: null,
          verificationJson: null,
        },
      });
    }

    const sketch = existing
      ? await (prisma as any).claimSketch.update({
          where: { id: existing.id },
          data: {
            sketchType,
            sketchData: sketchDataToPersist,
            renderedPngUrl: renderLocator,
            backgroundImageOpacity: opacity,
            backgroundImageScale: bgScale,
            backgroundImageOffsetX: bgOffsetX,
            backgroundImageOffsetY: bgOffsetY,
            moisturePoints: moisturePoints ?? undefined,
            equipmentPoints: equipmentPoints ?? undefined,
            country: country ?? undefined,
            captureAdapter,
          },
        })
      : await (prisma as any).claimSketch.create({
          data: {
            inspectionId: id,
            floorNumber,
            floorLabel,
            sketchType,
            sketchData: securedSketchData ?? undefined,
            renderedPngUrl: renderLocator,
            backgroundImageOpacity: opacity,
            backgroundImageScale: bgScale,
            backgroundImageOffsetX: bgOffsetX,
            backgroundImageOffsetY: bgOffsetY,
            moisturePoints: moisturePoints ?? undefined,
            equipmentPoints: equipmentPoints ?? undefined,
            country: country ?? undefined,
            captureAdapter,
          },
        });

    // RA Mapping V2 (spec §6.4): derive normalized SketchElement rows from the
    // authoritative Fabric blob. Non-fatal — the blob save is the source of truth,
    // so a decomposition failure must never reject the sketch save.
    try {
      const decomposed =
        securedSketchData && typeof securedSketchData === "object"
          ? decomposeElements(securedSketchData as Record<string, unknown>)
          : [];
      const slugs = [
        ...new Set(
          decomposed
            .map((d) => d.materialSlug)
            .filter((s): s is string => Boolean(s)),
        ),
      ];
      const materials = slugs.length
        ? // ra-query-ok: materials filtered to slugs derived from one sketch
          await (prisma as any).material.findMany({
            where: { slug: { in: slugs } },
            select: { id: true, slug: true },
          })
        : [];
      const idBySlug = new Map(
        materials.map((m: { id: string; slug: string }) => [m.slug, m.id]),
      );
      // RA-6762: delete + recreate the normalized rows atomically so a failure
      // can't leave them half-written (these were two un-transactioned calls).
      const elementOps: unknown[] = [
        (prisma as any).sketchElement.deleteMany({
          where: { sketchId: sketch.id },
        }),
      ];
      if (decomposed.length) {
        elementOps.push(
          (prisma as any).sketchElement.createMany({
            data: decomposed.map((d) => ({
              sketchId: sketch.id,
              type: d.type,
              geometryJson: d.geometryJson as unknown,
              dimensionsM: d.dimensionsM as unknown,
              materialId: d.materialSlug
                ? (idBySlug.get(d.materialSlug) ?? null)
                : null,
              provenance: d.provenance,
            })),
          }),
        );
      }
      await (prisma as any).$transaction(elementOps);

      // RoomGraph V1 — upsert rooms BEFORE moisture pin sync so pins can bind
      // to SketchRoom ids (EvidencePin / moisture / hazards join target).
      const roomNodes = extractRoomGraphNodes(
        securedSketchData as Record<string, unknown>,
      );
      const existingRooms = await (prisma as any).sketchRoom.findMany({
        where: { sketchId: sketch.id },
        select: {
          id: true,
          fabricObjectId: true,
          name: true,
          geometryJson: true,
          // Dependent counts decide delete vs detach below — a room holding
          // evidence must never be deleted, because the FKs are SetNull.
          _count: {
            select: {
              evidencePins: true,
              moistureReadings: true,
              hazards: true,
            },
          },
        },
        take: 500,
      });
      const byFabric = new Map(
        existingRooms.map((r: { id: string; fabricObjectId: string }) => [
          r.fabricObjectId,
          r.id,
        ]),
      );
      const seenFabric = new Set<string>();
      for (const node of roomNodes) {
        seenFabric.add(node.fabricObjectId);
        const existingId = byFabric.get(node.fabricObjectId);
        if (existingId) {
          await (prisma as any).sketchRoom.update({
            where: { id: existingId },
            data: {
              name: node.name,
              areaM2: node.areaM2,
              perimeterM: node.perimeterM,
              materialSlug: node.materialSlug,
              waterCategory: node.waterCategory,
              provenance: node.provenance,
              geometryJson: node.geometryJson,
              floorNumber,
              // Back on the canvas — clear any previous detachment so the room
              // is a placement target again.
              detachedAt: null,
            },
          });
        } else {
          await (prisma as any).sketchRoom.create({
            data: {
              sketchId: sketch.id,
              fabricObjectId: node.fabricObjectId,
              name: node.name,
              areaM2: node.areaM2,
              perimeterM: node.perimeterM,
              materialSlug: node.materialSlug,
              waterCategory: node.waterCategory,
              provenance: node.provenance,
              geometryJson: node.geometryJson,
              floorNumber,
            },
          });
        }
      }
      // A room missing from the incoming canvas is only safe to delete when
      // nothing was captured in it. Deleting one that holds evidence would
      // SetNull the room link on those pins/readings/hazards and silently lose
      // which room they came from — see partitionStaleRooms.
      const staleRooms = existingRooms.filter(
        (r: { fabricObjectId: string }) => !seenFabric.has(r.fabricObjectId),
      );
      const { deletableIds, detachableIds } = partitionStaleRooms(staleRooms);

      if (deletableIds.length) {
        await (prisma as any).sketchRoom.deleteMany({
          where: { id: { in: deletableIds } },
        });
      }
      if (detachableIds.length) {
        // Only stamp rooms detaching for the first time, so a room that stays
        // off-canvas across saves keeps the timestamp it actually left at.
        await (prisma as any).sketchRoom.updateMany({
          where: { id: { in: detachableIds }, detachedAt: null },
          data: { detachedAt: new Date() },
        });
      }

      const roomsForPins = await (prisma as any).sketchRoom.findMany({
        // Detached rooms are history, not placement targets: hit-testing a
        // point against geometry that is no longer on the canvas would bind
        // new evidence to a room the operator cannot see.
        where: { sketchId: sketch.id, detachedAt: null },
        select: {
          id: true,
          name: true,
          fabricObjectId: true,
          geometryJson: true,
        },
        take: 500,
      });

      // RA-6763 pt2: mirror the moisture overlay pins into normalized
      // SketchMoistureReading rows (source="pin"). Scoped delete+recreate so the
      // technician's manual drying log (source="manual") is never touched.
      const pinReadings = pinsToMoistureReadingInputs(
        sketch.id,
        moisturePoints,
        roomsForPins,
      );
      await (prisma as any).$transaction([
        (prisma as any).sketchMoistureReading.deleteMany({
          where: { sketchId: sketch.id, source: "pin" },
        }),
        ...(pinReadings.length
          ? [
              (prisma as any).sketchMoistureReading.createMany({
                data: pinReadings,
              }),
            ]
          : []),
      ]);

      if (
        activeUnderlay &&
        underlayVerification?.ok &&
        cleanRenderReceipt
      ) {
        const verifiedAt = new Date();
        const verificationJson = {
          roomCount: underlayVerification.roomCount,
          pxPerMetre: underlayVerification.pxPerMetre,
          scaleDescription: underlayVerification.scaleDescription,
          sketchSha256: createHash("sha256")
            .update(stableStringify(securedSketchData))
            .digest("hex"),
          renderSha256: cleanRenderReceipt?.renderSha256,
          storagePath: cleanRenderReceipt?.storagePath,
        };
        await (prisma as any).$transaction([
          (prisma as any).sketchUnderlayReference.update({
            where: { id: activeUnderlay.id },
            data: {
              sketchId: sketch.id,
              verifiedByUserId: session.user.id,
              verifiedAt,
              verificationMethod: underlayVerification.method,
              verificationJson,
            },
          }),
          (prisma as any).auditLog.create({
            data: {
              inspectionId: id,
              action: "Reference floor plan geometry verified",
              entityType: "SketchUnderlayReference",
              entityId: activeUnderlay.id,
              userId: session.user.id,
              changes: JSON.stringify({
                floorNumber,
                method: underlayVerification.method,
                ...verificationJson,
              }),
            },
          }),
        ]);
      }
    } catch (e) {
      console.error(
        "[sketches] SketchElement / moisture / room-graph decomposition failed (non-fatal):",
        e,
      );
    }

    return NextResponse.json(sketch, { status: 201 });
  } catch (error) {
    return fromException(request, error, { stage: "sketches:save" });
  }
}
