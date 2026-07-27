import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limiter";
import { signClientPortalJwt } from "@/lib/portal/client-jwt";

// POST /api/portal/auth/login — homeowner email + password → portal JWT.
export async function POST(request: NextRequest) {
  try {
    const rateLimited = await applyRateLimit(request, {
      maxRequests: 10,
      windowMs: 15 * 60 * 1000,
      prefix: "portal-auth-login",
    });
    if (rateLimited) return rateLimited;

    const body = await request.json().catch(() => null);
    const email =
      typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body?.password === "string" ? body.password : "";

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 },
      );
    }

    const clientUser = await prisma.clientUser.findUnique({
      where: { email },
    });

    // Same response for unknown email and wrong password — no account
    // enumeration through the login endpoint.
    if (
      !clientUser ||
      !(await bcrypt.compare(password, clientUser.passwordHash))
    ) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 },
      );
    }

    await prisma.clientUser.update({
      where: { id: clientUser.id },
      data: { lastLoginAt: new Date() },
    });

    const token = await signClientPortalJwt({
      clientUserId: clientUser.id,
      clientId: clientUser.clientId,
      email: clientUser.email,
      name: clientUser.name,
    });

    return NextResponse.json({
      token,
      clientUser: {
        id: clientUser.id,
        email: clientUser.email,
        name: clientUser.name,
        mustChangePassword: clientUser.mustChangePassword,
      },
    });
  } catch (error) {
    console.error("Portal login error:", error);
    return NextResponse.json({ error: "Failed to sign in" }, { status: 500 });
  }
}
