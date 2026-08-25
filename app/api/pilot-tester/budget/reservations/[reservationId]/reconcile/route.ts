import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { apiError, fromException } from "@/lib/api-errors";
import { validateCsrf } from "@/lib/csrf";
import {
  PilotContractError,
  reconcilePilotBudget,
  requirePilotWorkspace,
} from "@/lib/pilot-tester/budget-contract";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ reservationId: string }> },
) {
  try {
    const csrfError = validateCsrf(request, { requireOrigin: true });
    if (csrfError) return csrfError;

    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(request, { code: "UNAUTHORIZED", message: "Unauthorized", status: 401 });
    }
    const { reservationId } = await params;
    // Resolve the workspace from the reservation first, then apply the same
    // sandbox + tenancy gate as reservation creation. Never accept a
    // caller-provided workspace ID here.
    const reservation = await prisma.pilotBudgetReservation.findUnique({
      where: { id: reservationId }, select: { workspaceId: true },
    });
    if (!reservation) {
      return apiError(request, { code: "NOT_FOUND", message: "Pilot budget reservation not found", status: 404 });
    }
    await requirePilotWorkspace(session.user.id, reservation.workspaceId);
    const receipt = await reconcilePilotBudget(reservationId, reservation.workspaceId, session.user.id);
    return NextResponse.json(receipt);
  } catch (error) {
    if (error instanceof PilotContractError) {
      return apiError(request, {
        code: error.status === 404 ? "NOT_FOUND" : error.status === 409 ? "CONFLICT" : "INTERNAL",
        message: error.message,
        status: error.status,
      });
    }
    return fromException(request, error, { stage: "pilot-budget:reconcile" });
  }
}
