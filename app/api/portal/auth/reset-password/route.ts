import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limiter";
import { signClientPortalJwt } from "@/lib/portal/client-jwt";

/**
 * POST /api/portal/auth/reset-password — two-step homeowner password reset.
 *
 * Step 1 (check):  { email }                          → { exists }
 * Step 2 (reset):  { email, password, confirmPassword } → { token }
 *
 * NOTE: per product decision this flow does NOT require an emailed
 * verification code — knowing the account email is sufficient to set a new
 * password. The endpoint is tightly rate-limited to slow abuse; adding an
 * emailed one-time code later only touches this route.
 */
export async function POST(request: NextRequest) {
  try {
    const rateLimited = await applyRateLimit(request, {
      maxRequests: 5,
      windowMs: 15 * 60 * 1000,
      prefix: "portal-auth-reset",
    });
    if (rateLimited) return rateLimited;

    const body = await request.json().catch(() => null);
    const email =
      typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const clientUser = await prisma.clientUser.findUnique({
      where: { email },
    });

    // Step 1 — existence check only.
    if (body.password === undefined) {
      return NextResponse.json({ exists: Boolean(clientUser) });
    }

    // Step 2 — set the new password.
    const password = typeof body.password === "string" ? body.password : "";
    const confirmPassword =
      typeof body.confirmPassword === "string" ? body.confirmPassword : "";

    if (!clientUser) {
      return NextResponse.json(
        { error: "No account found for this email" },
        { status: 404 },
      );
    }
    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters long" },
        { status: 400 },
      );
    }
    if (password !== confirmPassword) {
      return NextResponse.json(
        { error: "Passwords do not match" },
        { status: 400 },
      );
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.clientUser.update({
      where: { id: clientUser.id },
      data: {
        passwordHash,
        mustChangePassword: false,
        lastLoginAt: new Date(),
      },
    });

    // Sign the homeowner straight in after a successful reset.
    const token = await signClientPortalJwt({
      clientUserId: clientUser.id,
      clientId: clientUser.clientId,
      email: clientUser.email,
      name: clientUser.name,
    });

    return NextResponse.json({ token });
  } catch (error) {
    console.error("Portal password reset error:", error);
    return NextResponse.json(
      { error: "Failed to reset password" },
      { status: 500 },
    );
  }
}
