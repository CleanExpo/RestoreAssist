import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertInspectionTenancy } from "@/lib/auth/assert-tenancy";
import { apiError, fromException } from "@/lib/api-errors";
import { sendEmail } from "@/lib/email-send";

/**
 * The "single button" (Client portal Phase 1).
 *
 * Staff action on an inspection → ensure the claim's client has a portal token
 * (ClientPortalAccount, revocable), email them the one /portal/[token] link, and
 * return it for copy. The link is the client's single entry to their claim
 * (status now; evidence upload + authority approvals in later phases).
 *
 * Authed + tenancy-gated. Client is resolved via Report.clientId (Inspection has
 * no direct client). Token: 256-bit, stored verbatim (matches ClientPortalAccount).
 */

export const dynamic = "force-dynamic";

function mintToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Sign in required",
        status: 401,
      });
    }
    const { id } = await params;
    const tenancy = await assertInspectionTenancy(session, id);
    if (!tenancy.ok) {
      return apiError(request, {
        code: tenancy.status === 404 ? "NOT_FOUND" : "FORBIDDEN",
        message: tenancy.reason ?? "Forbidden",
        status: tenancy.status,
      });
    }

    const inspection = await prisma.inspection.findUnique({
      where: { id },
      select: {
        report: { select: { client: { select: { id: true, email: true } } } },
      },
    });
    const client = inspection?.report?.client;
    if (!client?.id || !client.email) {
      return apiError(request, {
        code: "VALIDATION",
        message:
          "This claim has no client email on file — add the client's email first.",
        status: 422,
      });
    }

    // Reuse the client's active portal token if present; else mint one.
    const existing = await prisma.clientPortalAccount.findFirst({
      where: { clientId: client.id, revokedAt: null },
      select: { token: true },
    });
    const token =
      existing?.token ??
      (
        await prisma.clientPortalAccount.create({
          data: { clientId: client.id, token: mintToken() },
          select: { token: true },
        })
      ).token;

    const origin = request.headers.get("origin") ?? "";
    const url = `${origin}/portal/${token}`;

    await sendEmail({
      to: client.email,
      subject: "Your RestoreAssist claim — view and respond",
      html: `<p>Your assessor has shared your claim with you.</p>
<p>Use this secure link to view your claim, add photos, and approve the authorities required:</p>
<p><a href="${url}">${url}</a></p>
<p>If you didn’t expect this, you can ignore this email.</p>`,
    });

    return NextResponse.json({ data: { url, emailed: true } });
  } catch (e) {
    return fromException(request, e);
  }
}
