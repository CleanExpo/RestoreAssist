import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { withIdempotency } from "@/lib/idempotency";
import { apiError } from "@/lib/api-errors";

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(request, {
      code: "UNAUTHORIZED",
      message: "Unauthorised",
      status: 401,
    });
  }
  const userId = session.user.id;

  // RA-1266: idempotency spares the double-bcrypt cost on retry and keeps
  // the "wrong current password" response cached for the retry window,
  // so the user gets the same 400 instead of a fresh compare each time.
  return withIdempotency(request, userId, async (rawBody) => {
    let parsed: { currentPassword?: string; newPassword?: string } = {};
    try {
      parsed = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      return apiError(request, {
        code: "VALIDATION",
        message: "Invalid JSON body",
        status: 400,
      });
    }
    const { currentPassword, newPassword } = parsed;

    if (!currentPassword || !newPassword) {
      return apiError(request, {
        code: "VALIDATION",
        message: "Missing fields",
        status: 400,
      });
    }
    if (newPassword.length < 8) {
      return apiError(request, {
        code: "VALIDATION",
        message: "New password must be at least 8 characters",
        status: 400,
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, password: true },
    });

    if (!user?.password) {
      return apiError(request, {
        code: "VALIDATION",
        message: "Cannot change password for OAuth accounts",
        status: 400,
      });
    }

    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) {
      return apiError(request, {
        code: "VALIDATION",
        message: "Current password is incorrect",
        status: 400,
      });
    }

    const hashed = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: userId },
      data: { password: hashed },
    });

    return NextResponse.json({ success: true });
  });
}
