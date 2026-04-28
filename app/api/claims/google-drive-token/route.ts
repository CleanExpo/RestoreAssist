/**
 * API Route: Get Google Drive OAuth token for Picker
 * Returns the current user's Google access token (from NextAuth) for use with Google Picker.
 * User must have signed in with Google (with Drive scope) to get a token.
 */

import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { apiError, fromException } from "@/lib/api-errors";

export async function GET(request: NextRequest) {
  try {
    const token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
    });

    if (!token?.sub) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    const accessToken = (token as { googleAccessToken?: string })
      .googleAccessToken;

    if (!accessToken) {
      return NextResponse.json(
        {
          error: "Google Drive not connected",
          message:
            'Sign in with Google to browse your Drive. Use "Sign in with Google" on the login page, then open this picker again.',
        },
        { status: 403 },
      );
    }

    return NextResponse.json({ accessToken });
  } catch (err) {
    return fromException(request, err, { stage: "load" });
  }
}
