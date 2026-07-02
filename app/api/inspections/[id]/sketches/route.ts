import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertInspectionTenancy } from "@/lib/auth/assert-tenancy";
import { apiError, fromException } from "@/lib/api-errors";
import { decomposeElements } from "@/lib/sketch/decompose-elements";
import { pinsToMoistureReadingInputs } from "@/lib/sketch/moisture-readings-sync";

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

    return NextResponse.json({ sketches });
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
      backgroundImageUrl,
      renderedPngUrl,
      backgroundImageOpacity,
      backgroundImageScale,
      backgroundImageOffsetX,
      backgroundImageOffsetY,
      moisturePoints,
      equipmentPoints,
      country,
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

    // If a sketch already exists for this floor, update it; otherwise create
    const existing = await (prisma as any).claimSketch.findFirst({
      where: { inspectionId: id, floorNumber },
    });

    // RA-1762 — staleness guard. The offline sketch queue can hold a
    // payload whose logical timestamp predates the latest server write
    // (user dropped offline, drew, came back online and saved fresh,
    // then a slow queued POST finally arrives carrying the older state).
    // Without this check the older payload would clobber the newer one.
    //
    // Client sends `x-client-updated-at` (epoch ms or ISO) representing
    // the moment the sketch state was captured locally. If we already
    // have a newer row, return 409 with `{ stale: true }` so the queue
    // drain drops the entry silently rather than retrying or storing
    // a conflict record. Online-first saves can omit the header — the
    // null branch behaves like the old code.
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

    const sketch = existing
      ? await (prisma as any).claimSketch.update({
          where: { id: existing.id },
          data: {
            sketchType,
            sketchData: sketchData ?? undefined,
            backgroundImageUrl: backgroundImageUrl ?? undefined,
            renderedPngUrl: renderedPngUrl ?? undefined,
            backgroundImageOpacity: opacity,
            backgroundImageScale: bgScale,
            backgroundImageOffsetX: bgOffsetX,
            backgroundImageOffsetY: bgOffsetY,
            moisturePoints: moisturePoints ?? undefined,
            equipmentPoints: equipmentPoints ?? undefined,
            country: country ?? undefined,
          },
        })
      : await (prisma as any).claimSketch.create({
          data: {
            inspectionId: id,
            floorNumber,
            floorLabel,
            sketchType,
            sketchData: sketchData ?? undefined,
            backgroundImageUrl: backgroundImageUrl ?? undefined,
            renderedPngUrl: renderedPngUrl ?? undefined,
            backgroundImageOpacity: opacity,
            backgroundImageScale: bgScale,
            backgroundImageOffsetX: bgOffsetX,
            backgroundImageOffsetY: bgOffsetY,
            moisturePoints: moisturePoints ?? undefined,
            equipmentPoints: equipmentPoints ?? undefined,
            country: country ?? undefined,
          },
        });

    // RA Mapping V2 (spec §6.4): derive normalized SketchElement rows from the
    // authoritative Fabric blob. Non-fatal — the blob save is the source of truth,
    // so a decomposition failure must never reject the sketch save.
    try {
      const decomposed =
        sketchData && typeof sketchData === "object"
          ? decomposeElements(sketchData as Record<string, unknown>)
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

      // RA-6763 pt2: mirror the moisture overlay pins into normalized
      // SketchMoistureReading rows (source="pin"). Scoped delete+recreate so the
      // technician's manual drying log (source="manual") is never touched.
      const pinReadings = pinsToMoistureReadingInputs(
        sketch.id,
        moisturePoints,
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
    } catch (e) {
      console.error(
        "[sketches] SketchElement / moisture decomposition failed (non-fatal):",
        e,
      );
    }

    return NextResponse.json(sketch, { status: 201 });
  } catch (error) {
    return fromException(request, error, { stage: "sketches:save" });
  }
}
