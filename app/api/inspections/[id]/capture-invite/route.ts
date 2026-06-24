import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  assertInspectionTenancy,
  resolveInspectionWrite,
} from "@/lib/auth/assert-tenancy";
import { apiError, fromException } from "@/lib/api-errors";
import { generateCaptureToken } from "@/lib/capture-token";

/**
 * Staff homeowner-capture invite (Homeowner Phase 5; design D1/D2).
 *
 * POST  — issue a capture token for this inspection (7-day, revocable) and
 *         return the /capture/[token] link for the staff member to send.
 * DELETE — revoke all active capture tokens for this inspection.
 *
 * Authed + tenancy-gated: only the inspection's owner/workspace can issue/revoke.
 */

export const dynamic = "force-dynamic";

const TTL_DAYS = 7; // D2

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Sign in required",
        status: 401,
      });
    }
    const { id } = await params;
    const tenancy = await assertInspectionTenancy(session, id);
    if (!tenancy.ok) {
      return apiError(request, {
        code: tenancy.status === 404 ? "NOT_FOUND" : "FORBIDDEN",
        message: tenancy.reason ?? "Forbidden",
        status: tenancy.status,
      });
    }

    const { token, tokenHash } = generateCaptureToken();
    const expiresAt = new Date(Date.now() + TTL_DAYS * 24 * 60 * 60 * 1000);
    const row = await prisma.captureToken.create({
      data: {
        inspectionId: id,
        tokenHash,
        expiresAt,
        createdByUserId: session.user.id,
      },
    });

    const origin = request.headers.get("origin") ?? "";
    return NextResponse.json(
      {
        data: {
          id: row.id,
          // Plaintext token returned ONCE for the staff member to send; only the
          // hash is stored at rest.
          url: `${origin}/capture/${token}`,
          expiresAt,
        },
      },
      { status: 201 },
    );
  } catch (e) {
    return fromException(request, e);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Sign in required",
        status: 401,
      });
    }
    const { id } = await params;
    const tenancy = await resolveInspectionWrite(session, id);
    if (!tenancy.ok) {
      return apiError(request, {
        code: tenancy.status === 404 ? "NOT_FOUND" : "FORBIDDEN",
        message: tenancy.reason ?? "Forbidden",
        status: tenancy.status,
      });
    }

    const res = await prisma.captureToken.updateMany({
      where: {
        inspectionId: id,
        revokedAt: null,
        ...(tenancy.data.childInspectionFilter && {
          inspection: tenancy.data.childInspectionFilter,
        }),
      },
      data: { revokedAt: new Date() },
    });
    return NextResponse.json({ data: { revoked: res.count } });
  } catch (e) {
    return fromException(request, e);
  }
}
