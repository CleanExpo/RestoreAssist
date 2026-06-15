/**
 * TEST-ONLY route — issues a NextAuth session cookie for a deterministic
 * test user of the given role. Creates the user (and a stub Organization
 * with setupCompletedAt set) if it doesn't yet exist, so middleware
 * doesn't bounce the caller to /setup.
 *
 * HARD GUARD — returns 404 unless ALLOW_TEST_HELPERS === "true".
 *
 * Body: { role: "USER" | "ADMIN" | "MANAGER", email?, setupCompletedAt? }
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
  // Vercel preview deploys run with NODE_ENV=production, so we cannot use
  // NODE_ENV to gate. The sandbox Vercel project sets ALLOW_TEST_HELPERS=true;
  // prod does not. Local dev sets it via .env.local for the E2E suite to work.
  // Defense-in-depth (RA-6680): even if ALLOW_TEST_HELPERS were ever true in a
  // production deploy (or a preview alias pointed at prod data), VERCEL_ENV
  // hard-blocks session forging in production — a single env-var misconfig must
  // not be enough to mint an ADMIN cookie.
  if (
    process.env.ALLOW_TEST_HELPERS !== "true" ||
    process.env.VERCEL_ENV === "production"
  ) {
    return NextResponse.json(
      { error: "Test helpers are not enabled in this environment" },
      { status: 404 },
    );
  }

  let body: { role?: string; email?: string; setupCompletedAt?: unknown };
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

  const email =
    typeof body.email === "string" && body.email.includes("@")
      ? body.email
      : TEST_USER_EMAIL[role];
  const setupCompletedAt =
    body.setupCompletedAt === null || body.setupCompletedAt === false
      ? null
      : new Date();

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
        // RC6: pre-dismiss the in-app product tour so its modal doesn't
        // occlude the IICRC banner / other dashboard surfaces in E2E specs.
        productTourDismissedAt: new Date(),
      },
      select: { id: true, email: true, organizationId: true },
    });
    user = created;
  } else {
    // RC6: idempotently re-assert the dismissal flag for test users that
    // pre-date this fix (or had the field cleared by another test).
    await prisma.user.update({
      where: { id: user.id },
      data: { productTourDismissedAt: new Date() },
    });
  }

  // Attach a stub org with setupCompletedAt so the setup-wizard middleware
  // doesn't redirect to /setup mid-test.
  if (!user.organizationId) {
    const org = await prisma.organization.create({
      data: {
        name: `Test Org for ${role}`,
        ownerId: user.id,
        setupCompletedAt,
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
    setupCompletedAt,
  });

  const res = NextResponse.json({ ok: true, userId: user.id });
  res.headers.set(
    "set-cookie",
    `${SESSION_COOKIE_NAME}=${jwt}; ${sessionCookieAttributes()}`,
  );
  return res;
}
