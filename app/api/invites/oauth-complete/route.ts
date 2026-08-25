import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";
import { isUserInviteToken } from "@/lib/public-token-shape";
import { canonicalEmail } from "@/lib/email-identity";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(req, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    const token = req.nextUrl.searchParams.get("token") ?? "";
    if (!isUserInviteToken(token)) {
      return apiError(req, {
        code: "VALIDATION",
        message: "Missing or invalid invite token",
        status: 400,
      });
    }

    const invite = await prisma.userInvite.findUnique({
      where: { token },
      select: {
        id: true,
        email: true,
        organizationId: true,
        role: true,
        usedAt: true,
        expiresAt: true,
      },
    });

    if (!invite) {
      return apiError(req, {
        code: "NOT_FOUND",
        message: "Invite not found",
        status: 404,
      });
    }
    if (invite.usedAt) {
      return apiError(req, {
        code: "GONE",
        message: "Invite already used",
        status: 410,
      });
    }
    if (invite.expiresAt < new Date()) {
      return apiError(req, {
        code: "GONE",
        message: "Invite expired",
        status: 410,
      });
    }

    if (
      !session.user.email ||
      canonicalEmail(session.user.email) !== canonicalEmail(invite.email)
    ) {
      return apiError(req, {
        code: "FORBIDDEN",
        message: "The signed-in Google account does not match this invitation",
        status: 403,
      });
    }

    // Do not consume or mutate membership here. Step 2 still needs consent and
    // profile data; its authenticated POST performs both writes atomically.
    const url = req.nextUrl.clone();
    url.pathname = `/invite/${token}`;
    url.search = "";
    url.searchParams.set("step", "2");
    return NextResponse.redirect(url, 307);
  } catch (err) {
    return fromException(req, err, { stage: "oauth-complete:get" });
  }
}
