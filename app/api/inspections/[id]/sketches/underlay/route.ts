import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { assertInspectionTenancy } from "@/lib/auth/assert-tenancy";
import { apiError, fromException } from "@/lib/api-errors";
import { prisma } from "@/lib/prisma";
import {
  buildUnderlayAttestationRecord,
  evaluateUnderlayAttestation,
  type UnderlaySource,
} from "@/lib/sketch/underlay-attestation";
import {
  prepareUnderlayBytes,
  removeStoredUnderlay,
  storeUnderlay,
} from "@/lib/sketch/server-underlay-import";

function floorNumberFrom(
  value: FormDataEntryValue | string | null,
): number | null {
  const floor = Number(value ?? "0");
  return Number.isInteger(floor) && floor >= 0 && floor <= 50 ? floor : null;
}

/**
 * Import a private reference underlay and bind rights + custody to its exact
 * stored bytes. This is the only production write path for ClaimSketch
 * backgroundImageUrl.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Sign in to import a floor plan.",
        status: 401,
      });
    }
    const { id } = await params;
    const tenancy = await assertInspectionTenancy(session, id);
    if (!tenancy.ok) {
      return apiError(request, {
        code: tenancy.status === 404 ? "NOT_FOUND" : "FORBIDDEN",
        message: tenancy.reason ?? "Inspection not found",
        status: tenancy.status,
      });
    }

    const declaredRequestBytes = Number(
      request.headers.get("content-length") ?? "0",
    );
    if (
      Number.isFinite(declaredRequestBytes) &&
      declaredRequestBytes > 12 * 1024 * 1024
    ) {
      return apiError(request, {
        code: "PAYLOAD_TOO_LARGE",
        message: "Floor-plan upload request must not exceed 12 MB.",
        status: 413,
      });
    }
    const form = await request.formData();
    const floorNumber = floorNumberFrom(form.get("floorNumber"));
    if (floorNumber == null) {
      return apiError(request, {
        code: "VALIDATION",
        message: "floorNumber must be an integer from 0 to 50.",
        status: 400,
      });
    }

    const source: UnderlaySource =
      form.get("source") === "url" ? "url" : "upload";
    const attestationInput = {
      holdsRights: form.get("holdsRights") === "true",
      compliesWithSourceTerms: form.get("compliesWithSourceTerms") === "true",
    };
    const attestation = evaluateUnderlayAttestation(attestationInput);
    if (!attestation.ok) {
      return apiError(request, {
        code: "VALIDATION",
        message: attestation.reason ?? "Rights attestation is incomplete.",
        status: 400,
      });
    }

    const sourcePageUrl: string | null = null;
    const sourceImageUrl: string | null = null;
    let sourceBytes: Buffer;
    let declaredMime: string | null = null;

    if (source === "url") {
      return apiError(request, {
        code: "FEATURE_UNAVAILABLE",
        message:
          "Direct listing-image import is paused. Download an authorised copy and upload it for content-bound custody.",
        status: 409,
      });
    } else {
      const file = form.get("file");
      if (!(file instanceof File)) {
        return apiError(request, {
          code: "VALIDATION",
          message: "A PNG, JPEG or WebP floor-plan file is required.",
          status: 400,
        });
      }
      if (file.size > 10 * 1024 * 1024) {
        return apiError(request, {
          code: "PAYLOAD_TOO_LARGE",
          message: "Floor-plan image must not exceed 10 MB.",
          status: 413,
        });
      }
      declaredMime = file.type;
      sourceBytes = Buffer.from(await file.arrayBuffer());
    }

    const prepared = await prepareUnderlayBytes(sourceBytes, declaredMime);
    const stored = await storeUnderlay(id, floorNumber, prepared);
    const record = buildUnderlayAttestationRecord(attestationInput, source);
    const now = new Date();

    let saved: { sketchId: string; referenceId: string };
    try {
      saved = await (prisma as any).$transaction(async (tx: any) => {
        let sketch = await tx.claimSketch.findFirst({
          where: { inspectionId: id, floorNumber },
          select: { id: true },
        });
        if (sketch) {
          sketch = await tx.claimSketch.update({
            where: { id: sketch.id },
            data: {
              backgroundImageUrl: `storage://sketch-media/${stored.storagePath}`,
              captureAdapter: "underlay_import",
            },
            select: { id: true },
          });
        } else {
          sketch = await tx.claimSketch.create({
            data: {
              inspectionId: id,
              floorNumber,
              floorLabel:
                floorNumber === 0 ? "Ground Floor" : `Floor ${floorNumber + 1}`,
              backgroundImageUrl: `storage://sketch-media/${stored.storagePath}`,
              captureAdapter: "underlay_import",
            },
            select: { id: true },
          });
        }

        await tx.sketchUnderlayReference.updateMany({
          where: {
            inspectionId: id,
            floorNumber,
            replacedAt: null,
            removedAt: null,
          },
          data: { replacedAt: now },
        });
        const reference = await tx.sketchUnderlayReference.create({
          data: {
            inspectionId: id,
            sketchId: sketch.id,
            floorNumber,
            storagePath: stored.storagePath,
            sourceType: source,
            sourcePageUrl,
            sourceImageUrl,
            contentSha256: prepared.contentSha256,
            mimeType: prepared.mimeType,
            sourceSizeBytes: prepared.sourceSizeBytes,
            storedSizeBytes: prepared.bytes.length,
            attestationVersion: record.version,
            attestationStatement: record.statement,
            holdsRights: true,
            compliesWithSourceTerms: true,
            attestedByUserId: session.user.id,
            attestedAt: new Date(record.attestedAt),
          },
          select: { id: true },
        });
        await tx.auditLog.create({
          data: {
            inspectionId: id,
            action: "Reference floor plan imported",
            entityType: "SketchUnderlayReference",
            entityId: reference.id,
            userId: session.user.id,
            changes: JSON.stringify({
              floorNumber,
              source,
              contentSha256: prepared.contentSha256,
              exportPolicy: "reference_only_never_export",
            }),
          },
        });
        return { sketchId: sketch.id, referenceId: reference.id };
      });
    } catch (error) {
      if (stored.created) {
        await removeStoredUnderlay(stored.storagePath).catch(() => undefined);
      }
      throw error;
    }

    return NextResponse.json(
      {
        recorded: true,
        imageUrl: stored.signedUrl,
        sketchId: saved.sketchId,
        referenceId: saved.referenceId,
        contentSha256: prepared.contentSha256,
      },
      { status: 201 },
    );
  } catch (error) {
    return fromException(request, error, { stage: "sketch-underlay:import" });
  }
}

/** Remove the active reference from a floor while retaining its custody row. */
export async function DELETE(
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
    const tenancy = await assertInspectionTenancy(session, id);
    if (!tenancy.ok) {
      return apiError(request, {
        code: tenancy.status === 404 ? "NOT_FOUND" : "FORBIDDEN",
        message: tenancy.reason ?? "Inspection not found",
        status: tenancy.status,
      });
    }
    const floorNumber = floorNumberFrom(
      request.nextUrl.searchParams.get("floorNumber"),
    );
    if (floorNumber == null) {
      return apiError(request, {
        code: "VALIDATION",
        message: "floorNumber must be an integer from 0 to 50.",
        status: 400,
      });
    }
    const now = new Date();
    await (prisma as any).$transaction([
      (prisma as any).claimSketch.updateMany({
        where: { inspectionId: id, floorNumber },
        data: { backgroundImageUrl: null, renderedPngUrl: null },
      }),
      (prisma as any).sketchUnderlayReference.updateMany({
        where: {
          inspectionId: id,
          floorNumber,
          replacedAt: null,
          removedAt: null,
        },
        data: { removedAt: now },
      }),
    ]);
    return NextResponse.json({ removed: true });
  } catch (error) {
    return fromException(request, error, { stage: "sketch-underlay:remove" });
  }
}
