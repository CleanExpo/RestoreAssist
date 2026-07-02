import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";

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

    const token = req.cookies.get("invite_token")?.value;
    if (!token) {
      return apiError(req, {
        code: "VALIDATION",
        message: "Missing invite token",
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

    // Override the OAuth signup defaults (which assumed this user owns their
    // own org — see lib/auth.ts events.createUser). Bind them to the invited
    // org as a USER. Trial/credits stay intact — technicians still get a trial.
    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        role: invite.role,
        organizationId: invite.organizationId,
        needsOnboarding: false,
      } as any,
    });

    await prisma.userInvite.update({
      where: { id: invite.id },
      data: { usedAt: new Date() },
    });

    const url = req.nextUrl.clone();
    url.pathname = `/invite/${token}`;
    url.searchParams.set("step", "2");
    // Clear the invite_token cookie now that we've used it.
    const response = NextResponse.redirect(url, 307);
    response.cookies.delete("invite_token");
    return response;
  } catch (err) {
    return fromException(req, err, { stage: "oauth-complete:get" });
  }
}
