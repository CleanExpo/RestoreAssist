/**
 * POST /api/inspections/[id]/handover — SP-J terminal transition.
 *
 * The on-site "Hand over to client" moment. Runs only on CLOSED inspections.
 *
 *   1. getServerSession + tenancy gate (rules 1, 2, 20).
 *   2. Status gate — inspection MUST be `InspectionStatus.CLOSED` AND
 *      `handoverCompletedAt` MUST still be null (idempotency).
 *   3. State-machine `complete_handover` transition checked against the
 *      live row.
 *   4. Build + upload the handover ZIP synchronously — we can't fire-and-
 *      forget because the storage key is the response payload.
 *   5. CAS-update Inspection.{handoverCompletedAt, handoverPackageStorageKey}.
 *   6. Append-only ProgressTransition + AuditLog (action `JOB_HANDED_OVER`)
 *      via the shared lifecycle-event writer.
 *   7. Sign a 1-hour URL on the stored ZIP so the client surface can render
 *      a download button immediately.
 *
 * Response envelope follows RA-1548 (`apiError` on failure,
 * `{ data: { storageKey, packageUrl } }` on success).
 *
 * Spec ref: docs/superpowers/specs/2026-05-14-signin-jobclose-audit-design.md §9.
 * Punchlist ref: docs/discovery/2026-05-15-punchlist.md VERIFIED P0 #1.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { ClaimState, InspectionStatus, Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  assertInspectionTenancy,
  resolveInspectionWrite,
} from "@/lib/auth/assert-tenancy";
import { withIdempotency } from "@/lib/idempotency";
import { apiError } from "@/lib/api-errors";
import { canTransition } from "@/lib/lifecycle/inspection-state-machine";
import { writeLifecycleTransition } from "@/lib/audit/lifecycle-event";
import { exportHandoverPackageToBYOKStorage } from "@/lib/queue/exportHandoverPackageToBYOKStorage";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { BUCKET_ORIGINALS } from "@/lib/storage/types";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour

/**
 * GET — re-sign the handover ZIP when handover is already complete.
 * Returns 404 when handover has not run yet (use POST to complete it).
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
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
      code: tenancy.status === 401 ? "UNAUTHORIZED" : "NOT_FOUND",
      message: tenancy.reason,
      status: tenancy.status,
    });
  }

  const inspection = await prisma.inspection.findUnique({
    where: { id: inspectionId },
    select: {
      handoverCompletedAt: true,
      handoverPackageStorageKey: true,
    },
  });
  if (!inspection) {
    return apiError(request, {
      code: "NOT_FOUND",
      message: "Inspection not found",
      status: 404,
    });
  }
  if (!inspection.handoverCompletedAt || !inspection.handoverPackageStorageKey) {
    return apiError(request, {
      code: "NOT_FOUND",
      message: "Handover package not available yet",
      status: 404,
    });
  }

  let packageUrl: string | null = null;
  try {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase.storage
      .from(BUCKET_ORIGINALS)
      .createSignedUrl(
        inspection.handoverPackageStorageKey,
        SIGNED_URL_TTL_SECONDS,
      );
    if (error) throw error;
    packageUrl = data?.signedUrl ?? null;
  } catch (err) {
    return apiError(request, {
      code: "INTERNAL",
      message: "Failed to sign handover download URL",
      status: 500,
      err,
      stage: "handover-resign",
    });
  }

  return NextResponse.json({
    data: {
      storageKey: inspection.handoverPackageStorageKey,
      packageUrl,
      handoverCompletedAt: inspection.handoverCompletedAt.toISOString(),
    },
  });
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(request, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }
  const userId = session.user.id;
  const { id: inspectionId } = await params;

  return withIdempotency(request, userId, async () => {
    // 1. Tenancy gate. 404 (not 403) when wrong-tenant to avoid ID enumeration.
    const tenancy = await resolveInspectionWrite(session, inspectionId);
    if (!tenancy.ok) {
      return apiError(request, {
        code: tenancy.status === 401 ? "UNAUTHORIZED" : "NOT_FOUND",
        message: tenancy.reason,
        status: tenancy.status,
      });
    }

    // 2. Load just the two columns the state-machine needs. Explicit
    //    `select` per rule 4.
    const inspection = await prisma.inspection.findUnique({
      where: { id: inspectionId },
      select: {
        status: true,
        handoverCompletedAt: true,
      },
    });
    if (!inspection) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Inspection not found",
        status: 404,
      });
    }

    // 3. Status gate — handover only runs on a CLOSED inspection. The
    //    state machine treats `close_job` (IN_BILLING → CLOSED) and
    //    `complete_handover` (CLOSED → CLOSED) as two distinct edges
    //    sharing a `to` of CLOSED; we must short-circuit here so a
    //    pre-close inspection doesn't trip the close-job preconditions
    //    instead of the handover idempotency gate.
    if (inspection.status !== InspectionStatus.CLOSED) {
      return NextResponse.json(
        {
          error: {
            code: "CONFLICT",
            message: "Inspection must be CLOSED before handover",
            missing: ["invalid_transition"],
          },
        },
        { status: 409 },
      );
    }

    // State-machine gate — only the `complete_handover` self-loop now.
    // The required `handover_not_yet_done` key enforces idempotency.
    const gate = canTransition(
      inspection.status,
      InspectionStatus.CLOSED,
      {
        invoiceStatus: null,
        reportStatus: null,
        handoverCompletedAt: inspection.handoverCompletedAt,
      },
    );
    if (!gate.ok) {
      // 409 with `missing[]` — mirrors the close-route shape so a single
      // client-side handler can drive both surfaces. We hand-roll the
      // envelope (rather than going through apiError) because the
      // RA-1548 helper doesn't yet surface arbitrary detail arrays.
      return NextResponse.json(
        {
          error: {
            code: "CONFLICT",
            message: "Inspection cannot be handed over in its current state",
            missing: gate.missing,
          },
        },
        { status: 409 },
      );
    }

    // 4. Build + upload the ZIP. Synchronous — failure is a hard 500.
    let exportResult: { storageKey: string; byteSize: number };
    try {
      exportResult = await exportHandoverPackageToBYOKStorage(inspectionId);
    } catch (err) {
      return apiError(request, {
        code: "INTERNAL",
        message: "Failed to build handover package",
        status: 500,
        err,
        stage: "export",
      });
    }

    // 5. CAS-update — only stamp the row if it's still CLOSED + handover
    //    not yet recorded. A concurrent caller that won the race will
    //    have already flipped `handoverCompletedAt`; we then return 409.
    const completedAt = new Date();
    const cas = await prisma.inspection.updateMany({
      where: {
        ...tenancy.data.inspectionManyWhere,
        status: InspectionStatus.CLOSED,
        handoverCompletedAt: null,
      },
      data: {
        handoverCompletedAt: completedAt,
        handoverPackageStorageKey: exportResult.storageKey,
      },
    });
    if (cas.count === 0) {
      return NextResponse.json(
        {
          error: {
            code: "CONFLICT",
            message: "Inspection status drifted during handover",
            missing: ["status_drift"],
          },
        },
        { status: 409 },
      );
    }

    // 6. Append-only ProgressTransition + AuditLog. CLOSED → CLOSED in
    //    InspectionStatus terms maps to the ClaimState CLOSED → CLOSED
    //    self-loop; we surface the handover via `transitionKey` and the
    //    audit action `JOB_HANDED_OVER` (distinct from `JOB_CLOSED`).
    try {
      await writeLifecycleTransition({
        inspectionId,
        fromState: ClaimState.CLOSED,
        toState: ClaimState.CLOSED,
        transitionKey: "complete_handover",
        actorUserId: userId,
        actorRole: (session.user as { role?: string }).role ?? "USER",
        actorName: session.user.name ?? "User",
        guardSnapshot: {
          handoverPackageStorageKey: exportResult.storageKey,
          byteSize: exportResult.byteSize,
        } as Prisma.InputJsonValue,
        auditAction: "JOB_HANDED_OVER",
      });
    } catch (err) {
      // Audit-write failure after the CAS stamp is rare but possible.
      // We log + continue so the user still sees their handover record;
      // the missing audit row surfaces in the Workspace Health view.
      console.error(
        `[handover] lifecycle-event write failed for ${inspectionId}:`,
        err,
      );
    }

    // 7. Sign a 1h URL on the stored ZIP so the response can ship a
    //    download link. Sign-failure is non-fatal — the storage key is
    //    the canonical record and the dashboard can re-sign on demand.
    let packageUrl: string | null = null;
    try {
      const supabase = getSupabaseServerClient();
      const { data, error } = await supabase.storage
        .from(BUCKET_ORIGINALS)
        .createSignedUrl(exportResult.storageKey, SIGNED_URL_TTL_SECONDS);
      if (error) throw error;
      packageUrl = data?.signedUrl ?? null;
    } catch (err) {
      console.warn(
        `[handover] signed-URL mint failed for ${inspectionId}:`,
        err,
      );
    }

    return NextResponse.json({
      data: {
        storageKey: exportResult.storageKey,
        packageUrl,
        handoverCompletedAt: completedAt.toISOString(),
      },
    });
  });
}
