/**
 * Pilot Observation Recording
 *
 * POST /api/pilot/observations
 *   Records a new pilot measurement observation. Used by:
 *     - Technician post-use survey submissions (CLAIM-005)
 *     - Admin recording of adjuster timed sessions (CLAIM-004)
 *     - Admin recording of re-inspection events (CLAIM-003)
 *     - Admin recording of per-claim cost data (CLAIM-002)
 *
 * GET /api/pilot/observations
 *   Returns all recorded observations (admin only).
 *   Grouped by claim for quick inspection.
 *
 * CLAIM-007 (cycle time) is auto-derived from completed inspections.
 * Use GET /api/pilot/readiness to see auto-derived cycle time data.
 *
 * Authentication:
 *   - POST: any authenticated user (technician survey) or ADMIN
 *   - GET: ADMIN role only
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { verifyAdminFromDb } from "@/lib/admin-auth";
import { apiError, fromException } from "@/lib/api-errors";
import {
  validateObservation,
  type NewPilotObservation,
  type ObservationType,
  type PilotGroup,
} from "@/lib/nir-pilot-measurement";

const MAX_PILOT_OBSERVATIONS = 1_000;

// ─── POST — record a new observation ─────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    let body: {
      claimId?: string;
      observationType?: string;
      value?: number;
      group?: string;
      inspectionId?: string;
      context?: Record<string, unknown>;
      notes?: string;
    };
    try {
      body = await request.json();
    } catch {
      return apiError(request, {
        code: "VALIDATION",
        message: "Invalid JSON body",
        status: 400,
      });
    }

    const obs: NewPilotObservation = {
      claimId: body.claimId ?? "",
      observationType: (body.observationType ?? "") as ObservationType,
      value: body.value ?? NaN,
      group: (body.group ?? "nir") as PilotGroup,
      inspectionId: body.inspectionId,
      recordedByUserId: session.user.id,
      context: body.context,
      notes: body.notes,
    };

    const errors = validateObservation(obs);
    if (errors.length > 0) {
      return NextResponse.json(
        { error: "Invalid observation", details: errors },
        { status: 400 },
      );
    }

    // If inspectionId provided, verify the user can access it
    if (obs.inspectionId) {
      const inspection = await prisma.inspection.findFirst({
        where: {
          id: obs.inspectionId,
          userId: session.user.id,
        },
        select: { id: true },
      });
      if (!inspection) {
        return apiError(request, {
          code: "NOT_FOUND",
          message: "Inspection not found or not accessible",
          status: 404,
        });
      }
    }

    const record = await prisma.pilotObservation.create({
      data: {
        claimId: obs.claimId,
        observationType: obs.observationType,
        value: obs.value,
        group: obs.group ?? "nir",
        inspectionId: obs.inspectionId ?? null,
        recordedByUserId: obs.recordedByUserId,
        context: (obs.context ?? null) as any,
        notes: obs.notes ?? null,
      },
    });

    return NextResponse.json(
      {
        message: "Pilot observation recorded",
        observation: record,
      },
      { status: 201 },
    );
  } catch (error) {
    return fromException(request, error, { stage: "create" });
  }
}

// ─── GET — list all observations (admin) ──────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const auth = await verifyAdminFromDb(session);
    if (auth.response) return auth.response;

    const { searchParams } = new URL(request.url);
    const claimId = searchParams.get("claimId");
    const group = searchParams.get("group");

    const where: Record<string, unknown> = {};
    if (claimId) where.claimId = claimId;
    if (group) where.group = group;

    const observations = await prisma.pilotObservation.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: MAX_PILOT_OBSERVATIONS,
    });

    // Group by claim for convenience
    const grouped: Record<string, typeof observations> = {};
    for (const obs of observations) {
      if (!grouped[obs.claimId]) grouped[obs.claimId] = [];
      grouped[obs.claimId].push(obs);
    }

    return NextResponse.json({
      total: observations.length,
      grouped,
      observations,
    });
  } catch (error) {
    return fromException(request, error, { stage: "list" });
  }
}
