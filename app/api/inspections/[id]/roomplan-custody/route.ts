import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertInspectionTenancy } from "@/lib/auth/assert-tenancy";
import { apiError, fromException } from "@/lib/api-errors";
import {
  hashRoomPlanPayloadBytes,
  serializeRoomPlanPayload,
  verifyClientSha256,
} from "@/lib/sketch/roomplan-server-custody";

/**
 * POST /api/inspections/[id]/roomplan-custody
 *
 * Persist CapturedRoom JSON with a server-computed SHA-256 of the stored bytes.
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
        message: "Unauthorized",
        status: 401,
      });
    }

    const { id: inspectionId } = await params;
    const tenancy = await assertInspectionTenancy(session, inspectionId);
    if (!tenancy.ok) {
      return apiError(request, {
        code: tenancy.status === 404 ? "NOT_FOUND" : "FORBIDDEN",
        message: tenancy.reason ?? "Forbidden",
        status: tenancy.status,
      });
    }

    const body = (await request.json()) as {
      capturedRoom?: unknown;
      clientSha256?: string;
      clientCustodyId?: string;
      floorNumber?: number;
    };

    if (!body.capturedRoom || typeof body.capturedRoom !== "object") {
      return apiError(request, {
        code: "VALIDATION",
        message: "capturedRoom is required",
        status: 400,
      });
    }

    const serialized = serializeRoomPlanPayload(body.capturedRoom);
    const contentSha256 = hashRoomPlanPayloadBytes(serialized);

    if (!verifyClientSha256(contentSha256, body.clientSha256)) {
      return apiError(request, {
        code: "VALIDATION",
        message: "Hash mismatch — CapturedRoom may have been altered in transit",
        status: 400,
      });
    }

    // Idempotent: same inspection + digest → return existing receipt.
    const existing = await prisma.roomPlanCaptureReceipt.findFirst({
      where: { inspectionId, contentSha256 },
      select: {
        id: true,
        contentSha256: true,
        clientCustodyId: true,
        floorNumber: true,
        createdAt: true,
      },
    });
    if (existing) {
      return NextResponse.json({ receipt: existing, reused: true });
    }

    const receipt = await prisma.roomPlanCaptureReceipt.create({
      data: {
        inspectionId,
        clientCustodyId: body.clientCustodyId ?? null,
        floorNumber:
          typeof body.floorNumber === "number" ? body.floorNumber : 0,
        payloadJson: JSON.parse(serialized) as object,
        contentSha256,
        clientSha256: body.clientSha256 ?? null,
      },
      select: {
        id: true,
        contentSha256: true,
        clientCustodyId: true,
        floorNumber: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ receipt, reused: false }, { status: 201 });
  } catch (error) {
    return fromException(request, error, { stage: "roomplan-custody:create" });
  }
}
