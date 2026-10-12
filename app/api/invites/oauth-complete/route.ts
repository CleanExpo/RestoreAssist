import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fromException } from "@/lib/api-errors";
import { isUserInviteToken } from "@/lib/public-token-shape";
import { canonicalEmail } from "@/lib/email-identity";

/** Codes the invite page explains (INVITE_ERROR_MESSAGES in app/invite/[token]/page.tsx). */
type InviteOAuthError =
  | "invalid"
  | "signin"
  | "not_found"
  | "used"
  | "expired"
  | "mismatch";

/**
 * This route is the Google sign-in callbackUrl, so it is a full-page
 * navigation: a failure goes back to the invite page with a code the page
 * explains, never a JSON body the invitee would see raw.
 */
function backToInvite(
  req: NextRequest,
  token: string | null,
  error: InviteOAuthError,
): NextResponse {
  const url = req.nextUrl.clone();
  url.pathname = token ? `/invite/${token}` : "/invite/invalid";
  url.search = "";
  url.searchParams.set("error", error);
  return NextResponse.redirect(url, 307);
}

export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get("token") ?? "";
    if (!isUserInviteToken(token)) {
      return backToInvite(req, null, "invalid");
    }

    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return backToInvite(req, token, "signin");
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
      return backToInvite(req, token, "not_found");
    }
    if (invite.usedAt) {
      return backToInvite(req, token, "used");
    }
    if (invite.expiresAt < new Date()) {
      return backToInvite(req, token, "expired");
    }

    if (
      !session.user.email ||
      canonicalEmail(session.user.email) !== canonicalEmail(invite.email)
    ) {
      return backToInvite(req, token, "mismatch");
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
