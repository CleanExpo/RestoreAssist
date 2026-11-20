import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { apiError } from "@/lib/api-errors";
import { isEmailServiceConfigured } from "@/lib/email/resolve-platform-config";

export const dynamic = "force-dynamic";

/** Whether platform Mailtrap (MAILTRAP_API_KEY + SENDER_EMAIL) can send. */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(request, {
      code: "UNAUTHORIZED",
      message: "Sign in required",
      status: 401,
    });
  }

  return NextResponse.json({
    data: { configured: isEmailServiceConfigured() },
  });
}
