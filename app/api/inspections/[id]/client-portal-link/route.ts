import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertInspectionTenancy } from "@/lib/auth/assert-tenancy";
import { apiError, fromException } from "@/lib/api-errors";
import { sendEmail } from "@/lib/email-send";
import { getAppUrl } from "@/lib/app-url";
import {
  buildClientPortalInviteEmailHtml,
  clientPortalInviteSubject,
} from "@/lib/portal/client-portal-invite-email";

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
        clientId: true,
        propertyAddress: true,
        inspectionNumber: true,
        client: { select: { id: true, email: true, name: true } },
        report: { select: { client: { select: { id: true, email: true, name: true } } } },
        user: {
          select: {
            businessName: true,
            organization: { select: { name: true } },
          },
        },
      },
    });
    const client =
      inspection?.client ??
      inspection?.report?.client ??
      null;
    if (!client?.id || !client.email) {
      return apiError(request, {
        code: "VALIDATION",
        message:
          "This claim has no client email on file — add the client's email first.",
        status: 422,
      });
    }

    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const existing = await prisma.clientPortalAccount.findFirst({
      where: { clientId: client.id, inspectionId: id, revokedAt: null },
      select: { id: true, token: true },
    });
    let token: string;
    if (existing) {
      await prisma.clientPortalAccount.update({
        where: { id: existing.id },
        data: { expiresAt },
      });
      token = existing.token;
    } else {
      token = (
        await prisma.clientPortalAccount.create({
          data: {
            clientId: client.id,
            inspectionId: id,
            token: mintToken(),
            expiresAt,
          },
          select: { token: true },
        })
      ).token;
    }

    const url = `${getAppUrl()}/portal/${token}`;

    const contractorName =
      inspection.user?.organization?.name?.trim() ||
      inspection.user?.businessName?.trim() ||
      "Your restoration team";

    const messageId = await sendEmail({
      to: client.email,
      subject: clientPortalInviteSubject(contractorName),
      html: buildClientPortalInviteEmailHtml({
        url,
        contractorName,
        clientName: client.name,
        inspectionNumber: inspection.inspectionNumber,
        propertyAddress: inspection.propertyAddress,
      }),
    });

    if (messageId) {
      await prisma.auditLog.create({
        data: {
          inspectionId: id,
          userId: session.user.id,
          action: "CLIENT_PORTAL_LINK_EMAILED",
          entityType: "Client",
          entityId: client.id,
          changes: JSON.stringify({
            channel: "email",
            providerMessageId: messageId,
          }),
        },
      });
    }

    return NextResponse.json({
      data: {
        url,
        emailed: Boolean(messageId),
        messageId,
        expiresAt: expiresAt.toISOString(),
      },
    });
  } catch (e) {
    return fromException(request, e);
  }
}
