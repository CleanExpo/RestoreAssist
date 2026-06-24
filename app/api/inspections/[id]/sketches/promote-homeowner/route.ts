import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { resolveInspectionWrite } from "@/lib/auth/assert-tenancy";
import { apiError, fromException } from "@/lib/api-errors";

/**
 * Promote homeowner-submitted capture out of quarantine (Homeowner Phase 5; D4).
 *
 * A technician reviews and accepts a homeowner submission: the quarantined
 * `pendingHomeownerCapture` is copied into the authoritative `sketchData` /
 * `moisturePoints` / `country` (so it now feeds compliance/scope/PDF) and the
 * pending sidecar is cleared. Authed + tenancy-gated — the human act is explicit.
 */

export const dynamic = "force-dynamic";

interface PendingCapture {
  sketchData?: Prisma.InputJsonValue;
  moisturePoints?: Prisma.InputJsonValue;
  country?: "AU" | "NZ";
}

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
    const tenancy = await resolveInspectionWrite(session, id);
    if (!tenancy.ok) {
      return apiError(request, {
        code: tenancy.status === 404 ? "NOT_FOUND" : "FORBIDDEN",
        message: tenancy.reason ?? "Forbidden",
        status: tenancy.status,
      });
    }

    // ra-query-ok: sketches for a single inspection; all must be promoted, so a
    // take would leave some homeowner captures un-promoted.
    const sketches = await prisma.claimSketch.findMany({
      where: { inspectionId: id },
      select: { id: true, pendingHomeownerCapture: true },
    });

    let promoted = 0;
    for (const s of sketches) {
      const pending = s.pendingHomeownerCapture as PendingCapture | null;
      if (!pending) continue;
      await prisma.claimSketch.update({
        where: {
          id: s.id,
          ...(tenancy.data.childInspectionFilter && {
            inspection: tenancy.data.childInspectionFilter,
          }),
        },
        data: {
          sketchData: pending.sketchData ?? Prisma.DbNull,
          moisturePoints: pending.moisturePoints ?? Prisma.DbNull,
          country: pending.country ?? "AU",
          // Un-quarantine: clear the pending sidecar.
          pendingHomeownerCapture: Prisma.DbNull,
        },
      });
      promoted++;
    }

    return NextResponse.json({ data: { promoted } });
  } catch (e) {
    return fromException(request, e);
  }
}
