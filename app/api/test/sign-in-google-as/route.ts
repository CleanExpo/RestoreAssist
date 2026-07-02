/**
 * TEST-ONLY route — issues a NextAuth session cookie as if Google OAuth
 * completed for the given email. Creates the user row if it doesn't
 * exist (mirroring NextAuth's PrismaAdapter createUser behaviour, minus
 * the post-create flagging — needsOnboarding stays false so middleware
 * doesn't bounce the test).
 *
 * HARD GUARD — returns 404 unless ALLOW_TEST_HELPERS === "true".
 *
 * Body: { email: string }
 * Returns: 200 with set-cookie for the NextAuth session token.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api-errors";
import {
  SESSION_COOKIE_NAME,
  forgeSessionJwt,
  sessionCookieAttributes,
} from "../_helpers";

export async function POST(req: NextRequest) {
  // Vercel preview deploys run with NODE_ENV=production, so we cannot use
  // NODE_ENV to gate. The sandbox Vercel project sets ALLOW_TEST_HELPERS=true;
  // prod does not. Local dev sets it via .env.local for the E2E suite to work.
  // Defense-in-depth (RA-6680): VERCEL_ENV hard-blocks session forging in
  // production even if ALLOW_TEST_HELPERS were ever misconfigured to "true".
  if (
    process.env.ALLOW_TEST_HELPERS !== "true" ||
    process.env.VERCEL_ENV === "production"
  ) {
    return apiError(req, {
      code: "NOT_FOUND",
      message: "Test helpers are not enabled in this environment",
      status: 404,
    });
  }

  let body: { email?: string };
  try {
    body = (await req.json()) as { email?: string };
  } catch {
    body = {};
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (!email) {
    return apiError(req, {
      code: "VALIDATION",
      message: "email is required",
      status: 400,
    });
  }

  let user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, role: true },
  });

  if (!user) {
    const created = await prisma.user.create({
      data: {
        email,
        name: email.split("@")[0],
        role: "USER",
        emailVerified: new Date(),
      },
      select: { id: true, email: true, role: true },
    });
    user = created;
  }

  const jwt = await forgeSessionJwt({
    userId: user.id,
    email: user.email,
    role: (user.role as "USER" | "ADMIN" | "MANAGER") ?? "USER",
    setupCompletedAt: new Date(),
  });

  const res = NextResponse.json({ ok: true, userId: user.id });
  res.headers.set(
    "set-cookie",
    `${SESSION_COOKIE_NAME}=${jwt}; ${sessionCookieAttributes()}`,
  );
  return res;
}
