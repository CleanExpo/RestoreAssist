/**
 * TEST-ONLY route — upserts an Inspection owned by the currently signed-in
 * test user. The three tech-* specs navigate to
 * /dashboard/inspections/test-inspection and need the row to exist with a
 * status that lets InspectionSignOff render.
 *
 * HARD GUARD — returns 404 unless ALLOW_TEST_HELPERS === "true".
 *
 * Body (all optional):
 *   - inspectionId (string)  — defaults to "test-inspection" (stable ID for E2E).
 *   - status       (string)  — InspectionStatus enum value. Defaults to "COMPLETED".
 *
 * Returns: { inspectionId: string }
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { InspectionStatus } from "@prisma/client";

interface SeedBody {
  inspectionId?: string;
  status?: InspectionStatus;
}

export async function POST(req: NextRequest) {
  // Vercel preview deploys run with NODE_ENV=production, so we cannot use
  // NODE_ENV to gate. The sandbox Vercel project sets ALLOW_TEST_HELPERS=true;
  // prod does not. Local dev sets it via .env.local for the E2E suite to work.
  if (process.env.ALLOW_TEST_HELPERS !== "true") {
    return NextResponse.json(
      { error: "Test helpers are not enabled in this environment" },
      { status: 404 },
    );
  }

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: SeedBody;
  try {
    body = (await req.json()) as SeedBody;
  } catch {
    body = {};
  }

  const id = body.inspectionId ?? "test-inspection";
  const status: InspectionStatus = body.status ?? "COMPLETED";
  // Derived from id so reruns of the same seed don't collide on the unique
  // inspectionNumber constraint (the upsert key is `id`, not inspectionNumber).
  const inspectionNumber = `TEST-${id}`;

  const inspection = await prisma.inspection.upsert({
    where: { id },
    create: {
      id,
      inspectionNumber,
      propertyAddress: "1 Test St, Testville QLD 4000",
      propertyPostcode: "4000",
      status,
      userId: session.user.id,
    },
    update: { status },
    select: { id: true },
  });

  return NextResponse.json({ inspectionId: inspection.id });
}
