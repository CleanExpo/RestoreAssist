/**
 * TEST-ONLY route — issues a NextAuth session cookie for a deterministic
 * test user of the given role. Creates the user (and a stub Organization
 * with setupCompletedAt set) if it doesn't yet exist, so middleware
 * doesn't bounce the caller to /setup.
 *
 * HARD GUARD — returns 404 unless NODE_ENV !== "production".
 *
 * Body: { role: "USER" | "ADMIN" | "MANAGER" }
 * Returns: 200 with set-cookie for the NextAuth session token.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  SESSION_COOKIE_NAME,
  forgeSessionJwt,
  sessionCookieAttributes,
} from "../_helpers";

type Role = "USER" | "ADMIN" | "MANAGER";

const TEST_USER_EMAIL: Record<Role, string> = {
  USER: "test-user@test.local",
  ADMIN: "test-admin@test.local",
  MANAGER: "test-manager@test.local",
};

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "Not available in production" },
      { status: 404 },
    );
  }

  let body: { role?: string };
  try {
    body = (await req.json()) as { role?: string };
  } catch {
    body = {};
  }

  const role = body.role;
  if (role !== "USER" && role !== "ADMIN" && role !== "MANAGER") {
    return NextResponse.json(
      { error: "role must be one of USER | ADMIN | MANAGER" },
      { status: 400 },
    );
  }

  const email = TEST_USER_EMAIL[role];

  let user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, organizationId: true },
  });

  if (!user) {
    const created = await prisma.user.create({
      data: {
        name: `Test ${role}`,
        email,
        role,
      },
      select: { id: true, email: true, organizationId: true },
    });
    user = created;
  }

  // Attach a stub org with setupCompletedAt so the setup-wizard middleware
  // doesn't redirect to /setup mid-test.
  if (!user.organizationId) {
    const org = await prisma.organization.create({
      data: {
        name: `Test Org for ${role}`,
        ownerId: user.id,
        setupCompletedAt: new Date(),
      },
      select: { id: true },
    });
    await prisma.user.update({
      where: { id: user.id },
      data: { organizationId: org.id },
    });
  }

  const jwt = await forgeSessionJwt({
    userId: user.id,
    email: user.email,
    role,
    setupCompletedAt: new Date(),
  });

  const res = NextResponse.json({ ok: true, userId: user.id });
  res.headers.set(
    "set-cookie",
    `${SESSION_COOKIE_NAME}=${jwt}; ${sessionCookieAttributes()}`,
  );
  return res;
}
