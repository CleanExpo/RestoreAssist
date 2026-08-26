import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";
import { isEmailServiceConfigured } from "@/lib/email/resolve-platform-config";

async function requireOrgOwner(sessionUserId: string) {
  const user = await prisma.user.findUnique({
    where: { id: sessionUserId },
    select: { organizationId: true, role: true },
  });
  if (!user?.organizationId) return null;
  const org = await prisma.organization.findUnique({
    where: { id: user.organizationId },
    select: {
      id: true,
      ownerId: true,
      emailProvider: true,
      emailFromAddress: true,
      emailProviderEncryptedKey: true,
    },
  });
  if (!org) return null;
  if (org.ownerId !== sessionUserId && user.role !== "ADMIN") return null;
  return org;
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(request, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }

  try {
    const org = await requireOrgOwner(session.user.id);
    if (!org) {
      return apiError(request, {
        code: "FORBIDDEN",
        message: "Organization email settings require owner access",
        status: 403,
      });
    }

    const leftoverResend =
      org.emailProvider === "RESEND" && !!org.emailProviderEncryptedKey;

    return NextResponse.json({
      connected: leftoverResend,
      provider: leftoverResend ? org.emailProvider : "MAILTRAP",
      fromAddress: org.emailFromAddress,
      hasPlatformFallback: isEmailServiceConfigured(),
    });
  } catch (error) {
    return fromException(request, error, { stage: "email-settings-get" });
  }
}

export async function PUT(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(request, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }

  return apiError(request, {
    code: "GONE",
    message:
      "Bring-your-own Resend keys are no longer supported. Outbound email uses Mailtrap.",
    status: 410,
  });
}

export async function DELETE(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(request, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }

  try {
    const org = await requireOrgOwner(session.user.id);
    if (!org) {
      return apiError(request, {
        code: "FORBIDDEN",
        message: "Organization email settings require owner access",
        status: 403,
      });
    }

    await prisma.organization.update({
      where: { id: org.id },
      data: {
        emailProvider: null,
        emailProviderEncryptedKey: null,
        emailFromAddress: null,
      },
    });

    return NextResponse.json({ connected: false });
  } catch (error) {
    return fromException(request, error, { stage: "email-settings-delete" });
  }
}
