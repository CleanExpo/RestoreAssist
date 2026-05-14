/**
 * TEST-ONLY route — seeds an Organization + manager User + UserInvite for
 * the invited-technician E2E specs. Returns the invite token so Playwright
 * can navigate to /invite/<token>.
 *
 * HARD GUARD — returns 404 unless NODE_ENV !== "production".
 *
 * Body (all optional):
 *   - managerEmail   (string)  — manager User.email. Defaults to a unique value.
 *   - expiresInDays  (number)  — invite TTL. Use -1 to test the expired branch.
 *   - markUsed       (boolean) — sets usedAt to now to test the already-used branch.
 *
 * Returns: { token: string, inviteeEmail: string }
 */
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";

interface SeedBody {
  managerEmail?: string;
  expiresInDays?: number;
  markUsed?: boolean;
}

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "Not available in production" },
      { status: 404 },
    );
  }

  let body: SeedBody;
  try {
    body = (await req.json()) as SeedBody;
  } catch {
    body = {};
  }

  const stamp = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  const managerEmail =
    typeof body.managerEmail === "string" && body.managerEmail.length > 0
      ? body.managerEmail
      : `mgr-${stamp}@test.local`;
  const inviteeEmail = `tech-${stamp}@test.local`;

  const expiresInDays =
    typeof body.expiresInDays === "number" ? body.expiresInDays : 7;
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);
  const usedAt = body.markUsed === true ? new Date() : null;

  const manager = await prisma.user.create({
    data: {
      name: `Test Manager ${stamp}`,
      email: managerEmail,
      role: "ADMIN",
    },
    select: { id: true },
  });

  const org = await prisma.organization.create({
    data: {
      name: `Test Org ${stamp}`,
      ownerId: manager.id,
      setupCompletedAt: new Date(),
    },
    select: { id: true },
  });

  await prisma.user.update({
    where: { id: manager.id },
    data: { organizationId: org.id },
  });

  const token = crypto.randomBytes(24).toString("hex");
  await prisma.userInvite.create({
    data: {
      token,
      email: inviteeEmail,
      role: "USER",
      organizationId: org.id,
      createdById: manager.id,
      managedById: manager.id,
      expiresAt,
      usedAt,
    },
  });

  return NextResponse.json({ token, inviteeEmail });
}
