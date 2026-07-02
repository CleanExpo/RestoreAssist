/**
 * GET /api/inspections/inbound-jobs
 *
 * Returns DR/NRPG-sourced inspections for the current user that have not
 * yet been accepted (source='DR_NRPG' AND acceptedAt IS NULL).
 *
 * Drives <InboundJobAlert> on /dashboard. Joins through DrNrpgJobSync to
 * surface the insurer / policyHolder / claimNumber that live there
 * (NOT on Inspection — see schema comment in dr-nrpg/route.ts).
 *
 * Response: { jobs: InboundJobSummary[] }
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";

export interface InboundJobSummary {
  id: string;
  inspectionNumber: string;
  propertyAddress: string;
  inspectionDate: string;
  claimType: string | null;
  // From the linked DrNrpgJobSync — null if the link was broken/cleared
  insurer: string | null;
  policyHolder: string | null;
  claimNumber: string | null;
}

const MAX_INBOUND_JOBS = 20;

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(request, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }
  const userId = session.user.id;

  try {
    const rows = await prisma.inspection.findMany({
      where: {
        userId,
        ...({ source: "DR_NRPG", acceptedAt: null } as any),
      },
      take: MAX_INBOUND_JOBS,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        inspectionNumber: true,
        propertyAddress: true,
        inspectionDate: true,
        claimType: true,
      },
    });

    if (rows.length === 0) {
      return NextResponse.json({ jobs: [] });
    }

    // Fetch the linked DrNrpgJobSync rows in one round-trip (avoid N+1).
    const jobSyncs = await (prisma as any).drNrpgJobSync.findMany({
      where: { inspectionId: { in: rows.map((r) => r.id) } },
      take: MAX_INBOUND_JOBS,
      select: {
        inspectionId: true,
        insurer: true,
        policyHolder: true,
        claimNumber: true,
      },
    });
    const syncByInspection = new Map<
      string,
      {
        insurer: string | null;
        policyHolder: string | null;
        claimNumber: string | null;
      }
    >();
    for (const js of jobSyncs) {
      syncByInspection.set(js.inspectionId, {
        insurer: js.insurer ?? null,
        policyHolder: js.policyHolder ?? null,
        claimNumber: js.claimNumber ?? null,
      });
    }

    const jobs: InboundJobSummary[] = rows.map((r) => {
      const sync = syncByInspection.get(r.id);
      return {
        id: r.id,
        inspectionNumber: r.inspectionNumber,
        propertyAddress: r.propertyAddress,
        inspectionDate: r.inspectionDate.toISOString(),
        claimType: (r.claimType as string | null) ?? null,
        insurer: sync?.insurer ?? null,
        policyHolder: sync?.policyHolder ?? null,
        claimNumber: sync?.claimNumber ?? null,
      };
    });

    return NextResponse.json({ jobs });
  } catch (error) {
    return fromException(request, error, { stage: "inbound-jobs:list" });
  }
}
