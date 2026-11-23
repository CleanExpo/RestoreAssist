import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveClientRecipient } from "@/lib/client-recipient";
import { assertInspectionTenancy } from "@/lib/auth/assert-tenancy";
import { apiError, fromException } from "@/lib/api-errors";
import { isDemoOrReservedRecipient } from "@/lib/email/reserved-recipient";
import { sendEmail } from "@/lib/email-send";
import { getAppUrl } from "@/lib/app-url";
import { clearClientSigningLinks } from "@/lib/portal/clear-client-signing-links";
import { portalRecipientHash } from "@/lib/portal/portal-recipient-hash";
import {
  buildClientPortalInviteEmailHtml,
  clientPortalInviteSubject,
} from "@/lib/portal/client-portal-invite-email";

export const dynamic = "force-dynamic";

function mintToken(): string {
  return randomBytes(32).toString("base64url");
}

/** The recipient hash on the newest emailed audit row for this client and job, or null. */
async function lastEmailedRecipientHash(
  inspectionId: string,
  clientId: string,
): Promise<string | null> {
  const last = await prisma.auditLog.findFirst({
    where: {
      inspectionId,
      action: "CLIENT_PORTAL_LINK_EMAILED",
      entityType: "Client",
      entityId: clientId,
    },
    orderBy: { timestamp: "desc" },
    select: { changes: true },
  });
  if (!last?.changes) return null;
  try {
    const parsed = JSON.parse(last.changes) as { recipientHash?: unknown };
    return typeof parsed.recipientHash === "string"
      ? parsed.recipientHash
      : null;
  } catch {
    return null;
  }
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
    if (!inspection) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Inspection not found",
        status: 404,
      });
    }
    const client =
      resolveClientRecipient({
        reportClient: inspection.report?.client,
        inspectionClient: inspection.client,
      })?.client ?? null;
    if (!client?.id || !client.email) {
      return apiError(request, {
        code: "VALIDATION",
        message:
          "This claim has no client email on file — add the client's email first.",
        status: 422,
      });
    }
    if (isDemoOrReservedRecipient(client.email)) {
      return apiError(request, {
        code: "VALIDATION",
        message:
          "This client email is a sample or reserved address and cannot receive a portal link.",
        status: 422,
      });
    }

    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const existing = await prisma.clientPortalAccount.findFirst({
      where: { clientId: client.id, inspectionId: id, revokedAt: null },
      select: { id: true, token: true },
    });
    const currentHash = portalRecipientHash(client.email);
    // RA-8587: reuse the live token only when it was last emailed to the
    // address now on file. A changed or unrecorded address means the old link
    // may sit with the wrong person, so the token is rotated and the signing
    // links it disclosed are cleared (RA-7634), in one transaction.
    const sameRecipient =
      existing !== null &&
      (await lastEmailedRecipientHash(id, client.id)) === currentHash;
    let token: string;
    if (existing && sameRecipient) {
      await prisma.clientPortalAccount.update({
        where: { id: existing.id },
        data: { expiresAt },
      });
      token = existing.token;
    } else if (existing) {
      const clientId = client.id;
      token = await prisma.$transaction(async (tx) => {
        const rotated = await tx.clientPortalAccount.update({
          where: { id: existing.id },
          data: { token: mintToken(), tokenRotatedAt: new Date(), expiresAt },
          select: { token: true },
        });
        await clearClientSigningLinks(tx, clientId);
        return rotated.token;
      });
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
            recipientHash: currentHash,
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

/**
 * RA-8587 — DELETE switches off every live portal link for this job.
 *
 * Same gate as sending (inspection tenancy), so whoever can send the link can
 * switch it off, for this inspection only. Revoked rows stay for audit and
 * `lookupPortalAccount` refuses them. The client's unsigned signing links die
 * with the portal link (RA-7634). The next "Send portal link" mints a new
 * token, because the revoked row no longer matches `revokedAt: null`.
 */
export async function DELETE(
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
    const userId = session.user.id;

    const revoked = await prisma.$transaction(async (tx) => {
      const live = await tx.clientPortalAccount.findMany({
        where: { inspectionId: id, revokedAt: null },
        select: { id: true, clientId: true },
      });
      if (live.length === 0) return 0;
      await tx.clientPortalAccount.updateMany({
        where: { id: { in: live.map((a) => a.id) }, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      for (const clientId of new Set(live.map((a) => a.clientId))) {
        await clearClientSigningLinks(tx, clientId);
      }
      for (const account of live) {
        await tx.auditLog.create({
          data: {
            inspectionId: id,
            userId,
            action: "CLIENT_PORTAL_ACCOUNT_REVOKED",
            entityType: "ClientPortalAccount",
            entityId: account.id,
            changes: JSON.stringify({ clientId: account.clientId }),
          },
        });
      }
      return live.length;
    });

    return NextResponse.json({ data: { revoked } });
  } catch (e) {
    return fromException(request, e);
  }
}
