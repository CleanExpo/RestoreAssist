/**
 * RA-1467 — per-user admin mutation endpoint.
 *
 * PATCH /api/admin/users/[id]
 *   body: { isJuniorTechnician: boolean }
 *
 * Admin-only. Same-organization scoping (admin can only edit users in
 * their own org — prevents cross-tenant escalation). Single-field body
 * to avoid mass-assignment: any other keys are ignored.
 *
 * Downstream: `resolveProgressRole` in lib/progress/permissions.ts
 * already reads `isJuniorTechnician` → returns "TECHNICIAN_JUNIOR" so
 * `canPerformTransition` hard-blocks non-evidence transitions. No
 * additional downstream code needed to honour the flag.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { verifyAdminFromDb } from "@/lib/admin-auth";
import { reportError } from "@/lib/observability";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  const auth = await verifyAdminFromDb(session);
  if (auth.response) return auth.response;
  const { user: adminUser } = auth;

  const { id: targetUserId } = await params;
  if (!targetUserId) {
    return NextResponse.json({ error: "User id required" }, { status: 400 });
  }

  // Same-org guard
  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, organizationId: true },
  });
  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  if (adminUser!.organizationId && target.organizationId !== adminUser!.organizationId) {
    return NextResponse.json(
      { error: "Cannot edit users outside your organisation" },
      { status: 403 },
    );
  }

  const body = (await request.json().catch(() => null)) as
    | { isJuniorTechnician?: unknown }
    | null;

  // Single-field whitelist — deliberately ignores other keys to avoid
  // mass-assignment (RA-1338 pattern).
  if (body == null || typeof body.isJuniorTechnician !== "boolean") {
    return NextResponse.json(
      {
        error:
          "Expected body { isJuniorTechnician: boolean }. No other fields accepted at this endpoint.",
      },
      { status: 400 },
    );
  }

  try {
    const updated = await prisma.user.update({
      where: { id: target.id },
      data: { isJuniorTechnician: body.isJuniorTechnician },
      select: { id: true, email: true, isJuniorTechnician: true },
    });

    // Structured log for Vercel Observability — who changed whom, when.
    console.info(
      "[admin-user.patch]",
      JSON.stringify({
        adminUserId: adminUser!.id,
        targetUserId: target.id,
        field: "isJuniorTechnician",
        value: body.isJuniorTechnician,
      }),
    );

    return NextResponse.json({ user: updated });
  } catch (err) {
    reportError(err, {
      route: "/api/admin/users/[id]",
      stage: "update",
      adminUserId: adminUser!.id,
      targetUserId: target.id,
    });
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}
