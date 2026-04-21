import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sanitizeString } from "@/lib/sanitize";
import { applyRateLimit } from "@/lib/rate-limiter";
import { withIdempotency } from "@/lib/idempotency";

// POST - Add moisture reading
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const rateLimited = await applyRateLimit(request, {
    windowMs: 60 * 1000,
    maxRequests: 60,
    prefix: "moisture",
    key: userId,
  });
  if (rateLimited) return rateLimited;

  const { id } = await params;

  // RA-1266: moisture readings are time-series — retry creates
  // duplicate readings, polluting the drying trend.
  return withIdempotency(request, userId, async (rawBody) => {
    try {
      let body: any;
      try {
        body = rawBody ? JSON.parse(rawBody) : {};
      } catch {
        return NextResponse.json(
          { error: "Invalid JSON body" },
          { status: 400 },
        );
      }

      const inspection = await prisma.inspection.findFirst({
        where: { id, userId },
      });

      if (!inspection) {
        return NextResponse.json(
          { error: "Inspection not found" },
          { status: 404 },
        );
      }

      // Validate required fields
      if (!body.location || !body.location.trim()) {
        return NextResponse.json(
          { error: "Location is required" },
          { status: 400 },
        );
      }

      if (!body.surfaceType) {
        return NextResponse.json(
          { error: "Surface type is required" },
          { status: 400 },
        );
      }

      // Explicit typeof + isNaN guards: JS comparisons on null/NaN both return false,
      // allowing null/NaN to silently pass a < 0 || > 100 check and corrupt the DB.
      const rawLevel = body.moistureLevel;
      if (
        typeof rawLevel !== "number" ||
        isNaN(rawLevel) ||
        rawLevel < 0 ||
        rawLevel > 100
      ) {
        return NextResponse.json(
          { error: "Moisture level must be a number between 0 and 100" },
          { status: 400 },
        );
      }

      // Create moisture reading
      // Note: mapX/mapY are set separately when user places reading on the floor plan map
      //
      // RA-1312: the server accepts `photoUrl: null` unconditionally. If the
      // client intended to attach a photo but the Cloudinary upload failed
      // (offline, 5xx, rate-limited), the client MAY still submit this create
      // — the reading persists without the photo, and no one knows. Emit a
      // structured counter when photoUrl is null so ops can detect the
      // pattern. A follow-up ticket covers the client-side change: require
      // `photoIntended: true/false` explicitly, reject when photoIntended=true
      // but photoUrl=null.
      const photoUrl = body.photoUrl || null;
      if (photoUrl === null) {
        console.info(
          `[moisture.create] photo-less save for inspection ${id} (RA-1312 tracking)`,
        );
      }
      const createData: Record<string, unknown> = {
        inspectionId: id,
        location: sanitizeString(body.location.trim(), 200),
        surfaceType: sanitizeString(body.surfaceType, 100),
        moistureLevel: rawLevel,
        depth: sanitizeString(body.depth || "Surface", 50),
        notes: body.notes ? sanitizeString(body.notes, 2000) : null,
        photoUrl,
      };
      // Include mapX/mapY only if provided — clamp to [0, 1] normalised range; reject non-finite
      if (body.mapX !== undefined && body.mapX !== null) {
        const mx = parseFloat(body.mapX);
        if (!isFinite(mx))
          return NextResponse.json(
            { error: "mapX must be a finite number" },
            { status: 400 },
          );
        createData.mapX = Math.min(1, Math.max(0, mx));
      }
      if (body.mapY !== undefined && body.mapY !== null) {
        const my = parseFloat(body.mapY);
        if (!isFinite(my))
          return NextResponse.json(
            { error: "mapY must be a finite number" },
            { status: 400 },
          );
        createData.mapY = Math.min(1, Math.max(0, my));
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const moistureReading = await (prisma.moistureReading.create as any)({
        data: createData,
      });

      // Create audit log
      await prisma.auditLog.create({
        data: {
          inspectionId: id,
          action: "Moisture reading added",
          entityType: "MoistureReading",
          entityId: moistureReading.id,
          userId,
          changes: JSON.stringify({
            location: moistureReading.location,
            surfaceType: moistureReading.surfaceType,
            moistureLevel: moistureReading.moistureLevel,
          }),
        },
      });

      return NextResponse.json({ moistureReading }, { status: 201 });
    } catch (error) {
      console.error("Error saving moisture reading:", error);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 },
      );
    }
  });
}
