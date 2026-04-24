import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";

// POST - Create a NextAuth session for Google-authenticated user
// Signs in the user using NextAuth credentials provider (without password for Google users)
export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email) {
      return apiError(request, {
        code: "VALIDATION",
        message: "Email is required",
        status: 400,
      });
    }

    // Verify user exists in database
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "User not found",
        status: 404,
      });
    }

    // Return success - the client will call NextAuth signIn with credentials
    // Using email only (no password) which our updated CredentialsProvider will handle
    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  } catch (error) {
    return fromException(request, error, { stage: "google-session" });
  }
}
