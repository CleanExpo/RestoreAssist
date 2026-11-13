/**
 * TEST-ONLY — V1 Phase 6 (§39) reference claim fixture via API (no direct DB in E2E).
 *
 * POST body: { inspectionId?: string, syncTestColleagues?: boolean }
 * Returns: fixture ids, portalToken, colleague user ids, capability checklist.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api-errors";
import { testHelpersBlocked } from "../_helpers";
import {
  seedReferenceClaim,
  V1_REFERENCE_CAPABILITY_CHECKS,
} from "@/lib/v1/reference-claim-fixture";

interface SeedBody {
  inspectionId?: string;
  syncTestColleagues?: boolean;
}

export async function POST(req: NextRequest) {
  if (testHelpersBlocked()) {
    return apiError(req, {
      code: "NOT_FOUND",
      message: "Test helpers are not enabled in this environment",
      status: 404,
    });
  }

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(req, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(await req.text());
  } catch {
    parsed = {};
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return apiError(req, {
      code: "VALIDATION",
      message: "Body must be a JSON object",
      status: 400,
    });
  }
  const body = parsed as SeedBody;
  const inspectionId = body.inspectionId ?? "v1-reference-claim";

  const owner = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { organizationId: true },
  });

  const result = await prisma.$transaction((tx) =>
    seedReferenceClaim(tx, {
      inspectionId,
      ownerUserId: session.user.id,
      ownerOrganizationId: owner?.organizationId ?? null,
      syncTestColleagues: body.syncTestColleagues,
    }),
  );

  return NextResponse.json({
    data: {
      ...result,
      capabilities: V1_REFERENCE_CAPABILITY_CHECKS,
      ownerUserId: session.user.id,
    },
  });
}
